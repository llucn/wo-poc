## Why

The workspace has no data persistence yet — the API only serves stateless smoke endpoints and `/api/me` claims. The user has asked for the first read/write feature: managing **Issue Categories** (see `docs/category.md`). Doing this now forces us to establish the database layer (MySQL connection wiring, env-driven configuration, schema management) on a small, well-bounded feature, so every later persistence feature can reuse the same pattern. The feature itself is also valuable: it backs the `Issue Category` taxonomy that future work-order features will reference.

## What Changes

- Introduce a MySQL connection to `@wo-poc/api`. Connection parameters (host, port, user, password, database) are loaded from environment variables — no values are hardcoded. The example values are checked in to `packages/api/.env.example`.
- Add a `t_issue_category` table (id auto-increment PK, `name` and `display_name` unique varchar(255) columns) per `docs/category.md`. The DDL is checked in to `docs/database.sql` so any developer can bootstrap their local database from a single file.
- Add a NestJS `IssueCategoryModule` (entity, repository/service, controller) exposing four endpoints under `/api/issue-categories`:
  - `GET /api/issue-categories` — return all rows (no pagination, ordered by id).
  - `POST /api/issue-categories` — create one row; reject `409 Conflict` if `name` or `display_name` already exists.
  - `DELETE /api/issue-categories` — bulk delete by `{ ids: number[] }` body.
  - `GET /api/issue-categories/exists?name=…&displayName=…` — return `{ name: boolean, displayName: boolean }` for the form's live duplicate check.
- Add a `Settings → Issue Category` menu entry in the web shell sidebar that opens the All Issue Categories page.
- Add an **All Issue Categories** page (`/settings/issue-category`): a non-paginated list of categories with `+ Add` and `- Delete` buttons, row checkboxes, and a confirmation dialog (`Delete categories?`) on delete.
- Add an **Add Category** page (`/settings/issue-category/new`): a form with `Name` and `Display Name` fields that check for duplicates while the user types, a primary `Save` button, and a secondary `Cancel` button that returns to the list.
- Add the four new database env keys (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) to `packages/api/.env.example`; the API exits non-zero on boot if any are missing.
- Introduce role-based access control on top of the existing Cognito authentication. User roles live in Cognito groups and arrive in the access token's `cognito:groups` claim. The `t_issue_category` endpoints and both pages require membership in the `ADMIN` group. Add a reusable NestJS `@Roles(...)` decorator + `RolesGuard` so future features can declare role requirements as one-line annotations.
- Surface the caller's groups on the API side: extend the `CurrentUserPayload` with a `groups: string[]` derived from `accessClaims['cognito:groups']` (empty array when the claim is absent), so handlers and the new `RolesGuard` can branch on roles without re-parsing tokens.
- Surface the caller's groups on the web side: a small `useUserGroups()` hook decodes the access token JWT payload (Cognito includes `cognito:groups` in access tokens) and returns the string array. Use it to (a) hide the `Settings → Issue Category` menu entry from non-ADMIN users and (b) render a `403 Forbidden` placeholder if a non-ADMIN visits the pages directly.

## Capabilities

### New Capabilities

- `issue-category`: Database-backed CRUD for the issue-category taxonomy — the `t_issue_category` table schema, the four REST endpoints under `/api/issue-categories`, the All/Add pages in the web shell, and the duplicate-name rule that binds them together. Both pages and all four endpoints are gated to users in the `ADMIN` Cognito group.
- `mysql-persistence`: The shared MySQL connection layer used by `@wo-poc/api` — env-driven config (no hardcoded credentials), TypeORM `DataSource` initialization, and the `docs/database.sql` bootstrap script that every developer runs once. Future persistence features will plug into this same connection.
- `rbac`: Reusable role-based access control on top of the existing Cognito JWT layer — a `@Roles(...)` decorator and a global `RolesGuard` that reads `cognito:groups` from the verified access token, plus the matching web-side `useUserGroups()` hook used to hide UI a user is not authorized to access.

### Modified Capabilities

- `web-shell`: The sidebar menu requirement gains an `Issue Category` entry under the existing `Settings` group, routing to `/settings/issue-category`. The entry is visible only to users in the `ADMIN` Cognito group. The existing `Profile` and `Preferences` demo items remain.
- `cognito-auth`: The `@CurrentUser()` payload requirement gains a `groups: string[]` field derived from the verified access token's `cognito:groups` claim (empty array when the claim is absent), so role-aware handlers and the new `RolesGuard` can branch on roles without re-parsing tokens.

## Impact

- **Affected code (api)**: `packages/api/src/app/app.module.ts` (register `TypeOrmModule` + `IssueCategoryModule`, register `RolesGuard` globally), new files under `packages/api/src/app/config/` (extended `app-config.ts` for DB keys), new `packages/api/src/app/database/` (TypeORM module config factory), new `packages/api/src/app/issue-category/` (entity, controller, service, DTOs, module), new `packages/api/src/app/auth/roles.decorator.ts` and `packages/api/src/app/auth/roles.guard.ts`, and an extension to `packages/api/src/app/auth/jwt-auth.guard.ts` to attach `groups` to `request.user`.
- **Affected code (web)**: `packages/web/src/app/shell/menu-config.ts` (add `Settings → Issue Category` entry with a role requirement), `packages/web/src/app/shell/sidebar.tsx` (filter menu items by current user's groups), `packages/web/src/app/app.tsx` (add `/settings/issue-category` and `/settings/issue-category/new` routes), new `packages/web/src/app/auth/use-user-groups.ts` and `packages/web/src/app/auth/require-role.tsx` (a small wrapper that renders the page only for users in the required group), new `packages/web/src/app/pages/issue-category/` directory (`list-page.tsx`, `add-page.tsx`, and a small shared `useIssueCategories` hook).
- **New runtime dependencies**: `@nestjs/typeorm`, `typeorm`, `mysql2`, `class-validator`, `class-transformer` in the API. No new web dependencies — the existing `useApiFetch` covers the network layer and the JWT payload is a base64 split.
- **New env keys (api)**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Added to `packages/api/.env.example` with safe local-dev defaults (`127.0.0.1`, `3306`, `wo`, `wo`, `wo_poc`); the same keys must be set in the developer's `.env`.
- **New docs**: `docs/database.sql` containing the `CREATE DATABASE` and `CREATE TABLE t_issue_category` statements, so devs can `mysql -u root < docs/database.sql` to bootstrap.
- **Cognito configuration prerequisite**: An `ADMIN` group must exist in the configured Cognito user pool (`us-east-1_EsvS0Nskn`) and developer test accounts must be added to it. This is a one-time console action documented in `tasks.md`; the access token will then carry `cognito:groups: ["ADMIN"]` for those users.
- **Out of scope**: Editing categories (the spec only asks for list/add/delete); pagination, search, or filtering of categories; migration tooling (the bootstrap is a single SQL file; we will adopt a migration tool when we have a second table that needs to evolve); soft-delete; audit columns; per-row authorization (a user is either an `ADMIN` and can manage all categories, or they are not); IAM-style policy / permission strings (the role gate is a simple group-membership check, not a full RBAC matrix); managing Cognito groups from inside the app (group assignment is done in the AWS console).
