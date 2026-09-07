export const SESSION_COOKIE_NAME = 'wa_session';

/**
 * Sets the lightweight session indicator cookie readable by Next.js Edge Middleware.
 * Max-age is set to 7 days (matching the refresh token lifetime).
 */
export function setSessionCookie(): void {
  if (typeof document === 'undefined') return;
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = isSecure ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=604800; SameSite=Lax${secureFlag}`;
}

/**
 * Clears the session indicator cookie on logout or expired session.
 */
export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = isSecure ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secureFlag}`;
}

/**
 * Checks whether the session cookie currently exists on the client.
 */
export function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((item) => item.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}
