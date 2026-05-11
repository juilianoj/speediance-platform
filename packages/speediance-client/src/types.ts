import { z } from 'zod';

export type Region = 'Global' | 'EU';

export const REGION_HOSTS: Record<Region, string> = {
  Global: 'api2.speediance.com',
  EU: 'euapi.speediance.com',
};

/** Mobile-app build the official client identifies as. Speediance gates some
 *  endpoints on a minimum value; bumping this is the first thing to try if
 *  requests start returning `code: 91`. */
export const VERSION_CODE = '40304';

/** The User-Agent + Mobiledevices spoof the official Android app emits.
 *  Both are required — Speediance returns 403 if Mobiledevices is missing. */
export const USER_AGENT = 'Dart/3.9 (dart:io)';
export const MOBILE_DEVICES = JSON.stringify({
  brand: 'google',
  device: 'emulator64_x86_64_arm64',
  deviceType: 'sdk_gphone64_x86_64',
  os: '',
  os_version: '31',
  manufacturer: 'Google',
});

/** Application-level "unauthorized" sentinel. The HTTP status can be 200
 *  while the response body carries `code: 91`. Treat both as auth failures. */
export const UNAUTHORIZED_CODE = 91;

export interface Credentials {
  userId: string;
  token: string;
  region: Region;
  unit: 0 | 1;
  deviceType: number;
  allowMonsterMoves: boolean;
}

export interface ClientOptions {
  region?: Region;
  deviceType?: number;
  allowMonsterMoves?: boolean;
  /** Inject a custom fetch (for tests / non-browser environments).
   *  Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Capture debug info about the last request — useful for the admin panel. */
  onRequest?: (debug: RequestDebugInfo) => void;
  /** Called when the server returns code:91 or HTTP 401. The handler may
   *  refresh credentials in place; if it returns true, the request is retried
   *  once. If it returns false / throws, the original error propagates. */
  onUnauthorized?: () => Promise<boolean>;
}

export interface RequestDebugInfo {
  timestamp: string;
  method: string;
  url: string;
  status?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

/** Wire format the Speediance API returns. Bodies are always wrapped — the
 *  `data` field is the payload, `code` is the application status, `msg` is
 *  the human-readable message. */
export const SpeedianceEnvelopeSchema = z.object({
  code: z.number().optional(),
  msg: z.string().optional(),
  data: z.unknown().optional(),
});

export type SpeedianceEnvelope = z.infer<typeof SpeedianceEnvelopeSchema>;

export class SpeedianceUnauthorizedError extends Error {
  constructor(public readonly status?: number) {
    super('Speediance: unauthorized (code 91 or HTTP 401)');
    this.name = 'SpeedianceUnauthorizedError';
  }
}

export class SpeedianceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'SpeedianceApiError';
  }
}
