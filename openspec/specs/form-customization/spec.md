# form-customization Specification

## Purpose
TBD - created by archiving change form-customization. Update Purpose after archive.
## Requirements
### Requirement: `t_form` and `t_form_field` schema

The database SHALL contain two new tables.

`t_form`:

| Column        | Type         | Constraints                          |
| ------------- | ------------ | ------------------------------------ |
| `id`          | INT          | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| `name`        | VARCHAR(255) | NOT NULL, UNIQUE                     |
| `description` | TEXT         | NULL                                 |
| `created_on`  | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP  |
| `created_by`  | VARCHAR(255) | NOT NULL                             |
| `updated_on`  | TIMESTAMP    | NULL, ON UPDATE CURRENT_TIMESTAMP    |
| `updated_by`  | VARCHAR(255) | NULL                                 |

`t_form_field` (composite PK on `form_id` + `field_id`):

| Column        | Type         | Constraints                          |
| ------------- | ------------ | ------------------------------------ |
| `form_id`     | INT          | NOT NULL, PK, FK → t_form(id) CASCADE |
| `field_id`    | INT          | NOT NULL, PK, FK → t_field(id) CASCADE |
| `position`    | INT          | NOT NULL                             |
| `created_on`  | TIMESTAMP    | NOT NULL, DEFAULT CURRENT_TIMESTAMP  |
| `created_by`  | VARCHAR(255) | NOT NULL                             |
| `updated_on`  | TIMESTAMP    | NULL, ON UPDATE CURRENT_TIMESTAMP    |
| `updated_by`  | VARCHAR(255) | NULL                                 |

The composite PK on `t_form_field` enforces that a field can appear at most once per form. Both foreign keys MUST use `ON DELETE CASCADE` so that deleting a form removes its field rows, and deleting a field removes it from all forms.

#### Scenario: Composite PK prevents duplicate field in a form

- **WHEN** a client attempts to insert a second row with the same `(form_id, field_id)` pair
- **THEN** the database rejects the insert

#### Scenario: Deleting a form cascades to its field rows

- **WHEN** a form is deleted
- **THEN** all `t_form_field` rows with that `form_id` are automatically removed

### Requirement: Form CRUD endpoints

The API SHALL expose `GET /api/forms`, `GET /api/forms/:id`, `GET /api/forms/exists?name=…`, `POST /api/forms`, `PATCH /api/forms/:id`, `DELETE /api/forms`, and `DELETE /api/forms/:id`. All require ADMIN role. Duplicate `name` returns 409. Missing id returns 404. Audit columns are system-managed.

#### Scenario: Create a form

- **WHEN** an ADMIN client posts `{ name: 'onboarding', description: 'New hire form' }` to `POST /api/forms`
- **THEN** the response is `201` with the created `FormDto` including audit fields

#### Scenario: Duplicate name rejected

- **WHEN** an ADMIN client posts `{ name: 'onboarding' }` and a form with that name already exists
- **THEN** the response is `409`

### Requirement: Form field list and batch replace

The API SHALL expose `GET /api/forms/:id/fields` returning the form's fields ordered by `position` ASC, each including a minimal field snapshot (`id`, `name`, `title`, `type`). The API SHALL expose `PUT /api/forms/:id/fields` accepting `{ fields: [{ fieldId, position }] }` that atomically replaces the entire field list for the form in a single transaction. If any `fieldId` does not exist in `t_field`, the operation MUST be rejected with `400`. Requires ADMIN role.

#### Scenario: Get fields ordered by position

- **WHEN** an ADMIN client calls `GET /api/forms/3/fields` and the form has two fields at positions 2 and 1
- **THEN** the response lists the field at position 1 first, then position 2

#### Scenario: PUT replaces the entire list atomically

- **WHEN** an ADMIN client sends `PUT /api/forms/3/fields` with `{ fields: [{ fieldId: 5, position: 1 }, { fieldId: 7, position: 2 }] }`
- **THEN** any previous field rows for form 3 are removed and the two new rows are inserted; a subsequent GET returns exactly these two rows in position order

#### Scenario: PUT with unknown fieldId rejected

- **WHEN** an ADMIN client sends `PUT /api/forms/3/fields` with a `fieldId` that does not exist in `t_field`
- **THEN** the response is `400` and no rows are modified

### Requirement: All Forms page

The web app SHALL provide `/settings/form` titled `All Forms`. Non-paginated table with columns: checkbox, `#<id>`, Name (link to detail), Description (truncated to 100 chars + `...` if longer), Action (`Design` link to `/settings/form/:id/design?from=list`). Buttons: `+ Add`, `- Delete` (confirmation `Delete Forms?`). Requires ADMIN.

#### Scenario: Description truncated

- **WHEN** a form has a description longer than 100 characters
- **THEN** the list page shows the first 100 characters followed by `...`

### Requirement: Form Detail page

The web app SHALL provide `/settings/form/:id` titled `Form #<id>`. Displays ID, Name, Description, and audit info read-only. Back button → list. Buttons: `Edit`, `- Delete` (confirmation `Delete Form #<id>?`; on confirm → list), `Design` (→ `/settings/form/:id/design?from=detail`). Requires ADMIN.

#### Scenario: Detail page renders

- **WHEN** an ADMIN user navigates to /settings/form/5
- **THEN** the page shows ID, Name, Description, and audit info read-only with Edit, Delete, and Design buttons

#### Scenario: Delete from detail

- **WHEN** an ADMIN user clicks Delete on the detail page and confirms
- **THEN** the form is deleted and the user is navigated to the list

### Requirement: Add Form page

The web app SHALL provide `/settings/form/new` titled `Add Form`. Back button → list. Inputs: Name (duplicate check), Description. Buttons: `Save` (POST → list), `Save & Design` (POST → `/settings/form/:newId/design?from=detail`), `Cancel` (→ list). Requires ADMIN.

#### Scenario: Save & Design navigates to Design page

- **WHEN** the ADMIN user fills in a valid name and clicks `Save & Design`
- **THEN** the form is created and the browser navigates to `/settings/form/:newId/design?from=detail`

### Requirement: Edit Form page

The web app SHALL provide `/settings/form/:id/edit` titled `Edit Form #<id>`. Back button → detail. Inputs: ID (read-only), Name (duplicate check with ignoreValue for self), Description. Buttons: `Save` (PATCH → detail), `Save & Design` (PATCH → `/settings/form/:id/design?from=detail`), `Cancel` (→ detail). Requires ADMIN.

#### Scenario: Edit preserves existing values

- **WHEN** an ADMIN user opens the edit page for form 5
- **THEN** all inputs are prefilled with the current Name and Description

#### Scenario: Save navigates to detail

- **WHEN** the ADMIN user edits the name and clicks Save
- **THEN** the form is updated and the browser navigates to /settings/form/5

### Requirement: Design Form page with drag-and-drop

The web app SHALL provide `/settings/form/:id/design` titled `Design Form #<id>`. The page reads a `?from=list|detail` query parameter to determine the back button and Cancel target: `from=list` → `/settings/form`; otherwise → `/settings/form/:id`. The page loads the current field list on mount and holds all changes in local React state until Save. Buttons: `+ Add` (opens Select Field modal), `Save` (PUT → navigate to `from` target), `Cancel` (navigate to `from` target without saving). The field list is a table with columns: drag handle, Position (1-based), `#<fieldId>`, Name, trash icon (removes row). Rows are reorderable via HTML5 drag-and-drop. Requires ADMIN.

#### Scenario: Back button from list context

- **WHEN** the user navigates to `/settings/form/3/design?from=list` and clicks the back button
- **THEN** the SPA navigates to `/settings/form`

#### Scenario: Back button from detail context

- **WHEN** the user navigates to `/settings/form/3/design?from=detail` and clicks the back button
- **THEN** the SPA navigates to `/settings/form/3`

#### Scenario: Unsaved changes are discarded on Cancel

- **WHEN** the user reorders fields and clicks Cancel
- **THEN** no PUT is issued and the user is navigated to the `from` target

#### Scenario: Save persists the current order

- **WHEN** the user drags field B above field A and clicks Save
- **THEN** `PUT /api/forms/:id/fields` is called with field B at position 1 and field A at position 2

### Requirement: Select Field modal

The web app SHALL provide a modal dialog titled `Select Field` opened from the Design page's `+ Add` button. The modal fetches all fields from `GET /api/fields` on mount and renders a `<select>` showing `#<id> - <name>` sorted by id with an initial empty value. Below the select, the description of the currently selected field is displayed. `Select` button adds the field to the Design page's local list (if already present, does nothing silently). `Cancel` closes the modal without adding anything.

#### Scenario: Duplicate field silently ignored

- **WHEN** the user selects a field that is already in the Design page's list and clicks Select
- **THEN** the modal closes and the list is unchanged

