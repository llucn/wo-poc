## Context

`packages/web/.env.example` already contains the OIDC bootstrap data for an existing Cognito user pool (`us-east-1_EsvS0Nskn`), an existing app client (`19pgqb579hc0ji7olqm78hssoe`), and the scopes the pool was configured with (`phone openid email`). The user-pool's hosted UI handles sign-up, sign-in, password reset, and federation — the apps in this workspace only need to redirect to it, consume the tokens it issues, and validate those tokens.

The web app currently:

- has a topbar (`packages/web/src/app/shell/topbar.tsx`) that hard-codes `Demo User` and `DU` initials,
- has an avatar dropdown (`packages/web/src/app/shell/avatar-menu.tsx`) where `Profile` and `Logout` are no-ops,
- has no notion of an authenticated user anywhere in the tree.

The API currently:

- is the default `@nestjs/core` 11 scaffold with a single `GET /api` returning `{ message: 'Hello API' }`,
- has no `ConfigModule`, no guards, no auth-related code,
- has no `.env.example` (the only one in the repo is the web one).

The Vite dev server (`packages/web/vite.config.ts`) proxies `/api` to `http://localhost:3000`, so in development the SPA and the API are same-origin from the browser's point of view.

## Goals / Non-Goals

**Goals:**

- End-to-end Cognito sign-in: clicking the app while logged out should land the user at Cognito's hosted UI; signing in there should bring them back into the app authenticated.
- A single source of configuration: Cognito IDs, the authority URL, and scopes live in env files that the user already controls (`packages/web/.env.example`, new `packages/api/.env.example`), and nowhere else in the source tree.
- A working `Profile` page driven by a working `/api/me` endpoint, so the user can see that the JWT round-trip works.
- A `Logout` button that actually clears the session.
- A reusable auth surface on the API (`@CurrentUser()` decorator, `JwtAuthGuard`) so future protected endpoints are a one-line change.

**Non-Goals:**

- Server-side sessions, refresh-token rotation done by the API, opaque-token introspection.
- Role/permission/group enforcement (we read claims, we do not authorize against them yet).
- An in-app sign-up/sign-in/password-reset UI (Cognito hosted UI owns this).
- Persisting users to a database — `/api/me` returns claims, not a user record.
- Custom hosted-UI theming or federated IDP wiring.
- Tests for the new modules (the workspace does not currently have a test infrastructure set up; adding one is its own change).
- API rate-limiting, request logging, or audit trails.

## Decisions

### 1. Library choices

- **Web**: `oidc-client-ts` (the actively maintained successor to `oidc-client`) plus its React wrapper `react-oidc-context`. They handle PKCE, code exchange, silent restore from `sessionStorage`, the callback URL fix-up, and event hooks for token expiry — all of which we would otherwise have to write and maintain ourselves.
- **API**: `aws-jwt-verify` (official AWS package). It fetches and caches the JWKS, knows Cognito's `token_use`/`iss`/`aud`/`exp` rules, and exposes a tiny `verify(token)` surface. Alternatives considered: `passport-jwt` + `jwks-rsa` (more moving parts, two libraries to keep in sync), hand-rolling JWKS verification (re-implementing JWKS rotation handling).
- **Config**: `@nestjs/config` for the API. It is the standard NestJS pattern, supports typed access via `ConfigService<AppConfig>`, and handles `.env` loading order out of the box.

These are the only four new runtime dependencies.

### 2. Web auth flow: Authorization Code + PKCE via the hosted UI

We hand the `AuthProvider` from `react-oidc-context` a single config object built from `import.meta.env`:

```ts
const oidcConfig: AuthProviderProps = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: window.location.origin + window.location.pathname,
  response_type: import.meta.env.VITE_OIDC_RESPONSE_TYPE,
  scope: import.meta.env.VITE_OIDC_SCOPE,
  onSigninCallback: () => {
    // Strip the ?code=…&state=… query off the URL so it doesn't appear on subsequent refreshes
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  },
};
```

- `redirect_uri` is derived from `window.location` at runtime, not from an env var, because Vite envs are baked at build time and the dev (`http://localhost:4200/`) and prod URLs differ. Whatever URL the app runs at must be registered as an allowed callback URL on the Cognito app client — the README will say this.
- The OIDC client's default storage is `sessionStorage`, which is fine for a POC. Switching to `localStorage` is a one-line config change later if we need cross-tab persistence.

### 3. Gating routes

`AppShell` (and therefore all routes inside it) is wrapped in a `<RequireAuth>` boundary that:

- If `auth.isLoading` → render nothing (the OIDC client is restoring an existing session).
- Else if `auth.isAuthenticated` → render children.
- Else → call `auth.signinRedirect()` once and render nothing.

We deliberately do **not** add a `/login` route. A bookmark to any deep link will still work because after the round-trip, `react-oidc-context` returns the user to the URL that triggered the redirect.

### 4. Username on the topbar / avatar initials

`Topbar` consumes a new `useAuthUser()` hook that returns a normalized `{ name, email, initials }` derived from `auth.user?.profile`. Precedence for the display name:

1. `profile.name` (the OIDC standard claim)
2. `profile['cognito:username']`
3. `profile.email`
4. The literal string `User` (defensive — should be unreachable, given the requested scope)

`initials` is the first letter of each of the first two whitespace-separated tokens of the display name, uppercased. So `Alice Lee` → `AL`; `alice@example.com` → `A`.

### 5. `Logout` does a Cognito-side sign-out, not just a local clear

Cognito's logout endpoint is non-standard (not exposed in OIDC discovery as `end_session_endpoint`), so we cannot rely on `oidc-client-ts`'s `signoutRedirect()` to call it for us. It also does **not** live at the issuer (`cognito-idp.<region>.amazonaws.com/<poolId>`) — `/logout` is hosted on the user pool's hosted-UI domain (e.g. `<prefix>.auth.<region>.amazoncognito.com`). We discover that host by reading the discovery doc's `authorization_endpoint` (which Cognito *does* point at the hosted UI) and taking its `protocol://host`.

`signOut(auth)` lives in `packages/web/src/app/auth/auth-actions.ts` and does, in this order:

1. `await buildLogoutUrl()` — resolves the cached discovery-derived hosted-UI base and produces `<hostedUIHost>/logout?client_id=<client_id>&logout_uri=<origin>`. We resolve the URL **before** touching local state.
2. `void auth.removeUser()` — fire-and-forget. We deliberately do NOT await: awaiting yields the microtask queue, lets React commit the !isAuthenticated state, and lets `RequireAuth`'s effect call `signinRedirect()`. That redirect's `location.assign(/authorize)` would then preempt our `/logout` navigation (visible as a "canceled" /logout in DevTools) and, because Cognito's session cookie is still valid, `/authorize` would silently re-issue tokens and re-authenticate the user — exactly the "click Logout, land back on home still logged in" bug we hit and fixed.
3. `window.location.assign(logoutUrl)` — synchronously in the same tick as step 2, so the browser navigation wins the race.

The `logout_uri` (where Cognito sends the user back) must also be on the app client's allow list. Same deployment caveat as the redirect URI.

### 6. API config surface

We add a typed `ConfigService` with three keys, loaded from `process.env`:

| Key | Source | Used for |
| --- | --- | --- |
| `COGNITO_AUTHORITY` | `.env` | Issuer claim check during JWT verify (`iss === COGNITO_AUTHORITY`). |
| `COGNITO_USER_POOL_ID` | `.env` | Passed to `CognitoJwtVerifier.create({ userPoolId, ... })`. |
| `COGNITO_CLIENT_ID` | `.env` | Audience check (`token_use === "access"` ⇒ `client_id` claim equals this). |

Validation: the API logs and exits 1 on boot if any of the three are missing — better than silently letting requests through with a misconfigured verifier.

### 7. JWT verification strategy

We use Cognito **access tokens** (not ID tokens) for API calls, because access tokens carry `cognito:username`, `client_id`, `token_use: "access"` and are the AWS-blessed shape for protected resources. ID tokens are kept for displaying the user in the UI.

The API verifies via a single shared `CognitoJwtVerifier` instance (constructed at module init) with:

```ts
CognitoJwtVerifier.create({
  userPoolId: cfg.COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  clientId: cfg.COGNITO_CLIENT_ID,
});
```

The verifier caches the JWKS and rotates automatically on `kid` miss. We do **not** disable any of its built-in claim checks.

### 8. `/api/me` claim shape — name comes from the ID token

Access tokens from Cognito do **not** include `email` or `phone_number` by default. They include `cognito:username`, `sub`, `client_id`, `scope`, `auth_time`. To return User Name, Email, and Phone Number we need either:

- (a) the **ID token** (which carries the requested OIDC scopes' claims: `email`, `phone_number`, `name`), sent from the web alongside the access token; or
- (b) a server-side call to Cognito's `GetUser` API using the access token.

Choice: **(a)**. The web sends the ID token in a second header (`X-Id-Token`) on the same request; the API verifies it independently with a second verifier (`tokenUse: 'id'`) and reads `email`, `phone_number`, `name` from the verified ID-token claims. `userId` always comes from the access-token `sub` (the verified, canonical identifier). Why not (b)? It adds an outbound AWS dependency and IAM permission on every `/api/me` call for data we already have in the ID token the user is holding.

The response shape is the minimal four fields the user asked for:

```json
{
  "userId":      "<sub>",
  "userName":    "<id_token.name ?? id_token['cognito:username']>",
  "phoneNumber": "<id_token.phone_number ?? null>",
  "email":       "<id_token.email ?? null>"
}
```

`phoneNumber` and `email` are nullable — a user pool *can* be configured without those attributes and the request still succeeds.

### 9. NestJS shape: `JwtAuthGuard` + `@CurrentUser()`

- `JwtAuthGuard` (registered globally via `APP_GUARD`) reads the `Authorization: Bearer <access>` header, verifies it, optionally reads `X-Id-Token` and verifies it too, then attaches `{ userId, userName, email, phoneNumber, accessClaims, idClaims }` to `request.user`.
- A small `@Public()` decorator opts an endpoint out of the global guard. We mark the existing `GET /api` as `@Public()` so the change doesn't break the smoke endpoint.
- `@CurrentUser()` is a NestJS `createParamDecorator` that returns `request.user`. `MeController.getMe(@CurrentUser() user)` is then a one-liner.

### 10. CORS

The Vite dev server proxy means the dev SPA never makes a cross-origin call, so the API can leave CORS off in development. We still call `app.enableCors({ origin: true, credentials: false })` in `main.ts` so that `Authorization` is allowed if some future deployment splits origins. We do *not* enable cookies (`credentials: true`) — we are header-based.

## Risks / Trade-offs

- **Risk**: The hosted UI is not configured for the dev callback URL. → **Mitigation**: README/`.env.example` clearly state that `http://localhost:4200/` must be on the app client's allowed callback URLs and `http://localhost:4200/` must be on the allowed sign-out URLs. The cognito-auth README adds a checklist.
- **Risk**: A user lands on the app with a valid Cognito session cookie but an expired local token. → **Mitigation**: `oidc-client-ts` attempts a silent renew through the iframe at startup. If that fails, the existing redirect-on-unauthenticated path runs and the hosted UI silently re-issues without prompting.
- **Risk**: Sending the ID token in a header (`X-Id-Token`) is non-standard. → **Mitigation**: We verify it independently (same JWKS) before trusting any of its claims, and we do not fall back to unverified data. If a future endpoint needs the ID-token claims, the same guard already populated them.
- **Risk**: Two libraries doing JWT validation under the hood (the OIDC client on the web side, `aws-jwt-verify` on the API side) drift on validation rules. → **Mitigation**: They are doing different jobs — the web library never trusts a token to authorize anything; only the API's verifier does — so drift is harmless as long as we never authorize on the web.
- **Risk**: Devs commit `.env`. → **Mitigation**: Both `.env.example` files are checked in; `.env` is already in `.gitignore` (root level).
- **Trade-off**: We add four runtime deps. Acceptable: each is a well-maintained, widely used library that replaces hundreds of lines of bespoke code with known-correct ones.
- **Trade-off**: `redirect_uri` is derived at runtime, not from env. Acceptable: it means dev and prod share the same `.env.example`, but it requires the Cognito app client to list every deployment URL on the allow list. The README will say this.

## Migration Plan

- Greenfield auth. No existing user data, no existing tokens to migrate, no existing protected endpoints to keep working.
- Rollback is `git revert`. There is no database state to undo.
- Devs already running the workspace will need to:
  1. Copy `packages/web/.env.example` → `packages/web/.env` (already required for the existing OIDC variables to be picked up).
  2. Copy the new `packages/api/.env.example` → `packages/api/.env`.
  3. Run `npm install` for the four new deps.
  4. Run the API (`npx nx serve @wo-poc/api`) and the web (`npx nx serve web`).

## Open Questions

- Does the existing Cognito user pool already have its allowed callback URLs and sign-out URLs configured for the dev origin (`http://localhost:4200/`)? If not, this is a one-time Cognito console change the user must make before sign-in will work end-to-end. We will surface the URLs in the README so the change is unambiguous.
