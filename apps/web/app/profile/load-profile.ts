import 'server-only';

import { cache } from 'react';

import { createDb } from '@speediance/db';

/** Shape we surface to the Profile page from the existing DynamoDB profile.
 *  Kept loose because ElectroDB's typed returns are complex and the page
 *  only needs a handful of fields. */
export interface LoadedProfile {
  email?: string;
  bodyweight?: number;
  unit?: number;
  gender?: 'male' | 'female';
  region?: 'Global' | 'EU';
  deviceType?: number;
  allowMonsterMoves?: boolean;
  syncStartDate?: string;
  speedianceSecretArn?: string;
  /** When true, the user has opted out of the Cardio nav item + page. We
   *  don't have cardio data unless they've connected Apple Health / Google
   *  Fit to Speediance, so we let them hide the empty section. */
  hideCardio?: boolean;
}

/** Fetches the user's Profile DDB item, or null if not yet created.
 *  React.cache() makes this free for repeat calls within a single request —
 *  Nav calls it on every authed page and other loaders call it too. */
export const loadProfile = cache(async (userId: string): Promise<LoadedProfile | null> => {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return null;
  const db = createDb({ tableName });
  const me = db.forUser(userId);
  const result = (await me.profiles.get()) as { data: LoadedProfile | null } | null;
  return result?.data ?? null;
});
