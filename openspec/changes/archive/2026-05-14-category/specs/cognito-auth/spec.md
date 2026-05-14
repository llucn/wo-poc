## MODIFIED Requirements

### Requirement: Reusable `@CurrentUser()` decorator

The API SHALL expose a `@CurrentUser()` parameter decorator that, inside any handler protected by the auth guard, resolves to an object with at minimum `{ userId, userName, phoneNumber, email, groups }`. `groups` MUST be a `string[]` derived from the verified access token's `cognito:groups` claim (an empty array when the claim is absent or empty). Handlers SHALL NOT parse the `Authorization` header themselves, and SHALL NOT reach into `accessClaims['cognito:groups']` directly when checking roles.

#### Scenario: Controller reads the user via the decorator

- **WHEN** a controller handler is declared with `@CurrentUser() user`
- **THEN** the parameter is populated with the verified user object and the handler does not need to access `request.headers` directly

#### Scenario: Decorator without the guard

- **WHEN** `@CurrentUser()` is used on a handler that is also marked `@Public()`
- **THEN** the parameter is `undefined` (the request was not authenticated, so there is no user) — accessing it is the handler's responsibility

#### Scenario: Groups are surfaced as a typed array

- **WHEN** the verified access token includes `cognito:groups: ['ADMIN']` and a handler is declared with `@CurrentUser() user`
- **THEN** `user.groups` equals `['ADMIN']`

#### Scenario: Missing groups claim is an empty array

- **WHEN** the verified access token has no `cognito:groups` claim and a handler is declared with `@CurrentUser() user`
- **THEN** `user.groups` equals `[]` (not `undefined`)
