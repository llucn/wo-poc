import { ReactNode, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();

  useEffect(() => {
    if (auth.isLoading || auth.isAuthenticated || auth.error) return;
    if (auth.activeNavigator) return;
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
