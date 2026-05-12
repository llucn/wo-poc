import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function useApiFetch(): ApiFetch {
  const auth = useAuth();
  const accessToken = auth.user?.access_token;
  const idToken = auth.user?.id_token;

  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const url = /^https?:\/\//i.test(path)
        ? path
        : `/api${path.startsWith('/') ? '' : '/'}${path}`;

      const headers = new Headers(init.headers);
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
      if (idToken) headers.set('X-Id-Token', idToken);

      const response = await fetch(url, { ...init, headers });
      if (!response.ok) {
        throw new Error(
          `Request failed (${response.status} ${response.statusText})`,
        );
      }
      return response;
    },
    [accessToken, idToken],
  );
}
