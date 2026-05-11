import { baseUrl, buildHeaders, request } from './http.js';
import {
  type ClientOptions,
  type Credentials,
  type Region,
  type RequestDebugInfo,
  SpeedianceUnauthorizedError,
} from './types.js';

export interface LoginResult {
  ok: boolean;
  reason?: string;
  detail?: string;
  credentials?: Credentials;
}

export interface SaveWorkoutSet {
  reps: number;
  weight: number;
  /** Speediance "mode" int — 1 = lift, others map to cardio profiles. */
  mode?: number;
  rest?: number;
  unit?: 'reps' | 'sec';
}

export interface SaveWorkoutExercise {
  groupId: number;
  /** -1 for custom; a positive id targets a preset Speediance variant. */
  preset_id?: number;
  variant_id?: number;
  sets: SaveWorkoutSet[];
}

interface ExerciseDetailResponse {
  isLeftRight?: 0 | 1;
  actionLibraryList?: Array<{ id: number }>;
}

/** Minimal shape returned by `actionLibraryGroup/list`. The hbui3 client
 *  pulls only `id` + `actionLibraryList[0].id` (the "real variant id") from
 *  it — everything else is opaque category metadata we forward as-is. */
export interface ActionLibraryGroup {
  id: number;
  actionLibraryList?: Array<{ id: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * TypeScript port of hbui3's `SpeedianceClient`. Differences from the Python
 * original, by design:
 *
 *   - No file-backed config. Callers supply credentials and persist them
 *     wherever they want (Secrets Manager in our case).
 *   - No library-cache file. We'll add a pluggable cache interface later if
 *     it's needed; the Phase-1 sync worker hits the API once per run.
 *   - No `last_debug_info` field. Use the `onRequest` callback to capture
 *     debug info per call — works the same for the admin panel without
 *     piling mutable state onto the client instance.
 *
 * Endpoint signatures otherwise mirror the Python implementation 1:1 so it
 * remains a useful reference (and bug-fix donor).
 */
export class SpeedianceClient {
  private credentials: Credentials | null;
  private readonly region: Region;
  private readonly deviceType: number;
  private readonly allowMonsterMoves: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly onRequest?: (debug: RequestDebugInfo) => void;
  private readonly onUnauthorized?: () => Promise<boolean>;

  constructor(credentials: Credentials | null, options: ClientOptions = {}) {
    this.credentials = credentials;
    this.region = options.region ?? credentials?.region ?? 'Global';
    this.deviceType = options.deviceType ?? credentials?.deviceType ?? 1;
    this.allowMonsterMoves = options.allowMonsterMoves ?? credentials?.allowMonsterMoves ?? false;
    if (!options.fetch && typeof fetch === 'undefined') {
      throw new Error('No fetch implementation available; pass options.fetch.');
    }
    this.fetchImpl = options.fetch ?? (globalThis.fetch.bind(globalThis) as typeof fetch);
    this.onRequest = options.onRequest;
    this.onUnauthorized = options.onUnauthorized;
  }

  getCredentials(): Credentials | null {
    return this.credentials;
  }

  setCredentials(credentials: Credentials | null): void {
    this.credentials = credentials;
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private headers(authenticated = true): Record<string, string> {
    return buildHeaders({
      region: this.region,
      credentials: authenticated ? (this.credentials ?? undefined) : undefined,
    });
  }

  private url(path: string): string {
    return `${baseUrl(this.region)}${path}`;
  }

  /** Wraps an authenticated call so a `code:91`/401 triggers the optional
   *  re-login hook and retries once. */
  private async authed<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof SpeedianceUnauthorizedError && this.onUnauthorized) {
        const refreshed = await this.onUnauthorized();
        if (refreshed) {
          return call();
        }
      }
      throw err;
    }
  }

  private async req<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    { body, authenticated = true }: { body?: unknown; authenticated?: boolean } = {},
  ): Promise<T> {
    const exec = async (): Promise<T> => {
      const { data } = await request<T>({
        method,
        url: this.url(path),
        headers: this.headers(authenticated),
        body,
        fetchImpl: this.fetchImpl,
        onRequest: this.onRequest,
      });
      return data;
    };
    return authenticated ? this.authed(exec) : exec();
  }

  // ── Auth ──────────────────────────────────────────────────────────

  /** Two-step login: verifyIdentity → byPass (password). Returns either a
   *  populated Credentials block or a structured failure reason. */
  async login(email: string, password: string): Promise<LoginResult> {
    const headers = this.headers(false);
    const verify = await request<{ isExist?: boolean; hasPwd?: boolean }>({
      method: 'POST',
      url: this.url('/api/app/v2/login/verifyIdentity'),
      headers,
      body: { type: 2, userIdentity: email },
      fetchImpl: this.fetchImpl,
      onRequest: this.onRequest,
    });

    if (verify.data?.isExist === false) {
      return {
        ok: false,
        reason: 'Account does not exist. Register in the Speediance mobile app first.',
      };
    }
    if (verify.data?.hasPwd === false) {
      return {
        ok: false,
        reason: 'Account exists but has no password set. Set one in the mobile app.',
      };
    }

    const bypass = await request<{ token?: string; appUserId?: number | string }>({
      method: 'POST',
      url: this.url('/api/app/v2/login/byPass'),
      headers,
      body: { userIdentity: email, password, type: 2 },
      fetchImpl: this.fetchImpl,
      onRequest: this.onRequest,
    });

    const token = bypass.data?.token;
    const userId = bypass.data?.appUserId;
    if (!token || userId === undefined || userId === null) {
      return {
        ok: false,
        reason: 'Token or appUserId missing from byPass response.',
        detail: JSON.stringify(bypass.body),
      };
    }

    const credentials: Credentials = {
      userId: String(userId),
      token,
      region: this.region,
      unit: 0,
      deviceType: this.deviceType,
      allowMonsterMoves: this.allowMonsterMoves,
    };
    this.credentials = credentials;
    return { ok: true, credentials };
  }

  async logout(): Promise<void> {
    try {
      await this.req('POST', '/api/app/login/logout');
    } catch {
      // Network or auth failures here are non-fatal — the caller is going to
      // discard creds either way.
    }
    this.credentials = null;
  }

  // ── Library / exercises ───────────────────────────────────────────

  /** GET /api/app/actionLibraryTab/list?deviceType={n}
   *  Used directly when allowMonsterMoves=false; otherwise see `getLibrary`. */
  async getCategoriesForDevice(deviceType: number): Promise<ActionLibraryGroup[]> {
    return this.req<ActionLibraryGroup[]>(
      'GET',
      `/api/app/actionLibraryTab/list?deviceType=${deviceType}`,
    );
  }

  async getExerciseDetail(exerciseId: number): Promise<ExerciseDetailResponse> {
    return this.req<ExerciseDetailResponse>(
      'GET',
      `/api/app/actionLibraryGroup/${exerciseId}?isDisplay=1`,
    );
  }

  async isExerciseUnilateral(groupId: number): Promise<boolean> {
    const detail = await this.getExerciseDetail(groupId);
    return detail.isLeftRight === 1;
  }

  async getBatchDetails(groupIds: number[]): Promise<ActionLibraryGroup[]> {
    if (groupIds.length === 0) return [];
    const query = groupIds.map((id) => `ids=${id}`).join('&');
    return this.req<ActionLibraryGroup[]>('GET', `/api/app/actionLibraryGroup/list?${query}`);
  }

  async getUserActionStats(groupId: number, page = 1, size = 12): Promise<unknown> {
    // userActionStatPage returns the FULL envelope (not just .data) in the
    // Python client; we keep that behaviour by hitting `req` indirectly.
    const { body } = await request<unknown>({
      method: 'GET',
      url: this.url(
        `/api/app/actionLibraryGroup/userActionStatPage?id=${groupId}&pageNo=${page}&pageSize=${size}`,
      ),
      headers: this.headers(),
      fetchImpl: this.fetchImpl,
      onRequest: this.onRequest,
    });
    return body;
  }

  // ── Workouts (custom templates) ────────────────────────────────────

  async getUserWorkouts(): Promise<unknown[]> {
    return this.req<unknown[]>(
      'GET',
      `/api/app/v4/customTrainingTemplate/appPage?pageNo=1&pageSize=-1&deviceTypes=${this.deviceType}`,
    );
  }

  async getWorkoutDetail(code: string | number): Promise<unknown> {
    return this.req<unknown>(
      'GET',
      `/api/app/v3/customTrainingTemplate/detailByCode?code=${encodeURIComponent(String(code))}`,
    );
  }

  async deleteWorkout(templateId: number | string): Promise<void> {
    await this.req('DELETE', `/api/app/customTrainingTemplate?ids=${templateId}`);
  }

  /** Calendar month view. `dateStr` is `YYYY-MM`. */
  async getCalendarMonth(dateStr: string): Promise<unknown[]> {
    return this.req<unknown[]>(
      'GET',
      `/api/app/v5/trainingCalendar/monthNew?date=${dateStr}&selectedDeviceType=${this.deviceType}`,
    );
  }

  /** status: 1 to add, 0 to remove */
  async scheduleWorkout(
    dateStr: string,
    templateCode: string | number,
    status: 0 | 1,
  ): Promise<boolean> {
    const result = await this.req<boolean | null>('POST', '/api/app/templateReservation', {
      body: {
        status,
        deviceType: this.deviceType,
        thatDay: dateStr,
        templateCode,
      },
    });
    return result ?? false;
  }

  async scheduleCourse(
    dateStr: string,
    courseId: number | string,
    status: 0 | 1,
  ): Promise<boolean> {
    const result = await this.req<boolean | null>('POST', '/api/app/courseReservation', {
      body: {
        status,
        deviceType: this.deviceType,
        thatDay: dateStr,
        courseId,
      },
    });
    return result ?? false;
  }

  // ── Training history (the meat of the sync worker) ─────────────────

  /** GET /api/mobile/v2/report/userTrainingDataRecord */
  async getTrainingRecords(startDate: string, endDate: string): Promise<unknown[]> {
    return this.req<unknown[]>(
      'GET',
      `/api/mobile/v2/report/userTrainingDataRecord?startDate=${startDate}&endDate=${endDate}`,
    );
  }

  /** GET /api/mobile/v2/report/userTrainingDataStat */
  async getTrainingStats(startDate: string, endDate: string): Promise<unknown> {
    return this.req<unknown>(
      'GET',
      `/api/mobile/v2/report/userTrainingDataStat?startDate=${startDate}&endDate=${endDate}`,
    );
  }

  /** Course sessions vs. custom-template sessions use different detail
   *  endpoints. The Python client uses the literal string 'course' as the
   *  course discriminator; everything else is treated as custom. */
  async getTrainingDetail(
    trainingId: number | string,
    trainingType: 'course' | 'custom' | string,
  ): Promise<unknown> {
    const path =
      trainingType === 'course'
        ? `/api/app/trainingInfo/courseTrainingInfoDetail/${trainingId}`
        : `/api/app/trainingInfo/cttTrainingInfoDetail/${trainingId}`;
    return this.req<unknown>('GET', path);
  }

  async getTrainingSessionInfo(trainingId: number | string): Promise<unknown> {
    return this.req<unknown>('GET', `/api/app/trainingInfo/courseTrainingInfo/${trainingId}`);
  }

  // ── Browse: courses & programs ────────────────────────────────────

  async getCoursesPage(page = 1, pageSize = 200): Promise<unknown[]> {
    const data = await this.req<unknown[] | null>(
      'GET',
      `/api/app/v2/course/page?pageNo=${page}&pageSize=${pageSize}`,
    );
    return Array.isArray(data) ? data : [];
  }

  async getCourseDetail(courseId: number | string): Promise<unknown> {
    return this.req<unknown>('GET', `/api/app/v2/course/info/${courseId}?weightConfig=1`);
  }

  async getProgramsPage(page = 1, pageSize = 200): Promise<unknown[]> {
    const data = await this.req<unknown[] | null>(
      'GET',
      `/api/mobile/exclusivePlan/page?pageNo=${page}&pageSize=${pageSize}`,
    );
    return Array.isArray(data) ? data : [];
  }

  async getProgramDetail(planId: number | string): Promise<unknown> {
    return this.req<unknown>('GET', `/api/app/exclusivePlan/${planId}`);
  }

  // ── Accessories / profile bits ────────────────────────────────────

  async getAccessories(): Promise<unknown[]> {
    return this.req<unknown[]>('GET', '/api/app/accessories/list');
  }

  /** PUT /api/app/userinfo. The official client mirrors local config; we
   *  return only the API response and let the caller persist. */
  async updateUnit(unit: 0 | 1): Promise<unknown> {
    return this.req<unknown>('PUT', '/api/app/userinfo', { body: { unit } });
  }

  // ── Saving / updating workouts ────────────────────────────────────

  /** Build & POST a custom training template. Mirrors the Python
   *  `save_workout` payload exactly — see the original for the wire-format
   *  rationale (dummy weights, dual breakTime fields, etc.). */
  async saveWorkout(
    name: string,
    exercises: SaveWorkoutExercise[],
    templateId?: number,
  ): Promise<unknown> {
    const groupIds = Array.from(new Set(exercises.map((ex) => ex.groupId)));
    const details = await this.getBatchDetails(groupIds);

    const idMap = new Map<string, number>();
    for (const d of details) {
      const list = d.actionLibraryList;
      if (list && list.length > 0) {
        const first = list[0];
        if (first) idMap.set(String(d.id), first.id);
      }
    }

    const unilateralCheck = new Map<number, boolean>();
    for (const gid of groupIds) {
      unilateralCheck.set(gid, await this.isExerciseUnilateral(gid));
    }

    let totalCapacity = 0;
    const actionLibraryList: Array<Record<string, unknown>> = [];

    for (const ex of exercises) {
      const groupId = Number(ex.groupId);
      const presetId = Number(ex.preset_id ?? -1);
      const isUnilateral = unilateralCheck.get(groupId) ?? false;

      const userVariantId = ex.variant_id;
      const realVariantId =
        userVariantId !== undefined && userVariantId !== null && /^\d+$/.test(String(userVariantId))
          ? Number(userVariantId)
          : idMap.get(String(ex.groupId));
      if (!realVariantId) continue;

      const repsList: string[] = [];
      const weightsList: string[] = [];
      const counterList: string[] = [];
      const breakList: string[] = [];
      const modeList: string[] = [];
      const leftRightList: string[] = [];
      const levelList: string[] = [];
      const completionList: string[] = [];
      const completionMethodList: string[] = [];
      const countTypeList: string[] = [];

      let setCapacity = 0;
      ex.sets.forEach((s, i) => {
        const reps = Math.trunc(Number(s.reps ?? 0));
        const weight = Number(s.weight ?? 0);
        const mode = Math.trunc(Number(s.mode ?? 1));
        const rest = Math.trunc(Number(s.rest ?? 60));
        const unit = (s.unit ?? 'reps').toLowerCase();

        leftRightList.push(isUnilateral ? (i % 2 === 0 ? '1' : '2') : '0');
        repsList.push(String(reps));
        breakList.push(String(rest));
        modeList.push(String(mode));
        levelList.push('0');

        if (unit === 'sec') {
          completionMethodList.push('2');
          countTypeList.push('2');
        } else {
          completionMethodList.push('1');
          countTypeList.push('1');
        }
        completionList.push('1');

        if (presetId === -1) {
          const apiWeight = weight * 2.2;
          weightsList.push(apiWeight.toFixed(1));
          setCapacity += reps * apiWeight;
        } else {
          // Preset path: weights field carries a dummy value, the real RM
          // goes in counterweight2. See Python client's save_workout for
          // why both must be sent.
          weightsList.push('3.5');
          counterList.push(String(Math.trunc(weight)));
          setCapacity += reps * weight * 2.2;
        }
      });

      totalCapacity += setCapacity;
      const finalCounter = presetId !== -1 ? counterList.join(',') : '';

      actionLibraryList.push({
        groupId,
        actionLibraryId: realVariantId,
        templatePresetId: presetId,
        setsAndReps: repsList.join(','),
        breakTime: breakList.join(','),
        breakTime2: breakList.join(','),
        sportMode: modeList.join(','),
        leftRight: leftRightList.join(','),
        selectCompletionMethod: completionList.join(','),
        completionMethod: completionMethodList.join(','),
        countType: countTypeList.join(','),
        weights: weightsList.join(','),
        counterweight2: finalCounter,
        counterweight: finalCounter,
        level: levelList.join(','),
        capacity: setCapacity,
      });
    }

    const payload: Record<string, unknown> = {
      name,
      actionLibraryList,
      totalCapacity,
      deviceType: this.deviceType,
      bgColor: 0,
    };
    if (templateId !== undefined) payload.id = Number(templateId);

    return this.req<unknown>('POST', '/api/app/v2/customTrainingTemplate', { body: payload });
  }
}
