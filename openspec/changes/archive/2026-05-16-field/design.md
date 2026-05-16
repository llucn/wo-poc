## Context

The workspace already has a working persistence layer (MySQL via TypeORM, env-driven config, `DatabaseModule`) and a role-based access control surface (`@Roles('ADMIN')`, `RolesGuard`, `useUserGroups`, `RequireRole`) established by the `category` change. The `field` feature follows the same vertical pattern: entity → service → controller → module on the API side, and list/detail/add/edit pages on the web side.

`docs/field.md` specifies a single table `t_field` with 8 columns and four pages. The key complexity compared to `category` is the **dynamic `properties` column**: its JSON shape depends on the `type` column value. Each field type has a distinct set of configurable attributes (e.g. `text-field` has `min_length` / `max_length`; `select` has a `values` array of `{label, value}` pairs).

## Goals / Non-Goals

**Goals:**

- Full CRUD for field definitions with type-aware properties validation.
- A reusable `FieldType` enum and per-type property schema that future features (form builder, field rendering) can import.
- Live duplicate-name check on both Add and Edit pages.
- Dynamic properties sub-form that changes when the user selects a different `Type`.
- Single-item delete from the Detail page (in addition to bulk delete from the list).

**Non-Goals:**

- Rendering fields in a form at runtime (that's the form-builder change).
- File upload implementation (the `file` type only stores allowed extensions).
- Field ordering or grouping (no `position` column — that belongs to the form-layout change).
- Validation of `default_value` against the field type (e.g. checking that a number field's default is numeric). We store it as text; runtime validation is a future concern.

## Decisions

### 1. Table schema follows `docs/field.md` exactly

```sql
CREATE TABLE IF NOT EXISTS t_field (
  id            INT          NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NOT NULL,
  title         VARCHAR(255) NOT NULL,
  description   TEXT         NULL,
  required      INT          NOT NULL DEFAULT 0,
  default_value TEXT         NULL,
  type          VARCHAR(64)  NOT NULL,
  properties    TEXT         NULL,
  created_on    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    VARCHAR(255) NOT NULL,
  updated_on    TIMESTAMP    NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  updated_by    VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_t_field_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `required` is INT (0/1) not BOOLEAN — matches the spec literally and avoids MySQL's TINYINT(1) ambiguity.
- `properties` is TEXT storing a JSON string. We do NOT use MySQL's JSON column type because (a) the spec says TEXT, (b) we validate in the application layer, and (c) TEXT is simpler to bootstrap without version-specific JSON support.
- `default_value` is nullable TEXT — a field with no default simply stores NULL.
- `created_on` defaults to `CURRENT_TIMESTAMP` at insert time; the application also sets it explicitly for clarity.
- `created_by` stores the authenticated user's name (from `@CurrentUser().userName`). NOT NULL because every row is created by someone.
- `updated_on` defaults to NULL and is set to `CURRENT_TIMESTAMP` on update (both via MySQL's `ON UPDATE` and explicitly by the application).
- `updated_by` is nullable — NULL until the first update.

### 2. FieldType enum and properties validation

A shared `field-type.ts` file defines:

```ts
export const FIELD_TYPES = [
  'text-field', 'text-area', 'number', 'select',
  'radio', 'checkbox', 'date', 'datetime', 'file',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
```

Properties validation is done in the service layer (not via class-validator decorators on the DTO) because the shape depends on the runtime value of `type`. The service calls a `validateProperties(type, properties)` function that:
- Returns `null` (valid) or a string error message.
- For types that require properties (`select`, `radio`), rejects null/empty.
- For types with optional properties, accepts null gracefully.
- Validates structural shape (e.g. `values` must be an array of `{label: string, value: string}`).

The DTO accepts `properties` as `string | null` (raw JSON string). The service parses it, validates, and stores. This keeps the DTO layer thin and the validation logic testable in isolation.

### 3. API endpoint shape

| Method | Path                        | Body / Query                          | Response                    | Status codes                     |
| ------ | --------------------------- | ------------------------------------- | --------------------------- | -------------------------------- |
| GET    | `/api/fields`               | —                                     | `FieldDto[]`                | 200                              |
| GET    | `/api/fields/:id`           | —                                     | `FieldDto`                  | 200, 404                         |
| GET    | `/api/fields/exists`        | `?name=…`                             | `{ name: boolean }`         | 200                              |
| POST   | `/api/fields`               | `CreateFieldDto`                      | `FieldDto`                  | 201, 400, 409                    |
| PATCH  | `/api/fields/:id`           | `UpdateFieldDto`                      | `FieldDto`                  | 200, 400, 404, 409              |
| DELETE | `/api/fields`               | `{ ids: number[] }`                   | `{ deleted: number }`       | 200, 400                         |
| DELETE | `/api/fields/:id`           | —                                     | `{ deleted: boolean }`      | 200, 404                         |

`FieldDto`:
```ts
{
  id: number;
  name: string;
  title: string;
  description: string | null;
  required: boolean;       // API exposes as boolean, DB stores as 0/1
  defaultValue: string | null;
  type: FieldType;
  properties: object | null;  // parsed JSON, not raw string
  createdOn: string;       // ISO 8601 timestamp
  createdBy: string;
  updatedOn: string | null;
  updatedBy: string | null;
}
```

Note: the API returns `properties` as a parsed object (or null) so the web client doesn't need to `JSON.parse` on its side. The API accepts `properties` as either an object or null in the request body and serializes to TEXT for storage. The audit fields (`createdOn`, `createdBy`, `updatedOn`, `updatedBy`) are read-only in the response — they are never accepted in request bodies.

### 4. Web routing and pages

Four routes added to `app.tsx` (order matters — `new` before `:id`):

- `/settings/field` → `<FieldListPage />`
- `/settings/field/new` → `<FieldAddPage />`
- `/settings/field/:id` → `<FieldDetailPage />`
- `/settings/field/:id/edit` → `<FieldEditPage />`

All wrapped in `<RequireRole role="ADMIN">`.

Each sub-page (Add, Detail, Edit) has a `<BackButton>`:
- Add → back to list (`/settings/field`)
- Detail → back to list (`/settings/field`)
- Edit → back to Detail (`/settings/field/:id`)

### 5. Dynamic properties sub-form

The Add and Edit pages render a `<PropertiesEditor type={selectedType} value={properties} onChange={setProperties} />` component that switches its internal form based on the selected type:

| Type        | Properties fields                                      |
| ----------- | ------------------------------------------------------ |
| text-field  | `min_length` (number), `max_length` (number)           |
| text-area   | `rows` (number)                                        |
| number      | `precision` (number), `scale` (number)                 |
| select      | `values` (array of {label, value} — add/remove rows)   |
| radio       | `values` (array of {label, value} — add/remove rows)   |
| checkbox    | `label` (text)                                         |
| date        | `format` (text, default `yyyy-MM-dd`)                  |
| datetime    | `format` (text, default `yyyy-MM-dd HH:mm:ss`)        |
| file        | `types` (comma-separated extensions, stored as array)  |

When the user changes `Type`, the properties form resets to the new type's defaults. This prevents stale properties from a previous type leaking into the saved value.

### 6. Detail page delete

The Detail page has its own `- Delete` button (in addition to the list's bulk delete). Clicking it shows a confirmation dialog with text `Delete Field #<id>?`. On confirm, it calls `DELETE /api/fields/:id` and navigates back to the list. This is a single-item delete endpoint (returns `{ deleted: true }` or 404) distinct from the bulk endpoint.

### 7. Name duplicate check

Same pattern as `category`: a debounced `GET /api/fields/exists?name=…` call on the Name input. On the Edit page, the check uses `ignoreValue` to skip flagging the row's own current name. Unlike `category`, the `name` field IS editable on the Edit page (the spec shows it as an input, not read-only).

### 8. `required` column: INT in DB, boolean in API

The database stores `required` as INT (0 or 1) per the spec. The entity maps it with `@Column({ type: 'int' })`. The DTO exposes it as `boolean` (`required: true/false`). The entity getter/setter or a mapping function handles the conversion. The web form uses a select dropdown with options "Yes" / "No".

### 9. Audit columns: `created_on`, `created_by`, `updated_on`, `updated_by`

Four audit columns track who created/updated each field and when:

- **`created_on`** (TIMESTAMP NOT NULL): Set once at insert time. The entity uses `@CreateDateColumn({ name: 'created_on' })` so TypeORM populates it automatically. The DDL also has `DEFAULT CURRENT_TIMESTAMP` as a DB-level fallback.
- **`created_by`** (VARCHAR(255) NOT NULL): The authenticated user's name at creation time. The service reads `currentUser.userName` from the `@CurrentUser()` decorator and sets it before saving. This is NOT a foreign key — it's a denormalized snapshot of who performed the action (Cognito users are not in our DB).
- **`updated_on`** (TIMESTAMP NULL): Set on every update. The entity uses `@UpdateDateColumn({ name: 'updated_on' })`. NULL until the first PATCH. The DDL has `ON UPDATE CURRENT_TIMESTAMP` as a DB-level fallback.
- **`updated_by`** (VARCHAR(255) NULL): The authenticated user's name at update time. Set by the service on PATCH. NULL until the first update.

**Why store the user name, not the Cognito `sub`?** The `sub` is a UUID that means nothing to a human reading the audit trail. The `userName` (derived from the `name` or `cognito:username` claim) is immediately readable. If the user renames their Cognito profile, old audit entries retain the name at the time of the action — this is intentional (audit = what happened, not who the person is now).

**Why not expose audit fields in Create/Update DTOs?** They are system-managed. The global `ValidationPipe` with `forbidNonWhitelisted: true` will reject any request body that includes `createdOn`, `createdBy`, `updatedOn`, or `updatedBy` with a 400 — defense in depth.

**Detail page display:** The Detail page shows `Created` (formatted timestamp + by-name) and `Updated` (formatted timestamp + by-name, or "—" if never updated) at the bottom of the field card, below the properties section.

## Risks / Trade-offs

- **Risk**: `properties` is untyped TEXT in the DB — a bad JSON string could be stored if validation is bypassed. → **Mitigation**: The service layer validates before save; the UNIQUE constraint on `name` is the only DB-level enforcement beyond NOT NULL. A future migration could add a CHECK constraint or switch to JSON column type.
- **Risk**: Changing `type` on an existing field invalidates its `properties`. → **Mitigation**: The PATCH endpoint re-validates properties against the new type. The web form resets properties when type changes. Existing data referencing the old properties shape is not migrated — this is acceptable for a settings page where an admin is actively editing.
- **Risk**: The `select` and `radio` types store an unbounded `values` array in TEXT. → **Mitigation**: TEXT supports up to 65KB; a select with thousands of options is a UX problem before it's a storage problem. No artificial limit imposed now.
- **Trade-off**: We store `properties` as TEXT + application-layer validation rather than using MySQL JSON type + JSON_SCHEMA_VALID. Acceptable: keeps the bootstrap script simple and avoids MySQL 8.0.17+ dependency for JSON schema validation.
- **Trade-off**: `default_value` is not validated against the field type. Acceptable: runtime form rendering will validate; the admin settings page trusts the admin to enter a sensible default.

## Migration Plan

- Greenfield table. Append the `CREATE TABLE IF NOT EXISTS t_field` statement to `docs/database.sql`. Developers re-run the bootstrap script (idempotent).
- No data migration — the table is new and empty.
- The `DatabaseModule` entity list gains `FieldEntity`; no connection config changes.
