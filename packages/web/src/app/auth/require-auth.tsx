import { ReactNode, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { isSigningOut } from './auth-actions';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();

  useEffect(() => {
    if (auth.isLoading || auth.isAuthenticated || auth.error) return;
    if (auth.activeNavigator) return;
    // Do not auto-redirect to login while logout is in-flight. signOut()
    // calls removeUser(), which fires userUnloaded in a microtask, flipping
    // isAuthenticated to false before the browser commits the navigation to
    // Cognito /logout. Without this guard, we'd call signinRedirect() here,
    // whose location.assign(authorize_url) preempts the /logout navigation
    // (that is the "canceled" /logout request seen in DevTools).
    if (isSigningOut()) return;
    void auth.signinRedirect();
  }, [auth]);

  if (auth.isLoading) {
    return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading…</div>;
  }

  if (auth.error) {
    return (
      <section
        className="demo-page"
        style={{ margin: 24, maxWidth: 480 }}
        role="alert"
      >
        <h1 className="demo-page-title">Authentication error</h1>
        <p className="demo-page-subtitle">{auth.error.message}</p>
      </section>
    );
  }

  if (!auth.isAuthenticated) return null;

  return <>{children}</>;
}
