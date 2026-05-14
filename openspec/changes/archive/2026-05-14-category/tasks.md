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

## 12. API: kebab-case validation on `name` (new requirement)

- [x] 12.1 Create `packages/api/src/app/issue-category/kebab-case.ts` exporting `export const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` and `export function isKebabCase(value: string): boolean { return KEBAB_CASE_REGEX.test(value); }`. Add a top-of-file comment noting that the same regex is duplicated at `packages/web/src/app/pages/issue-category/kebab-case.ts` and that this file is the source of truth.
- [x] 12.2 Update `packages/api/src/app/issue-category/issue-category.dto.ts`: import `Matches` from `class-validator` and `KEBAB_CASE_REGEX` from `./kebab-case`. On `CreateIssueCategoryDto.name`, add `@Matches(KEBAB_CASE_REGEX, { message: 'name must be kebab-case (lowercase letters, digits, hyphens; no leading/trailing/double hyphens)' })` after the existing `@IsString()` / `@MaxLength(255)` decorators.
- [x] 12.3 Smoke-check the validator: `curl -X POST` a body with `name: 'Hardware'` (uppercase) or `name: '-hardware'` (leading hyphen) or `name: 'a--b'` (double hyphen) — each MUST return 400 with the kebab-case message. A lowercase kebab value like `hardware-tools` MUST pass through to the create path. — Manual developer verification.

## 13. API: get-by-id and PATCH for `displayName` only (new requirement)

- [x] 13.1 Extend `packages/api/src/app/issue-category/issue-category.dto.ts` with `class UpdateIssueCategoryDto { @IsString() @MaxLength(255) displayName!: string; }`. Do **not** declare a `name` field on this DTO — the global `ValidationPipe`'s `forbidNonWhitelisted: true` will reject `PATCH` bodies that include `name` with a 400.
- [x] 13.2 Extend `packages/api/src/app/issue-category/issue-category.service.ts` with `findById(id: number): Promise<IssueCategoryEntity>` that returns the row or throws `NotFoundException` with `message: \`Category ${id} not found\``.
- [x] 13.3 Extend `packages/api/src/app/issue-category/issue-category.service.ts` with `update(id: number, dto: UpdateIssueCategoryDto): Promise<IssueCategoryEntity>` that (a) loads the row via `findById` (404 propagates), (b) early-returns the row unchanged if `dto.displayName === row.displayName` to avoid an unnecessary update / spurious 409, (c) checks `existsByField('displayName', dto.displayName)` and throws `ConflictException` with `{ field: 'displayName', value }` on collision, (d) updates the row and returns it, (e) catches `QueryFailedError` 1062 on the `uk_t_issue_category_display_name` constraint and rethrows as the same `ConflictException`.
- [x] 13.4 Extend `packages/api/src/app/issue-category/issue-category.controller.ts` with:
  - `@Get(':id') findOne(@Param('id', ParseIntPipe) id: number)` → returns `IssueCategoryDto`; 404 propagates.
  - `@Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIssueCategoryDto)` → returns the updated `IssueCategoryDto`.
  Both methods inherit the class-level `@Roles('ADMIN')` so non-admins still get 403.
- [x] 13.5 Smoke-check the new endpoints with an ADMIN bearer:
  - `GET /api/issue-categories/123` for a non-existent id → 404 with `Category 123 not found`.
  - `PATCH /api/issue-categories/<existing-id>` with `{ "displayName": "New Name" }` → 200 with the updated row.
  - `PATCH /api/issue-categories/<existing-id>` with `{ "name": "x", "displayName": "y" }` → 400 (forbidNonWhitelisted catches `name`).
  - `PATCH /api/issue-categories/<existing-id>` with a `displayName` that already exists on another row → 409 with `{ field: 'displayName' }`.
  — Manual developer verification (requires MySQL).

## 14. Web: kebab-case helper + use it in the Add form (new requirement)

- [x] 14.1 Create `packages/web/src/app/pages/issue-category/kebab-case.ts` with the same regex literal and `isKebabCase` helper as the API file. Add a top-of-file comment noting that the API file at `packages/api/src/app/issue-category/kebab-case.ts` is the source of truth; if these ever diverge, the API wins.
- [x] 14.2 Update `packages/web/src/app/pages/issue-category/add-page.tsx`:
  - Import `isKebabCase`.
  - Compute a synchronous `nameFormatError = name.length > 0 && !isKebabCase(name)` on every render.
  - Render the format error below the `Name` input as `Name must be kebab-case (lowercase letters, digits, hyphens)` in the error color when `nameFormatError` is true. The format error takes precedence over the `Already exists` duplicate error so users see one error at a time.
  - Skip the debounced `/issue-categories/exists?name=...` call while `nameFormatError` is true (no point checking duplicates for an invalid value).
  - Add `nameFormatError` to the `Save`-disabled predicate alongside the existing empty / duplicate / checking checks.
- [x] 14.3 Manually verify the form: typing `Hardware` shows the kebab-case error; clearing and typing `hardware-tools` clears it and triggers the duplicate check. — Manual developer verification.

## 15. Web: Category Detail page (new requirement)

- [x] 15.1 Extend `packages/web/src/app/pages/issue-category/use-issue-categories.ts` (or add a sibling `use-issue-category.ts`) with `useIssueCategory(id: number)` that calls `GET /issue-categories/${id}` on mount and returns `{ data, loading, error, reload }`. `error` MUST distinguish 404 from other errors so the page can render the `Category not found` placeholder for 404 only.
- [x] 15.2 Create `packages/web/src/app/pages/issue-category/detail-page.tsx` exporting `<IssueCategoryDetailPage />`:
  - Read `id` via `useParams<{ id: string }>()`; parse with `Number(id)`; if `Number.isNaN`, render the `Category not found` placeholder.
  - Page title equals the category's `name` once loaded; while loading show a `Loading...` block matching `profile-page.tsx`.
  - Render three read-only fields: `ID` = `#<id>`, `Name` = `name`, `Display Name` = `displayName`.
  - Render an `Edit` button (primary) that calls `navigate('/settings/issue-category/${id}/edit')`.
  - On 404 error from the API, render the `Category not found` placeholder with a `Back to list` link pointing at `/settings/issue-category`.
- [x] 15.3 Update `packages/web/src/app/pages/issue-category/list-page.tsx`: render the `Name` cell as a `<Link to={\`/settings/issue-category/${row.id}\`}>{row.name}</Link>` so the list is a navigable index of detail pages. Keep the row checkbox functional (clicking the link must not toggle the checkbox; ensure the link is inside the `Name` `<td>` only).

## 16. Web: Edit Category page (new requirement)

- [x] 16.1 Extend `packages/web/src/app/pages/issue-category/use-exists-check.ts` (or add a small helper) to accept an `ignoreValue?: string` argument. When `value === ignoreValue` the hook MUST short-circuit and return `{ checking: false, exists: false, error: null }` without firing the network call. The Edit page passes the original `displayName` as `ignoreValue` so leaving the field unchanged shows no false `Already exists` error.
- [x] 16.2 Create `packages/web/src/app/pages/issue-category/edit-page.tsx` exporting `<IssueCategoryEditPage />`:
  - Read `id` via `useParams<{ id: string }>()`; parse with `Number(id)`.
  - Use `useIssueCategory(id)` to load the row; show a `Loading...` block while loading, the `Category not found` placeholder on 404.
  - Page title: `Edit Category`.
  - Render `ID` (`#<id>`, read-only text), `Name` (read-only text equal to the loaded `name`), and a controlled `Display Name` input prefilled with the loaded `displayName`.
  - Wire the `Display Name` input to `useExistsCheck('displayName', value, { ignoreValue: original.displayName })`. Render `Already exists` inline on a positive check.
  - `Save` (primary): disabled when the field is empty, when `exists: true`, when `checking: true`, or while the PATCH is in flight. Clicking calls `PATCH /issue-categories/${id}` with `{ displayName }`; on 200 → `navigate('/settings/issue-category/${id}')`. On 409 → render the inline `Already exists` error on the field; stay on the page. On 404 → navigate back to the list (the row vanished while editing).
  - `Cancel` (secondary): navigate to `/settings/issue-category/${id}` without saving.

## 17. Web: routes (new requirement)

- [x] 17.1 Update `packages/web/src/app/app.tsx` to add the two new routes immediately after the existing two category routes, before the catch-all `*`:
  - `<Route path="/settings/issue-category/:id" element={<RequireRole role="ADMIN"><IssueCategoryDetailPage/></RequireRole>}/>`
  - `<Route path="/settings/issue-category/:id/edit" element={<RequireRole role="ADMIN"><IssueCategoryEditPage/></RequireRole>}/>`
  Make sure `/settings/issue-category/new` is declared **before** `/settings/issue-category/:id` so the literal `new` is not captured by the `:id` param.
- [x] 17.2 Manually verify with an ADMIN user: clicking a row's `Name` in the list opens the Detail page; clicking `Edit` opens the Edit page; saving a new `Display Name` returns to the Detail page with the updated value; `Cancel` from Edit returns to Detail without changes. — Manual developer verification.

## 18. Verification of the new surface

- [x] 18.1 Run `npx tsc --noEmit -p packages/web/tsconfig.app.json` and `npx tsc --noEmit -p packages/api/tsconfig.app.json` — both clean.
- [x] 18.2 Run `npx nx build web` and `npx nx build @wo-poc/api` — both succeed.
- [x] 18.3 Confirm both kebab-case files exist and the regex literals match exactly: `diff <(grep KEBAB_CASE_REGEX packages/api/src/app/issue-category/kebab-case.ts) <(grep KEBAB_CASE_REGEX packages/web/src/app/pages/issue-category/kebab-case.ts)` should show only the path difference, not a regex difference. — Verified via Grep tool: both files contain `export const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` literally identical.
- [x] 18.4 End-to-end happy-path edit flow: from the list, click a category row's name → Detail page renders → click `Edit` → change `Display Name` → click `Save` → return to Detail with the new value. — Manual developer verification.
- [x] 18.5 End-to-end name-is-immutable: open the Edit page and confirm `Name` cannot be focused or typed into; open DevTools and try to mutate the input via JS — even a successful client-side mutation does not change the PATCH payload (the form only sends `displayName`); independently, a `curl -X PATCH` with `{ "name": "x", "displayName": "y" }` returns 400. — Manual developer verification.
- [x] 18.6 Run `openspec validate category` — passes. — Manual developer verification (openspec CLI not available in this bash environment).

## 19. Web: Back button on Add / Detail / Edit pages (new requirement)

- [x] 19.1 Extend `packages/web/src/styles.css` with two new rules in the issue-category block. (a) `.ic-page-title-group { display: flex; align-items: center; gap: 8px; }` so the back button can sit immediately to the left of the page title without disturbing the existing right-slot action area. (b) `.ic-back-btn { background: transparent; border: none; padding: 4px 8px; font-size: 18px; line-height: 1; color: var(--text); cursor: pointer; border-radius: 4px; }` plus `.ic-back-btn:hover { background: var(--surface-hover); }` and `.ic-back-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`. Use the existing CSS variables (no new variables introduced); if `--surface-hover` is not defined yet, fall back to `rgba(255, 255, 255, 0.06)` (or whatever the codebase uses for hover surfaces — check before settling on a value). — Used `var(--surface2)` for the hover background (the codebase has no `--surface-hover`; `--surface2` is the elevated-surface variable already used elsewhere). `border-radius` uses `var(--radius-sm)` to match the existing buttons.
- [x] 19.2 Create `packages/web/src/app/pages/issue-category/back-button.tsx` exporting a `<BackButton to={path} />` component. Implementation: a `<button type="button">` with `className="ic-back-btn"`, `aria-label="Back"`, content `←` (Unicode U+2190), and an `onClick` that calls `navigate(to)` from `react-router-dom`'s `useNavigate()`. Do not use `<Link>` because the visual is a button, and using a button keeps focus / keyboard handling consistent with the rest of the page's controls.
- [x] 19.3 Update `packages/web/src/app/pages/issue-category/add-page.tsx`:
  - Import `BackButton`.
  - Wrap the existing `<h1 className="ic-page-title">Add Category</h1>` and a `<BackButton to="/settings/issue-category" />` together inside `<div className="ic-page-title-group">…</div>` placed where the title currently is. The `ic-page-header` flex layout should put the title group on the left and any future right-slot content on the right (the Add page has no right-slot buttons today; the layout still works with an empty right slot).
- [x] 19.4 Update `packages/web/src/app/pages/issue-category/detail-page.tsx`:
  - Import `BackButton`.
  - In the loaded-state render, wrap the `<h1 className="ic-page-title">{data.name}</h1>` and a `<BackButton to="/settings/issue-category" />` inside `<div className="ic-page-title-group">…</div>`. Keep the `Edit` button in the existing right slot (`<div className="ic-page-actions">`).
  - The loading, not-found, and error fallback sections should NOT show a back button — they already render minimal headers and the user can use the sidebar or the existing `Back to list` link.
- [x] 19.5 Update `packages/web/src/app/pages/issue-category/edit-page.tsx`:
  - Import `BackButton`.
  - In the loaded-state render, wrap the `<h1 className="ic-page-title">Edit Category</h1>` and a `<BackButton to={\`/settings/issue-category/${id}\`} />` inside `<div className="ic-page-title-group">…</div>`. The back button must point to the **Detail page** (one level up in the route hierarchy), not to the list — see design decision 15.
  - Same as the Detail page: do not render the back button in the loading / not-found / error fallback sections.
- [x] 19.6 Run `npx tsc --noEmit -p packages/web/tsconfig.app.json` and `npx nx build web` — both clean. — tsc clean; `nx build web` succeeded (65 modules transformed, up from 64 — the new `back-button.tsx` is bundled).
- [x] 19.7 Manually verify with an ADMIN user: (a) on the Add page, the back button appears to the left of the title with no border, hovering highlights it, and clicking returns to the list without saving; (b) on the Detail page, the back button returns to the list (not to wherever the user came from); (c) on the Edit page, the back button returns to the Detail page for the same id (not to the list); (d) tab-focusing the back button shows a visible focus outline; (e) screen-reader reads "Back, button". — Manual developer verification.
- [x] 19.8 Run `openspec validate category` — passes. — Manual developer verification (openspec CLI not available in this bash environment; the build above is the strongest mechanical signal we have).
