## Why

The workspace now has a `t_field` table and CRUD pages for managing individual field definitions. The next building block is **form composition**: grouping fields into named forms with a defined order. `docs/form.md` specifies two tables (`t_form`, `t_form_field`) and six pages including a drag-and-drop Design page. Landing this change gives the system its first end-to-end form definition capability — a form can be created, its fields arranged, and the result persisted — which future work-order features will reference when rendering data-entry screens.

## What Changes

- Append two DDL statements to `docs/database.sql`: `t_form` (id, name, description, audit columns) and `t_form_field` (composite PK of form_id + field_id, position, audit columns).
- Add a NestJS `FormModule` exposing endpoints under `/api/forms`:
  - `GET /api/forms` — list all forms ordered by id ASC.
  - `GET /api/forms/:id` — get a single form; 404 if missing.
  - `GET /api/forms/exists?name=…` — duplicate-name check.
  - `POST /api/forms` — create a form; rejects duplicate `name` with 409.
  - `PATCH /api/forms/:id` — update name/description; rejects duplicate `name` with 409; 404 if missing.
  - `DELETE /api/forms` — bulk delete by `{ ids: number[] }`.
  - `DELETE /api/forms/:id` — single delete; 404 if missing.
  - `GET /api/forms/:id/fields` — list the form's fields (joined with `t_field`) ordered by `position` ASC.
  - `PUT /api/forms/:id/fields` — replace the entire field list in one atomic operation: accepts `[{ fieldId, position }]`, deletes all existing rows for the form, inserts the new set. This is the "Save" action from the Design page.
- Register `FormEntity` and `FormFieldEntity` in `DatabaseModule`.
- Add a `Settings → Form` menu entry (ADMIN-only).
- Add six web pages behind `<RequireRole role="ADMIN">`:
  - **All Forms** (`/settings/form`) — list with `+ Add` / `- Delete` buttons, row checkboxes, confirmation `Delete Forms?`, and a `Design` link per row.
  - **Form Detail** (`/settings/form/:id`) — read-only view; `Edit`, `- Delete`, and `Design` buttons.
  - **Add Form** (`/settings/form/new`) — Name (duplicate check) + Description; `Save`, `Save & Design`, `Cancel`.
  - **Edit Form** (`/settings/form/:id/edit`) — same form prefilled; `Save`, `Save & Design`, `Cancel`.
  - **Design Form** (`/settings/form/:id/design?from=list|detail`) — drag-and-drop field list; `+ Add` opens the Select Field modal; drag handler for reordering; trash icon per row for removal; `Save` (batch PUT) then navigate to All Forms; `Cancel` returns to the `from` target.
  - **Select Field modal** — dropdown of all fields (`#id - name`), description preview, `Select` (adds to list if not already present), `Cancel`.

## Capabilities

### New Capabilities

- `form-customization`: The `t_form` + `t_form_field` tables, nine REST endpoints under `/api/forms`, and six web pages (All/Detail/Add/Edit/Design + Select Field modal). All pages and endpoints are gated to `ADMIN`. The Design page uses client-side drag-and-drop (no library — HTML5 Drag and Drop API) with a batch `PUT /api/forms/:id/fields` save.

### Modified Capabilities

- `web-shell`: Sidebar gains a `Form` entry under `Settings` (ADMIN-only).
- `mysql-persistence`: `docs/database.sql` gains `t_form` and `t_form_field` DDL. `DatabaseModule` entity list gains `FormEntity` and `FormFieldEntity`.

## Impact

- **Affected code (api)**: New `packages/api/src/app/form/` directory. `DatabaseModule` gains two entities. `AppModule` imports `FormModule`.
- **Affected code (web)**: `menu-config.ts` gains `Form` child. `app.tsx` gains six routes. New `packages/web/src/app/pages/form/` directory.
- **Affected docs**: `docs/database.sql` gains two CREATE TABLE statements.
- **New runtime dependencies**: None — drag-and-drop uses the browser's native HTML5 API; no new npm packages needed.
- **Out of scope**: Rendering a form for end-user data entry (a future work-order change will consume form definitions); form versioning; per-field conditional visibility rules; form validation rules beyond what the field definition already carries.
