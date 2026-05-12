## 1. Dependencies & env files

- [x] 1.1 Add runtime deps to the workspace root `package.json`: `oidc-client-ts`, `react-oidc-context`, `aws-jwt-verify`, `@nestjs/config`. Run `npm install` and commit the lockfile change.
- [x] 1.2 Create `packages/api/.env.example` with three keys — `COGNITO_AUTHORITY`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` — populated with the same values already present in `packages/web/.env.example` (authority `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EsvS0Nskn`, pool ID `us-east-1_EsvS0Nskn`, client ID `19pgqb579hc0ji7olqm78hssoe`).
- [x] 1.3 Verify `.env` is in the workspace `.gitignore`. If not, add `packages/*/.env`. — Root `.gitignore` already excludes `.env`, `.env.local`, and `.env.*.local`.

## 2. API: config + auth module

- [x] 2.1 Create `packages/api/src/app/config/app-config.ts` exporting a typed `AppConfig = { cognitoAuthority: string; cognitoUserPoolId: string; cognitoClientId: string }` plus a `loadAppConfig()` factory that reads `process.env`, throws if any of the three keys are missing, and returns the typed object.
- [x] 2.2 Update `packages/api/src/app/app.module.ts` to import `ConfigModule.forRoot({ isGlobal: true, load: [loadAppConfig], envFilePath: '.env' })`.
- [x] 2.3 Update `packages/api/src/main.ts` to call `app.enableCors({ origin: true })` and to read `PORT` via `ConfigService` (preserving the existing `|| 3000` fallback). Also added a `bootstrap().catch(...process.exit(1))` so the process exits non-zero if `loadAppConfig` throws — see task 8.5.
- [x] 2.4 Create `packages/api/src/app/auth/verifiers.provider.ts` exporting two NestJS providers — `ACCESS_VERIFIER` and `ID_VERIFIER` — each built via `CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' | 'id' })` using values from `ConfigService`.
- [x] 2.5 Create `packages/api/src/app/auth/public.decorator.ts` exporting `IS_PUBLIC_KEY` and `Public = () => SetMetadata(IS_PUBLIC_KEY, true)`.
- [x] 2.6 Create `packages/api/src/app/auth/jwt-auth.guard.ts`. It MUST: (a) check `Reflector` for `IS_PUBLIC_KEY` and short-circuit if true; (b) read `Authorization: Bearer <token>` and call the access verifier (throw `UnauthorizedException` on any failure); (c) read `X-Id-Token` and call the ID verifier (throw `UnauthorizedException` if missing or invalid); (d) attach `{ userId: access.sub, userName: id.name ?? id['cognito:username'], phoneNumber: id.phone_number ?? null, email: id.email ?? null, accessClaims: access, idClaims: id }` to `request.user`.
- [x] 2.7 Create `packages/api/src/app/auth/current-user.decorator.ts` exporting `CurrentUser = createParamDecorator((_, ctx) => ctx.switchToHttp().getRequest().user)`.
- [x] 2.8 Create `packages/api/src/app/auth/auth.module.ts` that provides the two verifiers, the guard, and re-exports the guard. In `app.module.ts`, import `AuthModule` and register the guard globally via `{ provide: APP_GUARD, useClass: JwtAuthGuard }`.
- [x] 2.9 Mark the existing `GET /api` handler in `app.controller.ts` with `@Public()` so the smoke endpoint still works without a token.

## 3. API: `/api/me`

- [x] 3.1 Create `packages/api/src/app/me/me.dto.ts` exporting `type MeResponse = { userId: string; userName: string; phoneNumber: string | null; email: string | null }`.
- [x] 3.2 Create `packages/api/src/app/me/me.controller.ts` with `@Controller('me')` and `@Get() getMe(@CurrentUser() user)` returning a `MeResponse` shaped from `user`.
- [x] 3.3 Create `packages/api/src/app/me/me.module.ts` declaring the controller; import it into `app.module.ts`.
- [x] 3.4 Confirm via `npx nx serve @wo-poc/api` that the route is registered: `curl -i http://localhost:3000/api/me` returns 401 (no token), and `curl http://localhost:3000/api` still returns the smoke message. — Verified: `GET /api` → 200 `{"message":"Hello API"}`; `GET /api/me` → 401 `{"message":"Missing or malformed Authorization header","error":"Unauthorized","statusCode":401}`.

## 4. Web: auth configuration

- [x] 4.1 Create `packages/web/.env` from `.env.example` if it doesn't exist locally (the file is git-ignored; this is a dev step, not committed).
- [x] 4.2 Create `packages/web/src/app/auth/oidc-config.ts` exporting an `oidcConfig: AuthProviderProps` object built from `import.meta.env.VITE_OIDC_*`. `redirect_uri` MUST be derived from `window.location.origin + window.location.pathname` and the file MUST throw a descriptive error at module load if any `VITE_OIDC_*` env value is missing.
- [x] 4.3 In the same file (or a sibling `cognito-urls.ts`), export `buildLogoutUrl(): string` returning `${authority}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(window.location.origin + '/')}`.

## 5. Web: provider + auth gate

- [x] 5.1 Update `packages/web/src/main.tsx` to import `AuthProvider` from `react-oidc-context` and wrap `<HashRouter>...</HashRouter>` (or the existing `<ThemeProvider>`) with `<AuthProvider {...oidcConfig}>`.
- [x] 5.2 Create `packages/web/src/app/auth/require-auth.tsx` exporting `<RequireAuth>{children}</RequireAuth>`. While `auth.isLoading`, render nothing. While `auth.error`, render a small inline error block with the error message. While `!auth.isAuthenticated`, call `auth.signinRedirect()` once via `useEffect` and render nothing. Otherwise render `{children}`.
- [x] 5.3 Wrap `<AppShell>...</AppShell>` in `packages/web/src/app/app.tsx` with `<RequireAuth>`.

## 6. Web: topbar & avatar wiring

- [x] 6.1 Create `packages/web/src/app/auth/use-auth-user.ts` exporting `useAuthUser()`. It calls `useAuth()` from `react-oidc-context`, derives `{ name, email, initials }` using the precedence in the design, and returns them. `initials` is the first letter of each of the first two whitespace tokens of `name`, uppercased; falls back to the first letter of `name`; falls back to `'?'`.
- [x] 6.2 Update `packages/web/src/app/shell/topbar.tsx` to consume `useAuthUser()` and render the returned `name` as the username text (replacing the hard-coded `Demo User`).
- [x] 6.3 Update `packages/web/src/app/shell/avatar-menu.tsx`: (a) replace the hard-coded `DU` initials and `Demo User`/`demo@example.com` info block with values from `useAuthUser()`; (b) make the `Profile` button call `useNavigate()('/profile')` and close the dropdown; (c) make the `Logout` button call a `signOut()` helper that does `auth.removeUser()` then `window.location.assign(buildLogoutUrl())`.
- [x] 6.4 Create `packages/web/src/app/auth/auth-actions.ts` exporting `signOut(auth)` to hold the two-step logout logic referenced above.

## 7. Web: profile page + API fetch helper

- [x] 7.1 Create `packages/web/src/app/auth/use-api-fetch.ts` exporting `useApiFetch()`. It returns an `apiFetch(path, init?)` function that automatically sets `Authorization: Bearer ${auth.user.access_token}` and `X-Id-Token: ${auth.user.id_token}` and prepends `/api` to relative paths (or accepts absolute paths as-is). It throws on non-2xx with an `Error` whose message includes the status.
- [x] 7.2 Create `packages/web/src/app/pages/profile-page.tsx` exporting `<ProfilePage/>`. On mount it calls `apiFetch('/me')`. While pending: render a `Loading…` placeholder. On error: render a styled error block including the status. On success: render four labelled rows — `User ID`, `User Name`, `Phone Number`, `Email` — with absent (null) values rendered as `—`.
- [x] 7.3 Add `<Route path="/profile" element={<ProfilePage/>}/>` to `packages/web/src/app/app.tsx` (before the catch-all `*` route).

## 8. Verification

- [x] 8.1 Run `npx tsc --noEmit -p packages/web/tsconfig.app.json` and `npx tsc --noEmit -p packages/api/tsconfig.app.json` — both clean.
- [x] 8.2 Run `npx nx build web` and `npx nx build @wo-poc/api` — both succeed. (web: 51 modules; api: webpack OK.)
- [x] 8.3 Confirm via grep that the Cognito user-pool ID and app-client ID do not appear under `packages/web/src/` or `packages/api/src/`: `grep -rn 'us-east-1_EsvS0Nskn\|19pgqb579hc0ji7olqm78hssoe' packages/web/src packages/api/src` returns nothing.
- [x] 8.4 Boot the API (`npx nx serve @wo-poc/api`) and confirm `curl -i http://localhost:3000/api/me` returns `401` without credentials. — Verified.
- [x] 8.5 Boot the API with `COGNITO_AUTHORITY` deliberately unset and confirm the process exits non-zero and logs which variable is missing. — Verified: node exits 1, log shows `Error: Missing required environment variables: COGNITO_AUTHORITY, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID`.
- [ ] 8.6 Boot the web (`npx nx serve web`) with `.env` populated; verify the app immediately redirects to the Cognito hosted UI; after sign-in, the topbar shows the real name/initials, `Profile` opens `/profile` showing the four fields, and `Logout` lands on Cognito's `/logout` and back at the app showing the hosted UI again. — Awaiting human browser verification; the agent cannot drive the hosted UI sign-in. Open question carried from the proposal: confirm `http://localhost:4200/` is on the Cognito app client's allowed callback URLs and allowed sign-out URLs.
- [x] 8.7 Run `openspec validate cognito-auth` — passes.
