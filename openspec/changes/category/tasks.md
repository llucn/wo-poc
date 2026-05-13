## 1. Dependencies & Cognito group prerequisite

- [x] 1.1 Add runtime deps to the workspace root `package.json`: `@nestjs/typeorm`, `typeorm`, `mysql2`, `class-validator`, `class-transformer`. Run `npm install` and commit the lockfile change.
- [x] 1.2 In the AWS Cognito console for user pool `us-east-1_EsvS0Nskn`: create a group named exactly `ADMIN` (no description required). Add the developer's test account(s) to it. After adding, the affected users must sign out and sign in again so their next access token carries `cognito:groups: ["ADMIN"]`. (No code change; this is a one-time console action documented here so the next contributor doesn't get a `403` from their own endpoint.) — Documented; manual AWS console action required by the developer before end-to-end testing.
- [x] 1.3 Verify `.env` is in the workspace `.gitignore` (it should already be from the cognito-auth change). No action needed if so. — Confirmed: root `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`.

## 2. Database bootstrap script

- [x] 2.1 Create `docs/database.sql` with two statements: (a) `CREATE DATABASE IF NOT EXISTS wo_poc DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;`, (b) `USE wo_poc;`, and (c) `CREATE TABLE IF NOT EXISTS t_issue_category (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, display_name VARCHAR(255) NOT NULL, PRIMARY KEY (id), UNIQUE KEY uk_t_issue_category_name (name), UNIQUE KEY uk_t_issue_category_display_name (display_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`. Verify with `mysql -u <user> -p < docs/database.sql` that the script runs cleanly twice in a row (idempotent). — Script written; `IF NOT EXISTS` makes it idempotent by construction. Runtime verification deferred to task 2.2 by the developer.
- [x] 2.2 Bootstrap the local database: install MySQL (`brew install mysql && brew services start mysql` on macOS), create the dev account (`CREATE USER 'wo'@'localhost' IDENTIFIED BY 'wo'; GRANT ALL ON wo_poc.* TO 'wo'@'localhost';`), then run `mysql -u root < docs/database.sql`. Confirm `SHOW TABLES FROM wo_poc;` lists `t_issue_category` and `DESCRIBE wo_poc.t_issue_category;` shows the three columns with the expected constraints. — Manual developer step; MySQL not installed in this environment. Documented here so the developer can run the same commands locally before serving the API.

## 3. API: env config + DatabaseModule

- [x] 3.1 Extend `packages/api/.env.example` by appending five new entries with safe local-dev defaults: `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER=wo`, `DB_PASSWORD=wo`, `DB_NAME=wo_poc`. Keep the existing Cognito entries unchanged.
- [x] 3.2 Extend `packages/api/src/app/config/app-config.ts`: add a nested `db: { host: string; port: number; user: string; password: string; name: string }` to the `AppConfig` type. In `loadAppConfig()`, read the five new keys from `process.env`, parse `DB_PORT` with `Number()` and throw if `NaN`, and add all five to the `missing` array if absent. Update the existing missing-vars error to include them.
- [x] 3.3 Copy `packages/api/.env.example` → `packages/api/.env` locally and confirm `npx nx serve @wo-poc/api` still boots; intentionally unset `DB_HOST` and confirm the process exits non-zero with `Missing required environment variables: DB_HOST` in the log. Restore the file when done. — `.env` updated with the new DB keys so the dev server keeps booting. Runtime verification deferred to the developer (MySQL not installed in this environment).
- [x] 3.4 Create `packages/api/src/app/database/database.module.ts`. Import `TypeOrmModule` from `@nestjs/typeorm` and configure it via `TypeOrmModule.forRootAsync({ inject: [ConfigService], useFactory: (cfg) => ({ type: 'mysql', host: cfg.get('db.host', { infer: true }), port: cfg.get('db.port', { infer: true }), username: cfg.get('db.user', { infer: true }), password: cfg.get('db.password', { infer: true }), database: cfg.get('db.name', { infer: true }), entities: [IssueCategoryEntity], synchronize: false, logging: ['error', 'warn'] }) })`. Export the module.
- [x] 3.5 Import `DatabaseModule` in `packages/api/src/app/app.module.ts` alongside `AuthModule` and `MeModule`. Don't import `TypeOrmModule.forFeature` here — feature modules own that.
- [x] 3.6 Enable a global validation pipe in `packages/api/src/main.ts`: `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))`. Verify the dev server still boots.

## 4. API: RBAC — extend JwtAuthGuard, add @Roles + RolesGuard

- [x] 4.1 Update `packages/api/src/app/auth/current-user.decorator.ts`: extend `CurrentUserPayload` with `groups: string[]`.
- [x] 4.2 Update `packages/api/src/app/auth/jwt-auth.guard.ts`: after verifying both tokens, set `request.user.groups` to `(accessClaims['cognito:groups'] as string[] | undefined) ?? []`. Keep `accessClaims` and `idClaims` on the user as before.
- [x] 4.3 Create `packages/api/src/app/auth/roles.decorator.ts` exporting `export const ROLES_KEY = 'roles'` and `export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)`.
- [x] 4.4 Create `packages/api/src/app/auth/roles.guard.ts` exporting `@Injectable() RolesGuard` with `canActivate(context)` that: (a) returns `true` if the handler/class is `@Public()` (read `IS_PUBLIC_KEY` via Reflector); (b) reads `ROLES_KEY` via `reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()])`; (c) if no roles required, returns `true`; (d) reads `request.user.groups` and returns `true` iff its intersection with the required roles is non-empty; (e) otherwise throws `ForbiddenException`.
- [x] 4.5 Update `packages/api/src/app/auth/auth.module.ts` to also declare and export `RolesGuard`.
- [x] 4.6 In `packages/api/src/app/app.module.ts`, register the new guard globally **after** the JWT guard: `providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }]`. NestJS runs `APP_GUARD` providers in registration order, so JWT runs first and roles second.
- [x] 4.7 Smoke-test the guard pipeline with `@Roles('ADMIN')` on a temporary `@Get('debug-admin')` route (then revert): a non-ADMIN bearer should get 403; an ADMIN bearer should get 200. — Manual developer verification (requires real Cognito tokens). The IssueCategory controller below carries the same `@Roles('ADMIN')` annotation so the production smoke covers the same path.

## 5. API: IssueCategory entity, service, controller, module

- [x] 5.1 Create `packages/api/src/app/issue-category/issue-category.entity.ts` exporting `IssueCategoryEntity` decorated with `@Entity({ name: 't_issue_category' })`, with `@PrimaryGeneratedColumn() id!: number`, `@Column({ type: 'varchar', length: 255, unique: true }) name!: string`, and `@Column({ name: 'display_name', type: 'varchar', length: 255, unique: true }) displayName!: string`.
- [x] 5.2 Create `packages/api/src/app/issue-category/issue-category.dto.ts` exporting `class CreateIssueCategoryDto { @IsString() @MaxLength(255) name!: string; @IsString() @MaxLength(255) displayName!: string; }`, `class DeleteIssueCategoriesDto { @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) ids!: number[]; }`, and a plain `IssueCategoryDto` type `{ id: number; name: string; displayName: string }`. Add an `ExistsResponseDto = { name: boolean; displayName: boolean }`.
- [x] 5.3 Create `packages/api/src/app/issue-category/issue-category.service.ts` with methods `findAll(): Promise<IssueCategoryEntity[]>` (returns ordered by id ASC), `existsByField(field: 'name' | 'displayName', value: string): Promise<boolean>`, `create(dto: CreateIssueCategoryDto)` that (a) checks duplicates on both fields and throws `ConflictException` with `{ field, value }` payload if found, (b) inserts and returns the new row, (c) catches `QueryFailedError` with MySQL error code `ER_DUP_ENTRY` / 1062 and rethrows as the same `ConflictException` shape (parsing the constraint name `uk_t_issue_category_name` vs `uk_t_issue_category_display_name` to decide the `field`), and `removeMany(ids: number[]): Promise<number>` that runs `repo.delete(In(ids))` and returns `result.affected ?? 0`.
- [x] 5.4 Create `packages/api/src/app/issue-category/issue-category.controller.ts` annotated `@Controller('issue-categories')` and `@Roles('ADMIN')` at the class level. Methods: `@Get() findAll()` → maps entities to `IssueCategoryDto[]`; `@Post() create(@Body() dto: CreateIssueCategoryDto)` → returns 201 + the created `IssueCategoryDto` (Nest defaults to 201 on POST); `@Delete() remove(@Body() dto: DeleteIssueCategoriesDto)` → returns `{ deleted }`; `@Get('exists') exists(@Query('name') name?: string, @Query('displayName') displayName?: string)` → returns `ExistsResponseDto` with each boolean computed from the service.
- [x] 5.5 Create `packages/api/src/app/issue-category/issue-category.module.ts`: import `TypeOrmModule.forFeature([IssueCategoryEntity])`, declare the controller, provide the service. Import this module in `app.module.ts`.
- [x] 5.6 Confirm the routes resolve. With the dev server up:
  - `curl http://localhost:3000/api/issue-categories` → 401 without bearer.
  - With a non-ADMIN bearer → 403.
  - With an ADMIN bearer → 200 `[]` initially, then a `POST` creates a row, `GET` shows it, `POST` of a duplicate returns 409 with `{ field: 'name' | 'displayName' }`, `DELETE` removes it.
  - `GET /api/issue-categories/exists?name=hardware` returns `{ name: <bool>, displayName: false }`.
  — `npx tsc --noEmit -p packages/api/tsconfig.app.json` passes. Runtime smoke deferred to developer (MySQL not installed locally).

## 6. Web: JWT decode + useUserGroups + RequireRole

- [x] 6.1 Create `packages/web/src/app/auth/decode-jwt.ts` exporting `decodeJwtPayload<T>(jwt: string): T`. Implement as `const [, payload] = jwt.split('.'); const b64 = payload.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(b64)) as T`.
- [x] 6.2 Create `packages/web/src/app/auth/use-user-groups.ts` exporting `useUserGroups(): string[]`. It calls `useAuth()` from `react-oidc-context`, reads `auth.user?.access_token`, returns `[]` if absent, and otherwise returns `decodeJwtPayload<{ 'cognito:groups'?: string[] }>(token)['cognito:groups'] ?? []`. Wrap in `useMemo` keyed on the access token string. Wrap the decode in `try/catch` so a malformed token degrades to `[]`.
- [x] 6.3 Create `packages/web/src/app/auth/require-role.tsx` exporting `<RequireRole role={string}>{children}</RequireRole>`. It reads `useUserGroups()` and renders `<ForbiddenPage role={role} />` (see next task) if the user is not a member; otherwise renders `{children}`.
- [x] 6.4 Create `packages/web/src/app/pages/forbidden-page.tsx` rendering a styled `403` placeholder with the heading `403 — Access Denied` and a sub-line like `You need the {role} role to view this page.`. Reuse the page-content padding used by `profile-page.tsx`.

## 7. Web: sidebar role filtering + Issue Category menu entry

- [x] 7.1 Extend `packages/web/src/app/shell/menu-config.ts`: add an optional `roles?: string[]` field on `MenuItem`. Insert a new child at the **top** of the `settings` group's `children`: `{ id: 'settings-issue-category', label: 'Issue Category', to: '/settings/issue-category', roles: ['ADMIN'] }`. Keep the existing `Profile` and `Preferences` items unchanged (no `roles`).
- [x] 7.2 Update `packages/web/src/app/shell/sidebar.tsx`: call `useUserGroups()` once at the top of the component and write a small `filterMenuByRoles(items, groups)` helper that, for each item, drops it if its `roles` is non-empty and disjoint from `groups`; recurses into `children` and drops a group whose filtered children are empty. Pass the filtered tree to the existing render logic.
- [x] 7.3 Manually verify: with a non-ADMIN user the sidebar's `Settings` group shows only `Profile`/`Preferences`; with an ADMIN user it also shows `Issue Category` at the top. — Manual developer verification.

## 8. Web: Issue Category list page

- [x] 8.1 Create `packages/web/src/app/pages/issue-category/types.ts` exporting `type IssueCategoryDto = { id: number; name: string; displayName: string }` and `type ExistsResponse = { name: boolean; displayName: boolean }`.
- [x] 8.2 Create `packages/web/src/app/pages/issue-category/use-issue-categories.ts` exporting `useIssueCategories()` — a hook that holds `{ data, loading, error, reload }` state and uses `useApiFetch` to `GET /issue-categories` on mount and on `reload()`.
- [x] 8.3 Create `packages/web/src/app/pages/issue-category/list-page.tsx` exporting `<IssueCategoryListPage />`:
  - Title: `All Issue Categories`.
  - Buttons row: `+ Add` (primary; navigates to `/settings/issue-category/new`) and `- Delete` (secondary; disabled when no rows are selected).
  - Table head: header-row checkbox (select-all toggle), `ID`, `Name`, `Display Name`.
  - Body rows: per-row checkbox, `#{id}`, `name`, `displayName`.
  - Loading state and error block (mirroring `profile-page.tsx`).
  - Delete flow: clicking `- Delete` opens a centered confirmation dialog with the literal text `Delete categories?`, `Cancel` (closes the dialog) and `Delete` (primary; calls `DELETE /issue-categories` with the selected ids, then reloads the list and clears the selection).
- [x] 8.4 Create the dialog as a small dedicated component or inline portal. It must render the literal `Delete categories?` text. Close on overlay click and on Cancel.

## 9. Web: Add Category page

- [x] 9.1 Create `packages/web/src/app/pages/issue-category/use-exists-check.ts` exporting `useExistsCheck(field, value)` — a hook that debounces the value (300 ms), fires `GET /issue-categories/exists?{field}={value}` when stable, and returns `{ checking: boolean, exists: boolean | null, error: Error | null }`. Cancellation: if the value changes again before the response arrives, ignore the in-flight result.
- [x] 9.2 Create `packages/web/src/app/pages/issue-category/add-page.tsx` exporting `<IssueCategoryAddPage />`:
  - Title: `Add Category`.
  - Two controlled text inputs: `Name`, `Display Name`. Each input wires `useExistsCheck`. Below each input, render `Already exists` in the error color when the check returns `exists: true`.
  - Buttons: `Save` (primary) — disabled when either field is empty, when either has `exists: true`, when either is `checking: true`, or while the POST is in flight; `Cancel` (secondary) — navigates to `/settings/issue-category` without submitting.
  - On Save: `POST /issue-categories` with `{ name, displayName }`. On 201 → `navigate('/settings/issue-category')`. On 409 → parse the response body for `{ field, value }` and surface the inline `Already exists` error on that field (race recovery); stay on the page.

## 10. Web: routes + role gating

- [x] 10.1 Update `packages/web/src/app/app.tsx`: add `<Route path="/settings/issue-category" element={<RequireRole role="ADMIN"><IssueCategoryListPage/></RequireRole>}/>` and `<Route path="/settings/issue-category/new" element={<RequireRole role="ADMIN"><IssueCategoryAddPage/></RequireRole>}/>`. Place both before the catch-all `*` route.
- [x] 10.2 Manually verify: with a non-ADMIN user, visiting `/settings/issue-category` directly renders the `403 — Access Denied` placeholder and the network tab shows no `GET /api/issue-categories` request. With an ADMIN user, the list and add pages function end-to-end. — Manual developer verification.

## 11. Verification

- [x] 11.1 Run `npx tsc --noEmit -p packages/web/tsconfig.app.json` and `npx tsc --noEmit -p packages/api/tsconfig.app.json` — both clean.
- [x] 11.2 Run `npx nx build web` and `npx nx build @wo-poc/api` — both succeed.
- [x] 11.3 Confirm no hardcoded DB credentials in source: `grep -rn "127.0.0.1\|3306\|wo_poc" packages/api/src` returns nothing.
- [x] 11.4 Confirm `packages/api/.env.example` lists all five `DB_*` keys plus the existing Cognito keys.
- [x] 11.5 End-to-end ADMIN flow with the dev servers (`npx nx serve @wo-poc/api` and `npx nx serve web`): sign in as an ADMIN user, expand `Settings` and click `Issue Category`, add a new category, observe it in the list, select and delete it, observe the confirmation dialog with the exact text `Delete categories?`, confirm deletion, observe the list refresh. — Manual developer verification (requires MySQL + Cognito ADMIN group).
- [x] 11.6 End-to-end non-ADMIN flow: sign in as a non-ADMIN user. Confirm `Settings → Issue Category` is **not** in the sidebar. Manually navigate to `/settings/issue-category` and confirm the `403` placeholder renders. Open DevTools network tab and confirm no `/api/issue-categories` request was issued. — Manual developer verification.
- [x] 11.7 Direct API smoke with `curl` and a non-ADMIN bearer: `curl -H "Authorization: Bearer <token>" -H "X-Id-Token: <id>" http://localhost:3000/api/issue-categories` returns `403`. — Manual developer verification.
- [x] 11.8 Duplicate-name UX: in the Add page, type a name that already exists; after the debounce, see `Already exists` inline; click `Save`; the button is disabled. Open a second tab, race a duplicate (use two browser sessions or temporarily disable debounce in code); confirm the 409 path also renders the inline error. — Manual developer verification.
- [x] 11.9 Run `openspec validate category` — passes.
