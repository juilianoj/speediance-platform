import { Entity } from 'electrodb';
import type { EntityConfiguration } from 'electrodb';

/**
 * MCP API key — opaque bearer token a user can mint on /profile and paste
 * into Claude Desktop's `mcpServers` config (remote / HTTP mode).
 *
 * Two physical rows back a single logical key, written together by
 * `apiKeys.put` and torn down together by `apiKeys.delete`:
 *
 *   1. **User-owned row** — so /profile can list / revoke the key and so
 *      we keep an audit trail per user.
 *
 *        PK = USER#{userId}    SK = APIKEY
 *
 *      Attrs: { key, prefix, createdAt }. Stored verbatim because DDB
 *      access is already perimeter-secured via IAM and this is an MVP —
 *      if we ever go enterprise we'll hash with HKDF and store the prefix
 *      + a verifier, and rotate this attribute to `keyHash`.
 *
 *   2. **Reverse-lookup row** — the HTTP handler's O(1) path from a
 *      presented bearer token to the owning userId. We store the FULL key
 *      as the partition key because that's the lookup path (GetItem by PK).
 *
 *        PK = APIKEY#{key}     SK = KEY_LOOKUP
 *
 *      Attrs: { userId, createdAt }. No user data; just the back-reference.
 *
 * Single key per user (v1). Rotation = generate-new, the old one stops
 * working. Both rows are deleted before the new ones are written.
 *
 * Logging: NEVER log the `key` attribute. Surface only `prefix`
 * ("spd_xxxxxxxx") in CloudWatch — see `redactKey()` in the HTTP handler.
 */
export function apiKeyEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'apiKey', service: 'speediance', version: '1' },
      attributes: {
        userId: { type: 'string', required: true, readOnly: true },
        /** Full opaque secret. `spd_` + 32 url-safe base64 chars. */
        key: { type: 'string', required: true, readOnly: true },
        /** First 12 chars of `key` (`spd_xxxxxxxx`), safe to display + log. */
        prefix: { type: 'string', required: true },
        createdAt: { type: 'string', required: true, readOnly: true },
      },
      indexes: {
        primary: {
          pk: {
            field: 'pk',
            composite: ['userId'],
            template: 'USER#${userId}',
            casing: 'none',
          },
          sk: {
            field: 'sk',
            composite: [],
            template: 'APIKEY',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type ApiKeyEntity = ReturnType<typeof apiKeyEntity>;

/**
 * Reverse-lookup row. Keyed by the full key value so the HTTP handler can
 * resolve `Authorization: Bearer <key>` to a userId in a single GetItem.
 *
 *   PK = APIKEY#{key}     SK = KEY_LOOKUP
 */
export function apiKeyLookupEntity(config: EntityConfiguration) {
  return new Entity(
    {
      model: { entity: 'apiKeyLookup', service: 'speediance', version: '1' },
      attributes: {
        key: { type: 'string', required: true, readOnly: true },
        userId: { type: 'string', required: true },
        createdAt: { type: 'string', required: true },
      },
      indexes: {
        primary: {
          pk: {
            field: 'pk',
            composite: ['key'],
            template: 'APIKEY#${key}',
            casing: 'none',
          },
          sk: {
            field: 'sk',
            composite: [],
            template: 'KEY_LOOKUP',
            casing: 'none',
          },
        },
      },
    } as const,
    config,
  );
}

export type ApiKeyLookupEntity = ReturnType<typeof apiKeyLookupEntity>;
