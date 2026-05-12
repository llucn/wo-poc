## Why

The web app's avatar dropdown currently has no-op `Profile` and `Logout` entries and a hard-coded `Demo User` label, and the API has no auth — anyone can hit any future endpoint. AWS Cognito is already provisioned (the user pool, app client, scopes, and hosted UI are configured; the OIDC env vars are checked in to `packages/web/.env.example`), so the missing piece is wiring both apps to it. Doing this now unblocks every subsequent feature that needs to know who the caller is, and turns the existing `Profile`/`Logout` buttons from placeholders into real flows.

## What Changes

- Wire the web app to Cognito's hosted UI via OIDC Authorization Code + PKCE, reading **only** `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_RESPONSE_TYPE`, and `VITE_OIDC_SCOPE` from `import.meta.env` — no Cognito IDs or URLs in code.
- Persist the user's session via the OIDC client's storage; on app boot, attempt silent restore so reloads stay logged in.
- Replace the `Demo User` placeholder text and `DU` avatar initials with values derived from the authenticated user's claims (preferring `name` / `cognito:username`, falling back to `email`).
- Make `Logout` actually sign the user out (clear the local session and redirect through Cognito's logout endpoint so the hosted UI cookies are cleared too).
- Make `Profile` navigate to a new `/profile` route that fetches `GET /api/me` (with the access token in `Authorization: Bearer <jwt>`) and shows User ID, User Name, Phone Number, Email.
- Auto-redirect to the Cognito hosted UI when the app loads without a session (or when an API call returns 401), so there is no need for an in-app login page.
- Add a `/api/me` endpoint to the NestJS API that **rejects** requests without a valid Cognito-issued JWT (signature + issuer + audience + `token_use` checks via the official `aws-jwt-verify` library) and **returns** `{ userId, userName, phoneNumber, email }` extracted from the verified claims.
- Add `packages/api/.env.example` with `COGNITO_AUTHORITY`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` and load them via `@nestjs/config` — no Cognito IDs or URLs in API code either.
- Add a NestJS global `JwtAuthGuard` plus a `@CurrentUser()` decorator so this endpoint (and future authenticated endpoints) consume claims via DI rather than parsing headers themselves.

## Capabilities

### New Capabilities

- `cognito-auth`: End-to-end Cognito authentication for the workspace — the OIDC provider/login/logout flow in `@wo-poc/web`, the JWT-validating guard and `/api/me` endpoint in `@wo-poc/api`, and the contract between them (access token in `Authorization: Bearer`, claim shape on the response).

### Modified Capabilities

- `web-shell`: The `Avatar dropdown menu` requirement changes — `Profile` navigates to `/profile` and `Logout` triggers Cognito sign-out instead of both being no-ops. The `Topbar layout and contents` requirement changes — the username text and avatar initials are derived from the authenticated session instead of a `Demo User` placeholder.

## Impact

- **Affected code (web)**: `packages/web/src/main.tsx` (wrap with the OIDC provider), `packages/web/src/app/app.tsx` (gated routes + `/profile`), `packages/web/src/app/shell/avatar-menu.tsx` (wire Profile/Logout), `packages/web/src/app/shell/topbar.tsx` (username from auth), new files under `packages/web/src/app/auth/` (OIDC config + `useAuthUser` + `useApiFetch`) and `packages/web/src/app/pages/profile-page.tsx`.
- **Affected code (api)**: `packages/api/src/main.ts` (load config), `packages/api/src/app/app.module.ts` (`ConfigModule` + `AuthModule`), new files under `packages/api/src/app/auth/` (`JwtAuthGuard`, `current-user.decorator.ts`, `verifier.provider.ts`) and `packages/api/src/app/me/` (controller + DTO).
- **New env files**: `packages/api/.env.example` (newly created; the example shows the same `us-east-1_EsvS0Nskn` pool ID and `19pgqb579hc0ji7olqm78hssoe` client ID already in the web example, so devs only have to copy `.env.example` → `.env`).
- **New runtime dependencies**: `oidc-client-ts` and `react-oidc-context` in the web app; `aws-jwt-verify` and `@nestjs/config` in the API.
- **CORS**: The API will need to allow the Vite dev origin (`http://localhost:4200`) for the `Authorization` header. The Vite dev server already proxies `/api` → `http://localhost:3000`, so production callers and the dev proxy share the same origin and CORS only matters if/when the SPA talks to the API cross-origin.
- **Out of scope**: Role/permission model, token refresh on the API side, opaque-token introspection, server-side session storage, MFA configuration, custom hosted UI styling, federated providers, account management endpoints, persistence layer for user records. The `userName` field returned by `/api/me` is whatever Cognito puts in the token (`name` claim, falling back to `cognito:username`) — no User table is created.
