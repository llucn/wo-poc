# field Specification

## Purpose
Database-backed CRUD for form-field definitions — the t_field table, seven REST endpoints under /api/fields, four web pages (All/Detail/Add/Edit), per-type properties JSON validation, and audit columns (created_on/by, updated_on/by). All pages and endpoints are gated to ADMIN.

## Requirements

### Requirement: `t_field` schema

The database SHALL contain a table named `t_field` with the following columns:

| Column         | Type         | Constraints                          |
| -------------- | ------------ | ------------------------------------ |
| `id`           | INT          | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| `name`         | VARCHAR(255) | NOT NULL, UNIQUE                     |
| `title`        | VARCHAR(255) | NOT NULL                             |
| `description`  | TEXT         | NULL                                 |
| `required`     | INT          | NOT NULL, DEFAULT 0                  |
| `default_value`| TEXT         | NULL                                 |
| `type`         | VARCHAR(64)  | NOT NULL                             |
| `properties`   | TEXT         | NULL (JSON string)                   |
| `created_on`   | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP  |
| `created_by`   | VARCHAR(255) | NOT NULL                             |
| `updated_on`   | TIMESTAMP    | NULL, ON UPDATE CURRENT_TIMESTAMP    |
| `updated_by`   | VARCHAR(255) | NULL                                 |

The `type` column MUST accept exactly these values: `text-field`, `text-area`, `number`, `select`, `radio`, `checkbox`, `date`, `datetime`, `file`. The `properties` column stores a JSON string whose schema depends on the `type` value. The table MUST use `utf8mb4` character set. The `created_on` and `created_by` columns MUST be populated automatically by the API at insert time from the server clock and the authenticated user's identity. The `updated_on` and `updated_by` columns MUST be populated by the API on every update.

#### Scenario: Inserting two rows with the same name

- **WHEN** a client creates a field with `name = 'priority'` and then attempts to create another with `name = 'priority'`
- **THEN** the database rejects the second insert and the API returns `409 Conflict`

#### Scenario: Nullable columns accept null

- **WHEN** a client creates a field with `description = null`, `default_value = null`, `properties = null`
- **THEN** the row is persisted with those columns as NULL

#### Scenario: Audit columns are set on create

- **WHEN** an ADMIN user named "Alice" creates a field via `POST /api/fields`
- **THEN** the returned row has `createdOn` set to approximately the current server time, `createdBy` set to "Alice", `updatedOn` as null, and `updatedBy` as null

#### Scenario: Audit columns are updated on patch

- **WHEN** an ADMIN user named "Bob" updates field 5 via `PATCH /api/fields/5`
- **THEN** the returned row has `updatedOn` set to approximately the current server time and `updatedBy` set to "Bob"; `createdOn` and `createdBy` remain unchanged

#### Scenario: Audit columns are not user-editable

- **WHEN** an ADMIN client sends `POST /api/fields` with `createdBy` or `updatedOn` in the request body
- **THEN** the response is `400` (the validation pipe rejects unknown fields)

### Requirement: List fields

The API SHALL expose `GET /api/fields` returning all rows ordered by `id` ASC. The endpoint MUST require ADMIN role; non-ADMIN callers receive `403`.

#### Scenario: List returns all fields

- **WHEN** an ADMIN client calls `GET /api/fields` with 3 rows in the table
- **THEN** the response is `200` with all 3 rows in ascending id order

### Requirement: Get a single field

The API SHALL expose `GET /api/fields/:id`. Returns `200` with the field or `404` if not found. Requires ADMIN role.

#### Scenario: Get existing field

- **WHEN** an ADMIN client calls `GET /api/fields/5` and the row exists
- **THEN** the response is `200` with the full field object including parsed `properties`

#### Scenario: Get non-existent field

- **WHEN** an ADMIN client calls `GET /api/fields/9999`
- **THEN** the response is `404`

### Requirement: Create a field with type-aware properties validation

The API SHALL expose `POST /api/fields`. The `type` MUST be one of the allowed values. If `type` is `select` or `radio`, `properties` MUST contain a non-empty `values` array. For other types, `properties` is optional. Duplicate `name` returns `409`. Invalid properties returns `400`. The API MUST set `created_on` to the current server timestamp and `created_by` to the authenticated user's name. The request body MUST NOT include audit fields (`createdOn`, `createdBy`, `updatedOn`, `updatedBy`); if present, the API MUST reject with `400`.

#### Scenario: Create a text-field

- **WHEN** an ADMIN client posts `{ name: 'notes', title: 'Notes', required: false, type: 'text-field', properties: { min_length: 0, max_length: 500 } }`
- **THEN** the response is `201` with the created row

#### Scenario: Create a select without values

- **WHEN** an ADMIN client posts `{ name: 'status', title: 'Status', required: true, type: 'select', properties: { values: [] } }`
- **THEN** the response is `400` because `select` requires a non-empty `values` array

#### Scenario: Invalid type rejected

- **WHEN** an ADMIN client posts `{ ..., type: 'unknown-type' }`
- **THEN** the response is `400`

### Requirement: Update a field

The API SHALL expose `PATCH /api/fields/:id` accepting all mutable fields. Name duplicate check excludes the current row. Type change triggers properties re-validation. Returns `404` if row missing, `409` on name collision, `400` on invalid properties. The API MUST set `updated_on` to the current server timestamp and `updated_by` to the authenticated user's name on every successful update.

#### Scenario: Update name to a duplicate

- **WHEN** an ADMIN client patches field 5 with `{ name: 'existing-name' }` and another row already has that name
- **THEN** the response is `409`

#### Scenario: Change type resets properties validation

- **WHEN** an ADMIN client patches field 5 changing type from `text-field` to `select` with `properties: { values: [{label:'A', value:'a'}] }`
- **THEN** the response is `200` with the updated row

### Requirement: Bulk delete fields

The API SHALL expose `DELETE /api/fields` with body `{ ids: number[] }`. Returns `{ deleted: count }`. Empty array rejected with `400`. Requires ADMIN.

#### Scenario: Bulk delete

- **WHEN** an ADMIN client sends `DELETE /api/fields` with `{ ids: [1, 2] }` and both exist
- **THEN** the response is `200` with `{ deleted: 2 }`

### Requirement: Single delete field

The API SHALL expose `DELETE /api/fields/:id`. Returns `{ deleted: true }` on success, `404` if not found. Requires ADMIN.

#### Scenario: Delete existing field

- **WHEN** an ADMIN client sends `DELETE /api/fields/5` and the row exists
- **THEN** the response is `200` with `{ deleted: true }` and the row is removed

### Requirement: Duplicate-name check endpoint

The API SHALL expose `GET /api/fields/exists?name=…` returning `{ name: boolean }`. Requires ADMIN.

#### Scenario: Name available

- **WHEN** an ADMIN client calls `GET /api/fields/exists?name=new-field` and no row has that name
- **THEN** the response is `{ name: false }`

### Requirement: All Fields page

The web app SHALL provide `/settings/field` showing a non-paginated table of all fields. Columns: checkbox, ID (`#<id>`), Name (link to detail), Title, Required (Yes/No). Buttons: `+ Add`, `- Delete` (with confirmation `Delete Fields?`). Requires ADMIN.

#### Scenario: List page loads

- **WHEN** an ADMIN user navigates to `/settings/field`
- **THEN** the page fetches and renders all fields in a table

### Requirement: Field Detail page

The web app SHALL provide `/settings/field/:id` titled `Field #<id>`. Displays all user-facing columns read-only. Properties are rendered based on type. Below the properties section, the page MUST display audit information: `Created` (formatted timestamp and user name) and `Updated` (formatted timestamp and user name, or "—" if never updated). Back button → list. Buttons: `Edit`, `- Delete` (confirmation `Delete Field #<id>?`; on confirm deletes and navigates to list). Requires ADMIN.

#### Scenario: Detail page renders

- **WHEN** an ADMIN user navigates to `/settings/field/5`
- **THEN** the page shows all field attributes including type-specific properties

#### Scenario: Delete from detail

- **WHEN** an ADMIN user clicks `- Delete` on the detail page and confirms
- **THEN** the field is deleted and the user is navigated to the list

### Requirement: Add Field page

The web app SHALL provide `/settings/field/new` titled `Add Field`. Back button → list. Form inputs: Name (with duplicate check), Title, Description, Required (Yes/No select), Default Value, Type (select), Properties (dynamic sub-form based on type). Save/Cancel buttons. Requires ADMIN.

#### Scenario: Type change resets properties form

- **WHEN** the user selects `select` as type, adds values, then changes type to `text-field`
- **THEN** the properties form resets to show text-field inputs (min_length, max_length) and the previous values are discarded

### Requirement: Edit Field page

The web app SHALL provide `/settings/field/:id/edit` titled `Edit Field #<id>`. Back button → detail. Same form as Add but prefilled. Name has duplicate check with ignoreValue for self. Type change resets properties. Save/Cancel buttons. Requires ADMIN.

#### Scenario: Edit preserves existing values

- **WHEN** an ADMIN user opens the edit page for field 5
- **THEN** all inputs are prefilled with the current values including the correct properties sub-form for the current type
