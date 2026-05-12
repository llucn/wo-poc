import type { AuthContextProps } from 'react-oidc-context';
import { buildLogoutUrl } from './oidc-config';

export async function signOut(auth: AuthContextProps): Promise<void> {
  // Resolve the logout URL BEFORE touching local auth state. Awaiting
  // anything *after* removeUser() lets React commit the unauthenticated
  // state and lets RequireAuth's effect call signinRedirect(), whose
  // navigation cancels ours — that is the "canceled" /logout request
  // visible in DevTools.
  const logoutUrl = await buildLogoutUrl();

  // Fire-and-forget the local clear: removeUser() synchronously wipes the
  // oidc-client-ts sessionStorage entry but its returned promise resolves
  // a microtask later (after firing the userUnloaded event that toggles
  // the auth context to !isAuthenticated). We intentionally do NOT await,
  // so location.assign runs in the same synchronous tick and the browser
  // navigation wins the race against React's next render.
  void auth.removeUser();
  window.location.assign(logoutUrl);
}
