# cognito-auth Specification

## Purpose
TBD - created by archiving change cognito-auth. Update Purpose after archive.
## Requirements
### Requirement: Web app reads Cognito configuration from environment variables

The web app SHALL read all Cognito-specific configuration values (authority URL, client ID, response type, scope) from `import.meta.env` at runtime. Cognito user-pool IDs, app-client IDs, the authority URL, and the scope list MUST NOT appear as literal string constants anywhere under `packages/web/src/`. The env keys used MUST be exactly `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_RESPONSE_TYPE`, and `VITE_OIDC_SCOPE` to match `packages/web/.env.example`.

#### Scenario: No Cognito identifiers in source

- **WHEN** a developer greps `packages/web/src/` for the existing user-pool ID `us-east-1_EsvS0Nskn` or app-client ID `19pgqb579hc0ji7olqm78hssoe`
- **THEN** no matches are found; both values resolve only from `import.meta.env` at runtime

#### Scenario: OIDC config built from env

- **WHEN** the web app boots
- **THEN** the OIDC client is configured with `authority` from `VITE_OIDC_AUTHORITY`, `client_id` from `VITE_OIDC_CLIENT_ID`, `response_type` from `VITE_OIDC_RESPONSE_TYPE`, and `scope` from `VITE_OIDC_SCOPE`

### Requirement: API reads Cognito configuration from environment variables

The NestJS API SHALL read all Cognito-specific configuration from `process.env` via `@nestjs/config`. The user-pool ID, app-client ID, and authority URL MUST NOT appear as literal string constants anywhere under `packages/api/src/`. The API SHALL fail to start (exit non-zero, log the missing key) when any required Cognito env key is unset or empty.

#### Scenario: No Cognito identifiers in API source

- **WHEN** a developer greps `packages/api/src/` for the existing user-pool ID `us-east-1_EsvS0Nskn` or app-client ID `19pgqb579hc0ji7olqm78hssoe`
- **THEN** no matches are found

#### Scenario: API exits when configuration is missing

- **WHEN** the API is started with one of `COGNITO_AUTHORITY`, `COGNITO_USER_POOL_ID`, or `COGNITO_CLIENT_ID` unset
- **THEN** the process exits with a non-zero status and logs which environment variable is missing

#### Scenario: API .env.example is checked in

- **WHEN** a developer clones the repo
- **THEN** `packages/api/.env.example` exists and documents `COGNITO_AUTHORITY`, `COGNITO_USER_POOL_ID`, and `COGNITO_CLIENT_ID`

### Requirement: Authenticated app boot

When the web app loads, it SHALL determine whether the user has a valid Cognito session and present authenticated UI only to users who do. Unauthenticated users MUST be redirected to the Cognito hosted UI via OIDC Authorization Code + PKCE, and after they sign in the browser MUST return to the URL they originally requested.

#### Scenario: Cold start with no session

- **WHEN** an unauthenticated user opens the app
- **THEN** the browser is redirected to the Cognito hosted UI for sign-in

#### Scenario: Successful sign-in returns to original URL

- **WHEN** an unauthenticated user opens `/work-orders/all` and completes sign-in at the hosted UI
- **THEN** after the OIDC callback, the browser ends up on `/work-orders/all` (or its hash-router equivalent) with the user authenticated

#### Scenario: Reload preserves session

- **WHEN** an authenticated user reloads the page
- **THEN** the app restores the session locally without a redirect and the user remains on the same URL

#### Scenario: Callback query string is stripped

- **WHEN** the OIDC callback completes
- **THEN** the `?code=...&state=...` query parameters are removed from the address bar via `history.replaceState`

### Requirement: Logout signs the user out of Cognito

Clicking `Logout` in the avatar dropdown SHALL clear the local OIDC session AND redirect the browser through Cognito's `/logout` endpoint so that the hosted UI session cookie is invalidated. The Cognito `/logout` URL MUST be derived from `VITE_OIDC_AUTHORITY` and `VITE_OIDC_CLIENT_ID` — the hosted-UI host MUST be read from the user pool's OIDC discovery document (the host of its `authorization_endpoint`) rather than hard-coded.

#### Scenario: Logout clears local session

- **WHEN** the authenticated user clicks `Logout`
- **THEN** the OIDC client's local user store is cleared before the browser navigates away

#### Scenario: Logout invalidates the hosted UI session

- **WHEN** the authenticated user clicks `Logout`
- **THEN** the browser is navigated to `<cognito-hosted-ui-host>/logout?client_id=<client_id>&logout_uri=<origin>` — where `<cognito-hosted-ui-host>` is the host taken from the `authorization_endpoint` in the user pool's OIDC discovery doc — so that subsequent sign-in attempts re-prompt at the hosted UI rather than silently re-using the prior session

#### Scenario: Logout navigation is not preempted by re-authentication

- **WHEN** the authenticated user clicks `Logout`
- **THEN** the `/logout` navigation completes; the app MUST NOT race itself into calling `signinRedirect()` after clearing local state and cancelling the in-flight `/logout` request

### Requirement: Profile page shows the authenticated user

The web app SHALL expose a `/profile` route. Clicking `Profile` in the avatar dropdown MUST navigate to `/profile`. The profile page MUST fetch `GET /api/me` (sending the access token in the `Authorization: Bearer ...` header and the ID token in an `X-Id-Token` header) and render the four fields returned by that endpoint labelled as `User ID`, `User Name`, `Phone Number`, and `Email`.

#### Scenario: Profile menu opens the profile page

- **WHEN** the authenticated user clicks `Profile` in the avatar dropdown
- **THEN** the URL becomes `/profile` and the profile page is rendered

#### Scenario: Profile page renders the four fields

- **WHEN** the profile page mounts and `/api/me` returns 200 with valid claims
- **THEN** four labelled fields are visible — `User ID`, `User Name`, `Phone Number`, `Email` — each populated from the response body

#### Scenario: Missing optional claims render as a dash

- **WHEN** `/api/me` returns a body where `phoneNumber` or `email` is null
- **THEN** the corresponding row renders a visible placeholder (e.g. `—`) instead of the literal string `null` or an empty cell

#### Scenario: Profile fetch error is surfaced

- **WHEN** `/api/me` returns a non-2xx response
- **THEN** the profile page renders an error message including the status code rather than silently showing empty fields

### Requirement: API requires a verified Cognito access token by default

The NestJS API SHALL register a global authentication guard that rejects any request whose `Authorization: Bearer <token>` header is missing, malformed, or fails Cognito JWT verification (signature against the user-pool JWKS, `iss === COGNITO_AUTHORITY`, `client_id === COGNITO_CLIENT_ID`, `token_use === 'access'`, and `exp` in the future). Endpoints that should bypass this check MUST opt out explicitly via a `@Public()` decorator.

#### Scenario: Missing Authorization header

- **WHEN** a request arrives at any non-`@Public()` endpoint without an `Authorization` header
- **THEN** the API responds 401 and the controller method is not invoked

#### Scenario: Invalid signature

- **WHEN** a request arrives with an `Authorization: Bearer` token whose signature does not validate against the user-pool JWKS
- **THEN** the API responds 401

#### Scenario: Wrong issuer

- **WHEN** a request arrives with a structurally valid JWT whose `iss` claim does not equal `COGNITO_AUTHORITY`
- **THEN** the API responds 401

#### Scenario: Wrong audience / client

- **WHEN** a request arrives with a valid Cognito JWT whose `client_id` claim does not equal `COGNITO_CLIENT_ID`
- **THEN** the API responds 401

#### Scenario: Expired token

- **WHEN** a request arrives with an otherwise-valid JWT whose `exp` is in the past
- **THEN** the API responds 401

#### Scenario: @Public endpoint stays open

- **WHEN** a request arrives at an endpoint annotated `@Public()` without any `Authorization` header
- **THEN** the request reaches the controller and the response status is 200 (or whatever the controller returns), not 401

### Requirement: `GET /api/me` returns the authenticated user's profile

The API SHALL expose `GET /api/me`. The handler SHALL be protected by the authentication guard. Its response body SHALL be a JSON object with exactly four keys — `userId`, `userName`, `phoneNumber`, `email`. `userId` MUST be sourced from the verified access token's `sub` claim. `userName`, `phoneNumber`, and `email` MUST be sourced from the verified ID token (`X-Id-Token` header) using the `name`/`cognito:username`, `phone_number`, and `email` claims respectively. `phoneNumber` and `email` MUST be returned as `null` when the corresponding claim is absent (not omitted, not empty string).

#### Scenario: Authenticated request

- **WHEN** an authenticated request hits `GET /api/me` with a verified access token and a verified ID token whose claims include `sub`, `name`, `phone_number`, `email`
- **THEN** the response is `200` with body `{ "userId": "<sub>", "userName": "<name>", "phoneNumber": "<phone_number>", "email": "<email>" }`

#### Scenario: ID token name falls back to cognito:username

- **WHEN** the ID token has no `name` claim but does have `cognito:username`
- **THEN** `userName` equals the `cognito:username` value

#### Scenario: Optional claims are null when absent

- **WHEN** the ID token has no `phone_number` or no `email` claim
- **THEN** the corresponding response field is `null` (key still present)

#### Scenario: Unauthenticated request

- **WHEN** `GET /api/me` is called without an `Authorization` header
- **THEN** the response is `401`

#### Scenario: Missing ID token

- **WHEN** `GET /api/me` is called with a valid access token but no `X-Id-Token` header
- **THEN** the response is `401`

#### Scenario: ID token fails verification

- **WHEN** `GET /api/me` is called with a valid access token and an `X-Id-Token` whose signature, issuer, audience, or `token_use === 'id'` check fails
- **THEN** the response is `401`

### Requirement: Reusable `@CurrentUser()` decorator

The API SHALL expose a `@CurrentUser()` parameter decorator that, inside any handler protected by the auth guard, resolves to an object with at minimum `{ userId, userName, phoneNumber, email }`. Handlers SHALL NOT parse the `Authorization` header themselves.

#### Scenario: Controller reads the user via the decorator

- **WHEN** a controller handler is declared with `@CurrentUser() user`
- **THEN** the parameter is populated with the verified user object and the handler does not need to access `request.headers` directly

#### Scenario: Decorator without the guard

- **WHEN** `@CurrentUser()` is used on a handler that is also marked `@Public()`
- **THEN** the parameter is `undefined` (the request was not authenticated, so there is no user) — accessing it is the handler's responsibility

