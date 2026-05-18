## Context

The workspace has a working persistence layer (MySQL, TypeORM, `DatabaseModule`), RBAC (`@Roles`, `RolesGuard`, `RequireRole`), and a complete `field` feature (`t_field`, `/api/fields`, four web pages). The `form-customization` change builds directly on top of `field`: a form is a named container that references existing field definitions via the `t_form_field` join table.

The key complexity in this change is the **Design page**: it is a client-side drag-and-drop editor whose state lives entirely in React until the user clicks Save, at which point the entire field list is replaced atomically via a single `PUT /api/forms/:id/fields` call. The Design page also has a context-sensitive back button driven by a `?from=list|detail` query parameter.

## Goals / Non-Goals

**Goals:**

- Full CRUD for form definitions (`t_form`).
- Atomic batch replace of a form's field list (`t_form_field`) via a single PUT endpoint.
- Client-side drag-and-drop reordering using the HTML5 Drag and Drop API (no library).
- `Save & Design` shortcut on Add/Edit pages.
- Context-sensitive back button on the Design page via `?from=list|detail` query param.
- Select Field modal that prevents duplicate field additions.

**Non-Goals:**

- Form rendering for end-user data entry.
- Form versioning or change history.
- Conditional field visibility or cross-field validation rules.

## Decisions

### 1. Table schema

```sql
CREATE TABLE IF NOT EXISTS t_form (
  id          INT          NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NULL,
  created_on  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  VARCHAR(255) NOT NULL,
  updated_on  TIMESTAMP    NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  updated_by  VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_t_form_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_form_field (
  form_id    INT          NOT NULL,
  field_id   INT          NOT NULL,
  position   INT          NOT NULL,
  created_on TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  updated_on TIMESTAMP    NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NULL,
  PRIMARY KEY (form_id, field_id),
  CONSTRAINT fk_form_field_form  FOREIGN KEY (form_id)  REFERENCES t_form(id)  ON DELETE CASCADE,
  CONSTRAINT fk_form_field_field FOREIGN KEY (field_id) REFERENCES t_field(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- `ON DELETE CASCADE` on both FKs: deleting a form removes its field rows; deleting a field removes it from all forms. This keeps the DB consistent without application-layer cleanup.
- `(form_id, field_id)` composite PK enforces the "a field can appear at most once per form" rule at the DB level.
- `position` is a plain INT (not auto-managed). The application assigns positions 1, 2, 3… when saving the Design page.

### 2. API endpoint shape

| Method | Path                          | Body                                    | Response                        | Status codes          |
| ------ | ----------------------------- | --------------------------------------- | ------------------------------- | --------------------- |
| GET    | `/api/forms`                  | —                                       | `FormDto[]`                     | 200                   |
| GET    | `/api/forms/exists?name=…`    | —                                       | `{ name: boolean }`             | 200                   |
| GET    | `/api/forms/:id`              | —                                       | `FormDto`                       | 200, 404              |
| POST   | `/api/forms`                  | `{ name, description? }`                | `FormDto`                       | 201, 400, 409         |
| PATCH  | `/api/forms/:id`              | `{ name, description? }`                | `FormDto`                       | 200, 400, 404, 409    |
| DELETE | `/api/forms`                  | `{ ids: number[] }`                     | `{ deleted: number }`           | 200, 400              |
| DELETE | `/api/forms/:id`              | —                                       | `{ deleted: boolean }`          | 200, 404              |
| GET    | `/api/forms/:id/fields`       | —                                       | `FormFieldDto[]`                | 200, 404              |
| PUT    | `/api/forms/:id/fields`       | `{ fields: [{ fieldId, position }] }`   | `FormFieldDto[]`                | 200, 400, 404         |

`FormDto = { id, name, description, createdOn, createdBy, updatedOn, updatedBy }`.

`FormFieldDto = { formId, fieldId, position, field: { id, name, title, type } }` — the GET includes a minimal field snapshot so the Design page can display name/type without a second request.

The `PUT /api/forms/:id/fields` runs inside a transaction: delete all existing `t_form_field` rows for the form, then insert the new set. If any `fieldId` does not exist in `t_field`, the transaction rolls back and returns 400.

### 3. Design page state management

The Design page loads the current field list via `GET /api/forms/:id/fields` on mount. It stores the list in local React state as `Array<{ fieldId, position, name, title, type }>`. All mutations (add, remove, reorder) update only this local array. The `position` values are recomputed as 1-based indices of the array order before saving.

On Save: `PUT /api/forms/:id/fields` with `{ fields: state.map((row, i) => ({ fieldId: row.fieldId, position: i + 1 })) }`. On success, navigate to the `from` target.

On Cancel: navigate to the `from` target without saving.

### 4. Drag-and-drop: HTML5 API, no library

Each row has a drag handle (`⠿` or similar glyph). The row element has `draggable={true}`. We track `dragIndex` and `dropIndex` in state. On `dragOver`, we swap the items in the local array to give live visual feedback. On `dragEnd`, the final order is committed to state.

Why no library (e.g. `@dnd-kit`)? The list is short (tens of fields, not thousands), the interaction is simple (vertical reorder only), and the project has already avoided adding drag-and-drop dependencies. The HTML5 API is sufficient and keeps the bundle lean.

### 5. `?from=list|detail` query param for Design page back button

The Design page reads `useSearchParams()` to get `from`. If `from === 'list'`, the back button and Cancel navigate to `/settings/form`. Otherwise (default), they navigate to `/settings/form/:id`. Callers that navigate to the Design page are responsible for appending `?from=list` when coming from the list, and `?from=detail` (or omitting the param) when coming from Detail/Edit/Add.

### 6. `Save & Design` button

On Add Form: after a successful `POST /api/forms`, navigate to `/settings/form/:newId/design?from=detail` (so the Design page's back button returns to the new form's Detail page).

On Edit Form: after a successful `PATCH /api/forms/:id`, navigate to `/settings/form/:id/design?from=detail`.

### 7. Select Field modal

The modal is a simple React component rendered inline (no portal needed — it uses the same `.ic-modal-overlay` pattern as the existing `ConfirmDeleteDialog`). It fetches `GET /api/fields` once on mount and renders a `<select>` of all fields. When the user picks a field and clicks Select, the parent Design page checks if `fieldId` is already in the local list; if so, it does nothing (no error shown — the spec says "不做任何事情"). The modal closes after Select or Cancel.

### 8. Description truncation in All Forms list

The list page truncates `description` to 100 characters client-side: `desc.length > 100 ? desc.slice(0, 100) + '...' : desc`. No server-side change needed.

## Risks / Trade-offs

- **Risk**: `ON DELETE CASCADE` on `t_form_field.field_id` means deleting a field silently removes it from all forms. → **Mitigation**: Acceptable for a settings-level admin tool. A future change can add a "field is in use" check before deletion if needed.
- **Risk**: The `PUT /api/forms/:id/fields` delete-then-insert pattern has a brief window where the form has no fields. → **Mitigation**: The operation runs in a TypeORM transaction, so it is atomic from the DB's perspective. No concurrent reader will see the intermediate empty state.
- **Risk**: HTML5 drag-and-drop has inconsistent behavior on touch devices. → **Mitigation**: The Design page is an admin tool used on desktop. Touch support is out of scope.
- **Trade-off**: `FormFieldDto` includes a minimal field snapshot (`id, name, title, type`) to avoid a second API call from the Design page. This means the GET response is slightly larger, but the Design page needs at least `name` to display the list meaningfully.
