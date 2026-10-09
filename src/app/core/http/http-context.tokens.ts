import { HttpContextToken } from '@angular/common/http';

/** Do not attach the bearer token (public auth endpoints). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

/** Let the caller handle 401 instead of the global session-expiry flow. */
export const SKIP_UNAUTHORIZED_HANDLER = new HttpContextToken<boolean>(() => false);
