export { SpeedianceClient } from './client.js';
export type {
  LoginResult,
  SaveWorkoutExercise,
  SaveWorkoutSet,
  ActionLibraryGroup,
} from './client.js';
export { buildHeaders, baseUrl, request } from './http.js';
export {
  REGION_HOSTS,
  VERSION_CODE,
  USER_AGENT,
  MOBILE_DEVICES,
  UNAUTHORIZED_CODE,
  SpeedianceApiError,
  SpeedianceUnauthorizedError,
  SpeedianceEnvelopeSchema,
} from './types.js';
export type {
  ClientOptions,
  Credentials,
  Region,
  RequestDebugInfo,
  SpeedianceEnvelope,
} from './types.js';
