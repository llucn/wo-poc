import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`Request failed (${status} ${statusText})`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

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
        let body: unknown = undefined;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          try {
            body = await response.clone().json();
          } catch {
            body = undefined;
          }
        }
        throw new ApiError(response.status, response.statusText, body);
      }
      return response;
    },
    [accessToken, idToken],
  );
}
