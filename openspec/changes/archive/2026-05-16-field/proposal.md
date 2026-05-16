## Why

The workspace needs a way to define custom form fields that will later be composed into work-order forms. `docs/field.md` specifies the first building block of the form-customization system: a `t_field` table that stores field definitions (name, title, type, properties, etc.) and four CRUD pages to manage them. Landing this now gives us the vocabulary of field types and their per-type property schemas, so the next change (form layout / drag-and-drop composition) can reference existing field definitions rather than inventing them inline.

## What Changes

- Add a `t_field` table to `docs/database.sql` (12 columns: id, name, title, description, required, default_value, type, properties, created_on, created_by, updated_on, updated_by). The DDL is appended to the existing bootstrap script so `mysql -u wo -p < docs/database.sql` remains the single idempotent bootstrap command.
- Add a NestJS `FieldModule` (entity, service, controller, DTOs) exposing CRUD endpoints under `/api/fields`:
  - `GET /api/fields` — list all fields ordered by id ASC (no pagination).
  - `GET /api/fields/:id` — get a single field by id; 404 if missing.
  - `GET /api/fields/exists?name=…` — duplicate-name check for live form validation.
  - `POST /api/fields` — create a field; validates type enum and properties JSON schema per type; rejects duplicate `name` with 409. Automatically sets `created_on` (current timestamp) and `created_by` (authenticated user's name/sub).
  - `PATCH /api/fields/:id` — update a field (all mutable columns); rejects duplicate `name` with 409; 404 if missing. Automatically sets `updated_on` (current timestamp) and `updated_by` (authenticated user's name/sub).
  - `DELETE /api/fields` — bulk delete by `{ ids: number[] }`.
  - `DELETE /api/fields/:id` — single delete by id (used from the Detail page); 404 if missing.
- Add a `Settings → Field` menu entry in the sidebar, visible only to ADMIN users.
- Add four web pages behind `<RequireRole role="ADMIN">`:
  - **All Fields** (`/settings/field`) — list with `+ Add` / `- Delete` buttons, row checkboxes, confirmation dialog `Delete Fields?`.
  - **Field Detail** (`/settings/field/:id`) — read-only view of all 8 columns; `Edit` and `- Delete` buttons; delete shows confirmation `Delete Field #<id>?`.
  - **Add Field** (`/settings/field/new`) — form with all editable columns; `Type` selector dynamically shows the matching `Properties` sub-form.
  - **Edit Field** (`/settings/field/:id/edit`) — same form prefilled; `Name` has live duplicate check; `Type` change resets properties.
- Each sub-page (Detail, Add, Edit) has a borderless left-arrow back button per the pattern established in the `category` change.
- Register the `FieldEntity` in the existing `DatabaseModule`'s entity list.

## Capabilities

### New Capabilities

- `field`: Database-backed CRUD for form-field definitions — the `t_field` table, seven REST endpoints under `/api/fields`, four web pages (All/Detail/Add/Edit), the per-type properties JSON schema, and the duplicate-name rule. All pages and endpoints are gated to `ADMIN`.

### Modified Capabilities

- `web-shell`: The sidebar gains a `Field` entry under `Settings`, visible only to ADMIN users.
- `mysql-persistence`: The bootstrap script `docs/database.sql` gains the `t_field` CREATE TABLE statement. The `DatabaseModule` entity list gains `FieldEntity`.

## Impact

- **Affected code (api)**: New `packages/api/src/app/field/` directory (entity, controller, service, DTOs, module, `field-type.ts` enum + properties validators). `packages/api/src/app/database/database.module.ts` gains `FieldEntity` in the entities array. `packages/api/src/app/app.module.ts` imports `FieldModule`. The controller injects `@CurrentUser()` to populate `created_by` / `updated_by` from the authenticated user.
- **Affected code (web)**: `packages/web/src/app/shell/menu-config.ts` gains a `Field` child under `Settings` with `roles: ['ADMIN']`. `packages/web/src/app/app.tsx` gains four new routes. New `packages/web/src/app/pages/field/` directory (list-page, detail-page, add-page, edit-page, types, hooks, properties sub-forms).
- **Affected docs**: `docs/database.sql` gains the `CREATE TABLE IF NOT EXISTS t_field` statement.
- **New runtime dependencies**: None — reuses TypeORM, class-validator, react-router-dom already in the workspace.
- **Out of scope**: Drag-and-drop form composition (a separate change will consume field definitions); field versioning or change history; per-field RBAC (all admins can manage all fields); file upload handling (the `file` type stores allowed extensions in properties but does not implement the upload endpoint itself); user-editable audit columns (created_on/by and updated_on/by are system-managed, never exposed as form inputs).
