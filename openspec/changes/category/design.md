## Context

`@wo-poc/api` is currently a stateless NestJS app: it exposes `GET /api` (smoke) and `GET /api/me` (claims passthrough). There is no database connection, no ORM, no `database` module, and no migration tooling. `packages/api/.env.example` only lists three Cognito keys.

`docs/category.md` specifies the first persisted entity:

- Table: `t_issue_category`
- Columns: `id` (int, auto-increment, PK), `name` (varchar(255), unique), `display_name` (varchar(255), unique)
- Two pages: an `All Issue Categories` list (no pagination) with `+ Add` / `- Delete` buttons, and an `Add Category` form with live duplicate-name checks.
- Menu entry: `Settings → Issue Category` (the `Settings` group already exists in the demo sidebar seed with placeholder children).
- **Role gate**: both pages are restricted to users with the `ADMIN` role.

User roles are managed in the Cognito user pool as **Cognito groups**. The access token issued by Cognito carries the user's group membership as the `cognito:groups` claim (a JSON array of group names). The existing `JwtAuthGuard` already verifies access tokens and attaches the decoded claims to `request.user.accessClaims`, but does not yet surface the groups as a typed first-class field.

Because this is the first feature to touch a database, the change carries two concerns at once: the **shared persistence layer** (env config, connection module, bootstrap script) and the **feature itself** (table, endpoints, pages). Both are scoped here so the foundation lands together with the first concrete consumer — every later persisted entity will reuse the same pattern without re-litigating the database choice. The change also lands a **reusable role-based access control layer** (`@Roles(...)` decorator, `RolesGuard`, `useUserGroups()` hook) so that future role-gated features cost one annotation, not a re-implementation.

The web side already has the patterns we need: `useApiFetch()` (`packages/web/src/app/auth/use-api-fetch.ts`) sets `Authorization` and `X-Id-Token` headers and prepends `/api`, and the sidebar reads from a static `menu-config.ts` array. Pages live under `packages/web/src/app/pages/` and load data with the same `useState`/`useEffect` pattern shown in `profile-page.tsx`.

## Goals / Non-Goals

**Goals:**

- A single, env-driven MySQL connection that every future persistence feature can reuse without changing module wiring.
- Zero hardcoded secrets — host, port, user, password, and database name all read from `process.env`; the example file is checked in with safe local-dev defaults.
- A reproducible local bootstrap: `mysql -u root < docs/database.sql` creates the database and the `t_issue_category` table.
- Full vertical coverage for Issue Category: API endpoints + web pages + sidebar entry, behind the existing Cognito auth guard.
- Live duplicate detection in the Add Category form, plus a database UNIQUE constraint as the final source of truth (defense in depth — the form check is a UX nicety; the constraint is the contract).
- A reusable role-based access control surface that future features can adopt as `@Roles('ADMIN')` on a controller (API) and `<RequireRole role="ADMIN">` around a page (web) — no per-feature parsing of `cognito:groups`.

**Non-Goals:**

- A migrations framework (TypeORM CLI / Prisma / Flyway). We have one table and one schema file; introducing a migration tool now is premature. A separate change will introduce one when we have a second table that needs to evolve in production.
- Editing an existing category. The spec only asks for list/add/delete. A future change can add `PATCH /api/issue-categories/:id` and an Edit page.
- Pagination, search, filtering, or sorting beyond the default-by-id order. The spec explicitly says "no pagination".
- Soft-delete, audit columns (`created_at` / `updated_at` / `created_by`), or change history. The two-column schema in `docs/category.md` is honored exactly.
- A full RBAC matrix (roles × permissions × resources). The role check this change adds is a simple "is the caller a member of group X?" test — adequate for `ADMIN`-only pages, and easy to extend later if we ever need permission strings.
- Managing Cognito groups from inside the app. Group membership is administered in the AWS Cognito console; the app only reads it.
- Per-row authorization (e.g. "this admin can manage these categories"). All admins can manage all categories.
- Client-side data caching (TanStack Query / SWR). The list reloads on mount and after every mutation; the pages do not need cross-route caching for this volume of data.

## Decisions

### 1. ORM choice: TypeORM via `@nestjs/typeorm`

We adopt **TypeORM** with the `@nestjs/typeorm` integration module. Reasons:

- It is the ORM that NestJS's official documentation uses for its database chapter, so the patterns (`forRoot`, `forFeature`, `@Entity`, `@InjectRepository`) match what any new contributor will find when searching for "NestJS MySQL".
- It supports MySQL out of the box via the `mysql2` driver — no extra wrapper, no separate connection pool.
- It gives us entity classes that double as the type contract for the API layer, so `IssueCategoryEntity` is both the row shape and the return type — no parallel DTO needed except for input validation.
- Decorator-based mapping fits the existing `@Controller` / `@Module` style already in this codebase.

Alternatives considered:

- **Prisma**: excellent DX but adds a code-generation step, a separate `schema.prisma` source of truth (in addition to `docs/database.sql`), and a `prisma generate` build dependency. The duplication between `schema.prisma` and `docs/database.sql` is exactly the kind of drift hazard we want to avoid for a POC. Revisit when migrations become a real concern.
- **Sequelize**: older, less idiomatic in NestJS than TypeORM, no significant advantage here.
- **Knex.js / `mysql2` directly**: gives us full SQL control but forces us to hand-roll repositories, type mapping, and connection-lifecycle handling. Not worth it for a table with two columns.

Trade-off accepted: TypeORM's `synchronize: true` would auto-create tables from entity decorators, but we deliberately set `synchronize: false` (see decision 4) so the canonical schema lives in `docs/database.sql` only.

### 2. Database configuration is an extension of the existing `AppConfig`

We extend `packages/api/src/app/config/app-config.ts` rather than introducing a parallel `DatabaseConfig`. The existing pattern is:

```ts
export type AppConfig = {
  cognitoAuthority: string;
  // …
};

export function loadAppConfig(): AppConfig {
  // reads process.env, throws if any required key is missing
}
```

Adding `db: { host, port, user, password, name }` keeps a single source of truth for "what env vars does the API need to boot" and a single failure mode at startup ("missing required environment variables: DB_HOST, DB_PASSWORD"). The five new keys are:

| Key           | Type   | Example default in `.env.example` | Purpose                              |
| ------------- | ------ | --------------------------------- | ------------------------------------ |
| `DB_HOST`     | string | `127.0.0.1`                       | MySQL server host                    |
| `DB_PORT`     | number | `3306`                            | MySQL server port                    |
| `DB_USER`     | string | `wo`                              | Account used for connection          |
| `DB_PASSWORD` | string | `wo`                              | Password for that account            |
| `DB_NAME`     | string | `wo_poc`                          | Database (schema) the API connects to |

`DB_PORT` is the only numeric key; `loadAppConfig` parses it with `Number()` and rejects `NaN` (same pattern other configs use). `DB_PASSWORD` may be the empty string only if MySQL is running in a development mode that accepts that — we still require the key to be set so devs never accidentally inherit a missing-env failure on the connection step.

### 3. NestJS database module shape: a `DatabaseModule` that calls `TypeOrmModule.forRootAsync`

We add a thin `packages/api/src/app/database/database.module.ts`:

```ts
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<AppConfig>) => ({
        type: 'mysql',
        host: cfg.get('db.host', { infer: true }),
        port: cfg.get('db.port', { infer: true }),
        username: cfg.get('db.user', { infer: true }),
        password: cfg.get('db.password', { infer: true }),
        database: cfg.get('db.name', { infer: true }),
        entities: [IssueCategoryEntity],
        synchronize: false,
        logging: ['error', 'warn'],
      }),
    }),
  ],
})
export class DatabaseModule {}
```

`app.module.ts` imports `DatabaseModule` once (alongside `AuthModule`, `MeModule`, `IssueCategoryModule`). Feature modules use `TypeOrmModule.forFeature([…])` to register their entities. This separation means a future `WorkOrderModule` just adds itself to `app.module.ts` and calls `forFeature` — it does not have to know about connection wiring.

We deliberately list `entities` explicitly rather than using `autoLoadEntities: true`. With Nx + webpack the autoload glob is fragile across build configurations; explicit registration is one extra line per entity and prevents "works locally, broken in dist" surprises.

### 4. Schema is hand-written in `docs/database.sql`; `synchronize: false` always

The canonical schema lives in `docs/database.sql` and is the file devs run to bootstrap. The TypeORM `synchronize` flag is **off** (in dev and forever) so the entity decorators cannot silently drift away from the SQL file. The entity class mirrors the SQL but the SQL wins:

```sql
-- docs/database.sql
CREATE DATABASE IF NOT EXISTS wo_poc
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE wo_poc;

CREATE TABLE IF NOT EXISTS t_issue_category (
  id           INT          NOT NULL AUTO_INCREMENT,
  name         VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_t_issue_category_name (name),
  UNIQUE KEY uk_t_issue_category_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Notes:

- `utf8mb4` is the only sane default for any new MySQL table — full Unicode and emoji.
- `IF NOT EXISTS` makes the script idempotent so devs can re-run it without dropping state.
- The two UNIQUE indexes are named explicitly so they can be referenced in `ER_DUP_ENTRY` error parsing later if needed (though our duplicate-check endpoint avoids relying on exception parsing — see decision 6).
- `docs/category.md` says `name` and `display_name` are `Nullable: <blank>`. We interpret the blank as **NOT NULL** because a category with no name is meaningless. If the user clarifies later that null is acceptable, the column can be relaxed without a data migration since no rows can violate the new constraint.

### 5. Entity / DTO / endpoint shape

The entity:

```ts
@Entity({ name: 't_issue_category' })
export class IssueCategoryEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', length: 255, unique: true }) name!: string;
  @Column({ name: 'display_name', type: 'varchar', length: 255, unique: true }) displayName!: string;
}
```

The public API surface (rooted at `/api/issue-categories`):

| Method | Path                                  | Body / Query                                  | Response                                          | Status codes                |
| ------ | ------------------------------------- | --------------------------------------------- | ------------------------------------------------- | --------------------------- |
| GET    | `/api/issue-categories`               | —                                             | `IssueCategoryDto[]` (ordered by id ASC)          | 200                         |
| POST   | `/api/issue-categories`               | `{ name: string, displayName: string }`       | `IssueCategoryDto` of the created row             | 201, 400 (validation), 409 (dup) |
| DELETE | `/api/issue-categories`               | `{ ids: number[] }`                           | `{ deleted: number }`                             | 200, 400 (empty array)      |
| GET    | `/api/issue-categories/exists`        | `?name=…&displayName=…` (both optional)       | `{ name: boolean, displayName: boolean }`         | 200                         |

`IssueCategoryDto = { id: number; name: string; displayName: string }`. We expose `displayName` (camelCase) on the wire even though the column is `display_name` — the entity's `@Column({ name: 'display_name' })` decorator handles the mapping. The API contract belongs to TypeScript, not to MySQL's naming convention.

Validation uses `class-validator` decorators on the request DTOs (`@IsString()`, `@MaxLength(255)`, `@IsArray()`, `@ArrayMinSize(1)`). The global `ValidationPipe` is added in `main.ts` so unknown / malformed bodies get a 400 with field-level messages.

### 6. Duplicate detection: explicit pre-check endpoint AND database UNIQUE constraint

The Add Category form needs live feedback as the user types. Two layers cooperate:

1. **`GET /api/issue-categories/exists?name=&displayName=`** answers "is this value already taken?" without creating anything. The form debounces user input (300 ms) and calls this endpoint to display inline `Name already exists` / `Display Name already exists` errors. The endpoint accepts either or both query parameters; missing parameters simply return `false` for that field. This avoids a race where the user fills in one field, then changes the other — only the field they touched needs a re-check.
2. **`POST /api/issue-categories`** checks for duplicates inside a single repository call (`findBy({ name }) | findBy({ displayName })`) and returns `409 Conflict` with a body that names which field collided, e.g. `{ field: 'name', value: 'hardware' }`. If for any reason the pre-check is stale (a different tab created the row in between), the create still fails cleanly.
3. The **database UNIQUE constraints** on `name` and `display_name` are the final backstop. If both the pre-check and the application-level check race past each other (extremely unlikely with a single user, possible with concurrent admins), MySQL returns `ER_DUP_ENTRY` (1062). The controller catches this specific error and maps it to the same `409` response shape so the client sees one error model.

Why not rely on the UNIQUE constraint alone? Mapping driver-level errors to user-facing field names is fragile (the error message format is not part of the SQL standard), and we want the happy-path error message to be authored by us, not by mysql2. The constraint is the safety net, not the primary check.

### 7. Web routing and pages

Two new routes are added to `packages/web/src/app/app.tsx`, before the catch-all `*`:

- `/settings/issue-category` → `<IssueCategoryListPage />`
- `/settings/issue-category/new` → `<IssueCategoryAddPage />`

We deliberately do **not** introduce a router param like `/settings/issue-category/:id/edit` — the spec has no edit page, and we follow YAGNI.

The pages live under `packages/web/src/app/pages/issue-category/`:

- `list-page.tsx` — loads via `apiFetch('/issue-categories')` on mount; renders a table with a header-row checkbox (select all), a row checkbox, `#<id>`, `Name`, `Display Name`. The `+ Add` button calls `navigate('/settings/issue-category/new')`. The `- Delete` button is disabled while no rows are selected; clicking it opens a centered confirmation dialog with the literal text `Delete categories?` plus `Cancel` / `Delete` buttons. Confirm posts `DELETE /api/issue-categories` with the selected ids and reloads the list.
- `add-page.tsx` — controlled form with two text inputs. Each input is debounced 300 ms; after the debounce, the form calls `/issue-categories/exists` for that field and shows an inline error if `true`. `Save` is disabled while either field is empty, while either has a duplicate error, or while a check is in-flight. Saving posts `POST /api/issue-categories`; on success, navigate back to `/settings/issue-category`. `Cancel` navigates back without saving.

State stays local — `useState` + `useEffect`, no global store, no react-query — matching the existing `profile-page.tsx` pattern.

### 8. Sidebar menu entry

`packages/web/src/app/shell/menu-config.ts` already declares a `settings` group with two demo children (`Profile`, `Preferences`). We prepend a new child:

```ts
{ id: 'settings-issue-category', label: 'Issue Category', to: '/settings/issue-category' },
```

The `Profile` and `Preferences` entries stay (they are still demo placeholders that test the two-level menu). The Issue Category entry is the first non-demo child in the sidebar.

### 9. Error model and HTTP semantics

- `400 Bad Request`: validation failure on body shape. Nest's `ValidationPipe` produces the response.
- `401 Unauthorized`: produced by the existing global `JwtAuthGuard` — no Issue Category code knows about auth at all.
- `403 Forbidden`: produced by the new global `RolesGuard` when the caller is authenticated but does not have a required group (`@Roles('ADMIN')`). The body has the standard Nest shape `{ statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' }`.
- `409 Conflict`: returned by both `POST` and `DELETE` (when an id does not exist? — see below) and shaped as `{ statusCode: 409, message: '<reason>', field?: 'name' | 'displayName', value?: string }`.
- `200 OK` on `DELETE /api/issue-categories` returns `{ deleted: <count> }`. If the user submits ids that don't exist, those ids are silently ignored — the `deleted` count tells the truth. We do **not** return 404 for missing ids; bulk delete semantics treat the operation as "best effort, count what landed".

### 10. Configuration boot order

`main.ts` reads `PORT` via `ConfigService` and bootstraps Nest. `TypeOrmModule.forRootAsync` runs **after** `ConfigModule.forRoot()` because it `inject: [ConfigService]` — so if `loadAppConfig` throws on missing DB keys, the process exits before TypeORM ever tries to open a connection. The boot failure mode is therefore: **missing env → config error**, **bad credentials → TypeORM connection error logged and process exits**. Both are at startup, never at request time, so a successfully booted API is one with a verified DB connection.

### 11. Role-based access control: where the role data lives, and the two-guard pipeline

The Cognito user pool already holds groups; an `ADMIN` group is created in the AWS console and developer test accounts are added to it (a one-time setup, documented in `tasks.md`). Cognito then includes `cognito:groups: ['ADMIN', ...]` in the **access token** issued to those users (the ID token also carries the claim in standard Cognito configurations, but access tokens are the authoritative source for authorization decisions, so we read from there).

The API runs two guards in order:

1. `JwtAuthGuard` (already global) — verifies the access token, attaches `request.user` with the verified claims. Extended in this change to also attach `groups: string[]` derived from `accessClaims['cognito:groups']` (defaulting to `[]` when the claim is absent). The `CurrentUserPayload` type gains the field; `@CurrentUser() user` now has `user.groups` available.
2. `RolesGuard` (new, registered globally via `APP_GUARD` immediately after `JwtAuthGuard`) — reads required roles from `Reflector.getAllAndOverride(ROLES_KEY, [handler, class])`. If no `@Roles(...)` was declared, the guard returns `true` (controllers without a role annotation are not role-gated). If roles are required, the guard returns `true` iff `user.groups` intersects the required list. Otherwise it throws `ForbiddenException`.

Ordering matters. The `JwtAuthGuard` must run **before** the `RolesGuard` so that `request.user` is populated when the roles guard reads it. NestJS runs `APP_GUARD` providers in registration order, so we register `JwtAuthGuard` first and `RolesGuard` second in `app.module.ts`.

Why a separate guard instead of folding the role check into `JwtAuthGuard`? Two reasons. First, single responsibility: the existing guard's job is "does this token verify?" The new guard's job is "is this verified user authorized?" Mixing them couples two unrelated concerns and makes `@Public()` interaction subtler than it needs to be. Second, future flexibility: `RolesGuard` can be applied locally (`@UseGuards`) by a non-default controller, or removed globally without touching the JWT verification logic.

The `@Roles(...)` decorator and `@Public()` decorator do **not** conflict. A handler marked `@Public()` skips `JwtAuthGuard` (which short-circuits on the `IS_PUBLIC_KEY` reflection); since `RolesGuard` reads `request.user` and a public request has none, an admin-only public endpoint would be incoherent. We add a guard rule that `RolesGuard` also short-circuits on `IS_PUBLIC_KEY` (returns `true`) so the two annotations never interact incorrectly — though the cleaner discipline is "don't put `@Roles` on a `@Public()` endpoint", which we follow by convention.

Controller usage is intentionally light:

```ts
@Controller('issue-categories')
@Roles('ADMIN')
export class IssueCategoryController {
  // every method inherits the @Roles('ADMIN') declaration
}
```

Class-level `@Roles` is preferred over method-level for this feature because all four endpoints share the same gate. Method-level `@Roles` is still supported by the reflector lookup (`getAllAndOverride`), so future controllers can mix policies if needed.

### 12. Surfacing groups on the web side: decode the access token, don't add a network call

On the web side, the role data is needed for two UI decisions:

1. **Hide the `Settings → Issue Category` menu entry** from users without the `ADMIN` role.
2. **Render a `403 Forbidden` placeholder** on the category pages if a non-ADMIN visits them directly (typing the URL or following a stale bookmark).

The access token is already in browser memory via `react-oidc-context` (`auth.user?.access_token`). We decode its payload client-side:

```ts
// packages/web/src/app/auth/decode-jwt.ts
export function decodeJwtPayload<T = Record<string, unknown>>(jwt: string): T {
  const [, payload] = jwt.split('.');
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64)) as T;
}
```

```ts
// packages/web/src/app/auth/use-user-groups.ts
export function useUserGroups(): string[] {
  const auth = useAuth();
  return useMemo(() => {
    const token = auth.user?.access_token;
    if (!token) return [];
    try {
      const claims = decodeJwtPayload<{ 'cognito:groups'?: string[] }>(token);
      return claims['cognito:groups'] ?? [];
    } catch {
      return [];
    }
  }, [auth.user?.access_token]);
}
```

Why decode client-side instead of returning groups from `/api/me`? Three reasons:

- **Latency**: no extra round trip for a decision the SPA needs on every render of the sidebar.
- **State coherence**: the groups are tied to the access token; when the token rotates, the groups recompute via the same `useAuth` subscription that drives the rest of the app. An `/api/me`-sourced array would lag the token.
- **Trust model**: client-side authorization decisions are advisory UX. The API is the only authority. We do not need to verify the JWT signature on the web — we are not granting access; we are deciding whether to render a UI element. The API guard re-verifies on every request.

Alternatives considered:

- **Read from the ID token's `profile`** (`auth.user?.profile['cognito:groups']`). The ID token *can* include groups, but only if the user pool's attribute mapping is configured to do so. The access token always carries `cognito:groups` for users in groups. Reading from the access token is the portable default.
- **Decode and verify on the web side** (signature + issuer + audience). Pointless: the API already verifies, and a tampered token will fail there. Verifying on the web only adds bundle weight.
- **Pass groups through `/api/me`** as `{ groups: string[] }`. Defer: `/api/me`'s payload is a contract owned by `cognito-auth`; we do not need to extend it for a UX decision the web can make locally.

### 13. Web menu filtering and route gating

The sidebar reads from `menu-config.ts`. We add an optional `roles?: string[]` field to `MenuItem`:

```ts
export type MenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  to?: string;
  children?: MenuItem[];
  roles?: string[];  // if set, item is visible only to users with at least one of these groups
};
```

`sidebar.tsx` filters `DEMO_MENU` once per render using `useUserGroups()`: any item whose `roles` array is non-empty and disjoint from the user's groups is dropped (along with its subtree). A group whose children all get filtered also disappears, so a user without `ADMIN` does not see an empty `Settings` group if Issue Category were its only entry. (In this change `Settings` keeps its `Profile` and `Preferences` demo children, which have no `roles` filter, so the `Settings` group remains visible to everyone.)

Route gating uses a small wrapper component:

```ts
// packages/web/src/app/auth/require-role.tsx
export function RequireRole({ role, children }: { role: string; children: ReactNode }) {
  const groups = useUserGroups();
  if (!groups.includes(role)) {
    return <ForbiddenPage />;
  }
  return <>{children}</>;
}
```

The two category routes in `app.tsx` wrap their elements in `<RequireRole role="ADMIN">`, so a non-ADMIN who visits `/settings/issue-category` directly sees the `403` placeholder rather than a flashing-then-failing list. The `<ForbiddenPage />` is a small component that renders `403 — You do not have permission to view this page`; it shares the existing page chrome.

This is UX, not security. The API would refuse the call anyway. But "401 in the inspector with no UI feedback" is a worse experience than "a clear page that says you don't have access".

## Risks / Trade-offs

- **Risk**: The bootstrap SQL diverges from the entity decorators as more columns are added. → **Mitigation**: `synchronize: false` so TypeORM never silently rewrites the table. Every column change requires editing `docs/database.sql`, which a code review will catch. When the schema gets a second table, we will move from a hand-written SQL file to a real migration tool (separate change).
- **Risk**: `mysql2` is added without a connection pool tuning step. → **Mitigation**: TypeORM's defaults (pool size 10, 60 s acquire timeout) are appropriate for this POC. Future load testing will tune `extra.connectionLimit`.
- **Risk**: The duplicate-check endpoint is racy under concurrent admins — two tabs can both pre-check, both see `false`, both POST, one wins on the UNIQUE constraint. → **Mitigation**: the `POST` handler catches MySQL's `ER_DUP_ENTRY` (error code 1062) and re-maps it to the same 409 response shape the pre-check informs. The user experience degrades from "live inline error" to "submit then error", which is acceptable for a settings page used by one admin at a time.
- **Risk**: `DB_PASSWORD` in `.env.example` is the literal string `wo`, which a developer might assume is the production credential. → **Mitigation**: `.env.example` is local-dev-only by convention; `.env` is git-ignored. The README task in `tasks.md` will state that no production credentials live in this repo.
- **Risk**: A developer runs `docs/database.sql` against a production database. → **Mitigation**: the script uses `IF NOT EXISTS` so it is idempotent and creates a database literally named `wo_poc` — production databases would have a different name. The script is documented as a local-dev bootstrap, not a deployment artifact.
- **Risk**: `class-validator` and `class-transformer` are not yet in the workspace, so adding validation pipelines requires two new runtime deps. → **Mitigation**: both are tiny, widely used, and are the standard Nest validation pair documented in the official Nest validation chapter. Worth the dep cost for the 400-response quality alone.
- **Risk**: The Cognito user pool does not yet have an `ADMIN` group, so the first developer to test the feature gets a `403` from their own admin endpoint. → **Mitigation**: `tasks.md` includes the one-time AWS console step ("Create group `ADMIN` in user pool `us-east-1_EsvS0Nskn` and add the developer's test account to it"). After the group exists, sign-out and sign-in is required to pick up the new claim in the access token.
- **Risk**: A user is added to `ADMIN` while they are signed in; their token still has `cognito:groups: []` until the token rotates. → **Mitigation**: documented behavior — the role takes effect on the next sign-in (or silent renewal). We do not force-refresh tokens on group changes; that would require server-push infrastructure we don't have. The mitigation cost is one sign-out / sign-in cycle by the affected user, which matches how Cognito's session model already works.
- **Risk**: A non-`ADMIN` user crafts a request directly with `curl` and a valid access token. → **Mitigation**: `RolesGuard` runs server-side on every request and reads `cognito:groups` from the **verified** access token (not from a request header the client could spoof). The web-side hiding is purely UX; the server is the authority.
- **Risk**: Client-side JWT decode (`atob`) misbehaves on a malformed token. → **Mitigation**: the `decodeJwtPayload` helper wraps in `try/catch` and the `useUserGroups` hook returns `[]` on any failure. A failure means the user has no roles, which is the safe default (UI hides the entry, route shows 403). The API would also reject any actual call with a malformed token.
- **Trade-off**: TypeORM adds ~1 MB to the API bundle and a non-trivial decorator surface. Acceptable: it replaces ~300 lines of hand-rolled SQL repository code that we would otherwise own. For a workspace that will accumulate persistence features, the floor (per-feature code) drops fast.
- **Trade-off**: We are not using a migrations framework. Acceptable while the schema is one file; revisit at the second table.
- **Trade-off**: We do not implement edit on the categories page. Acceptable: matches `docs/category.md` exactly. A future change can add it without breaking any API contract.
- **Trade-off**: We chose group-membership-as-role over a richer permission model (e.g. `categories:read`, `categories:write`). Acceptable for this scale; revisit if the role surface gets complex enough that "is-ADMIN" no longer fits.

## Migration Plan

- Greenfield persistence. There is no existing database, no rows to migrate, no behavior to preserve. Rollback is `git revert`; there is no production schema to undo.
- Developer steps (documented in `tasks.md`):
  1. Install MySQL locally (Homebrew: `brew install mysql && brew services start mysql`) and create a development account, e.g. `CREATE USER 'wo'@'localhost' IDENTIFIED BY 'wo'; GRANT ALL ON wo_poc.* TO 'wo'@'localhost';`.
  2. Run `mysql -u wo -p wo_poc < docs/database.sql` (or run the script as root if the user doesn't exist yet — the script creates the database before the table).
  3. Copy `packages/api/.env.example` → `packages/api/.env`. Adjust DB credentials if local MySQL differs from the defaults.
  4. `npm install` for the new deps.
  5. **Create the `ADMIN` Cognito group** in user pool `us-east-1_EsvS0Nskn` (AWS console → User Pools → Groups → Create group → name `ADMIN`) and add the developer's test account to it. Sign out and sign in again so the new access token carries `cognito:groups: ['ADMIN']`.
  6. `npx nx serve @wo-poc/api` — connection should succeed and the route `GET /api/issue-categories` should return `[]` with a valid bearer token from an admin user. A non-admin user should get `403`.
- CI considerations: this change does not add a database to CI. Future CI work will spin up a MySQL container; for now, type-checks and builds (which do not touch a real DB) cover the regression surface.

## Open Questions

- The user-pool's existing API client already sends `Authorization` and `X-Id-Token` headers. The new endpoints inherit the global `JwtAuthGuard`, so no client change is needed — confirm by smoke-testing one endpoint after wiring.
- Should the Delete confirmation dialog show the count of selected rows (e.g. `Delete 3 categories?`)? `docs/category.md` says the text is exactly `Delete categories?`. We honor the literal text; if a future review wants the count, it's a one-line change.
- The `Settings` group in the sidebar currently has two demo children (`Profile`, `Preferences`). Once Issue Category lands as the first real child, should the demo children be removed? Out of scope here; a follow-up change can prune the demo entries once each gets a real replacement.
- Should the `403` page offer a "request access" CTA (e.g. a `mailto:` to the workspace admin)? Not in scope here; we render a static placeholder. Easy to enhance later without changing the role-check contract.
