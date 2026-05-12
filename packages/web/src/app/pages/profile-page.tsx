import { useEffect, useState } from 'react';
import { useApiFetch } from '../auth/use-api-fetch';

type MeResponse = {
  userId: string;
  userName: string;
  phoneNumber: string | null;
  email: string | null;
};

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: MeResponse };

export function ProfilePage() {
  const apiFetch = useApiFetch();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    apiFetch('/me')
      .then((res) => res.json())
      .then((json: MeResponse) => {
        if (!cancelled) setState({ kind: 'ready', data: json });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  if (state.kind === 'loading') {
    return (
      <section className="demo-page" aria-busy="true">
        <h1 className="demo-page-title">Profile</h1>
        <p className="demo-page-subtitle">Loading…</p>
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="demo-page" role="alert">
        <h1 className="demo-page-title">Profile</h1>
        <p className="demo-page-subtitle">{state.message}</p>
      </section>
    );
  }

  const { data } = state;
  return (
    <section className="demo-page">
      <h1 className="demo-page-title">Profile</h1>
      <p className="demo-page-subtitle">
        Verified claims from <code>/api/me</code>.
      </p>
      <dl className="profile-grid">
        <dt>User ID</dt>
        <dd>{data.userId}</dd>
        <dt>User Name</dt>
        <dd>{data.userName ?? '—'}</dd>
        <dt>Phone Number</dt>
        <dd>{data.phoneNumber ?? '—'}</dd>
        <dt>Email</dt>
        <dd>{data.email ?? '—'}</dd>
      </dl>
    </section>
  );
}
