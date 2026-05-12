import 'server-only';
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
}

/** Fetches the user's Profile DDB item, or null if not yet created.
 *  Wrapped here so the Server Component can stay clean. */
export async function loadProfile(userId: string): Promise<LoadedProfile | null> {
  const tableName = process.env.DYNAMO_TABLE_NAME;
  if (!tableName) return null;
  const db = createDb({ tableName });
  const me = db.forUser(userId);
  const result = (await me.profiles.get()) as { data: LoadedProfile | null } | null;
  return result?.data ?? null;
}
