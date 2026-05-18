## 1. Database: append t_form and t_form_field DDL

- [x] 1.1 Append to `docs/database.sql` after the `t_field` block:

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

## 2. API: entities + register in DatabaseModule

- [x] 2.1 Create `packages/api/src/app/form/form.entity.ts` with `@Entity({ name: 't_form' })`: id (PK auto), name (varchar 255 unique), description (text nullable), createdOn (@CreateDateColumn), createdBy (varchar 255), updatedOn (@UpdateDateColumn nullable), updatedBy (varchar 255 nullable).
- [x] 2.2 Create `packages/api/src/app/form/form-field.entity.ts` with `@Entity({ name: 't_form_field' })`: formId (int, part of composite PK), fieldId (int, part of composite PK), position (int), createdOn, createdBy, updatedOn, updatedBy. Use `@PrimaryColumn()` for both formId and fieldId. Add a `@ManyToOne` relation to `FieldEntity` for the join used in GET /fields.
- [x] 2.3 Update `packages/api/src/app/database/database.module.ts`: add `FormEntity` and `FormFieldEntity` to the entities array.

## 3. API: DTOs

- [x] 3.1 Create `packages/api/src/app/form/form.dto.ts` exporting:
  - `CreateFormDto`: `name` (@IsString, @MinLength(1), @MaxLength(255)), `description` (@IsOptional, @IsString).
  - `UpdateFormDto`: same fields.
  - `PutFormFieldsDto`: `fields` (@IsArray, @ValidateNested each) where each item is `{ fieldId: number (@IsInt), position: number (@IsInt) }`.
  - `DeleteFormsDto`: `ids` (@IsArray, @ArrayMinSize(1), @IsInt each).
  - `FormDto` type: `{ id, name, description, createdOn, createdBy, updatedOn, updatedBy }`.
  - `FormFieldDto` type: `{ formId, fieldId, position, field: { id, name, title, type } }`.

## 4. API: FormService

- [x] 4.1 Create `packages/api/src/app/form/form.service.ts` with:
  - `findAll()` — ordered by id ASC.
  - `findById(id)` — throws NotFoundException if missing.
  - `existsByName(name)` — boolean.
  - `create(dto, userName)` — duplicate name check (409), sets createdBy, saves.
  - `update(id, dto, userName)` — loads row (404), duplicate name check excluding self (409), sets updatedBy, saves.
  - `removeMany(ids)` — bulk delete, returns count.
  - `removeOne(id)` — loads row (404), deletes.
  - `getFields(formId)` — loads form (404), returns `t_form_field` rows joined with `t_field` ordered by position ASC.
  - `putFields(formId, dto, userName)` — loads form (404), validates all fieldIds exist in `t_field` (400 if any missing), runs in a transaction: delete all existing rows for formId, insert new set with createdBy/updatedBy = userName.

## 5. API: FormController + FormModule + wire up

- [x] 5.1 Create `packages/api/src/app/form/form.controller.ts` annotated `@Controller('forms')` and `@Roles('ADMIN')` with all nine endpoints. `toDto` helper maps entity to `FormDto`. `toFieldDto` maps join row to `FormFieldDto`.
- [x] 5.2 Create `packages/api/src/app/form/form.module.ts`: `TypeOrmModule.forFeature([FormEntity, FormFieldEntity])`, declare controller, provide service.
- [x] 5.3 Import `FormModule` in `app.module.ts`.
- [x] 5.4 Run `npx tsc --noEmit -p packages/api/tsconfig.app.json` — clean.

## 6. Web: sidebar menu entry

- [x] 6.1 Update `menu-config.ts`: add `{ id: 'settings-form', label: 'Form', to: '/settings/form', roles: ['ADMIN'] }` after the `Field` entry.

## 7. Web: shared types + hooks

- [x] 7.1 Create `packages/web/src/app/pages/form/types.ts` exporting `FormDto`, `FormFieldDto`, `FieldSnapshotDto`.
- [x] 7.2 Create `use-forms.ts` — fetches `GET /forms`, returns `{ state, reload }`.
- [x] 7.3 Create `use-form.ts` — fetches `GET /forms/:id`, returns `{ state, reload }` with 404 distinction.
- [x] 7.4 Create `use-form-fields.ts` — fetches `GET /forms/:id/fields`, returns `{ state, reload }`.
- [x] 7.5 Create `use-form-exists-check.ts` — debounced name check against `GET /forms/exists?name=…` with `ignoreValue` support.

## 8. Web: All Forms list page

- [x] 8.1 Create `list-page.tsx` exporting `<FormListPage />`:
  - Title: `All Forms`. Buttons: `+ Add`, `- Delete` (confirmation `Delete Forms?`).
  - Table columns: checkbox, `#<id>`, Name (link to detail), Description (truncated to 100 chars + `...`), Action (`Design` link to `/settings/form/:id/design?from=list`).

## 9. Web: Form Detail page

- [x] 9.1 Create `detail-page.tsx` exporting `<FormDetailPage />`:
  - Title: `Form #<id>`. Back button → `/settings/form`.
  - Displays ID, Name, Description read-only. Audit info at bottom.
  - Buttons: `Edit` (→ edit page), `- Delete` (confirmation `Delete Form #<id>?`; on confirm → list), `Design` (→ `/settings/form/:id/design?from=detail`).

## 10. Web: Add Form page

- [x] 10.1 Create `add-page.tsx` exporting `<FormAddPage />`:
  - Title: `Add Form`. Back button → `/settings/form`.
  - Inputs: Name (duplicate check), Description (textarea).
  - Buttons: `Save` (POST → navigate to list), `Save & Design` (POST → navigate to `/settings/form/:newId/design?from=detail`), `Cancel` (→ list).

## 11. Web: Edit Form page

- [x] 11.1 Create `edit-page.tsx` exporting `<FormEditPage />`:
  - Title: `Edit Form #<id>`. Back button → `/settings/form/:id`.
  - Inputs: ID (read-only), Name (duplicate check with ignoreValue), Description.
  - Buttons: `Save` (PATCH → navigate to detail), `Save & Design` (PATCH → navigate to `/settings/form/:id/design?from=detail`), `Cancel` (→ detail).

## 12. Web: Select Field modal

- [x] 12.1 Create `select-field-modal.tsx` exporting `<SelectFieldModal onSelect(fieldId) onCancel />`:
  - Fetches `GET /fields` on mount.
  - `<select>` showing `#<id> - <name>` for each field, sorted by id, initial empty value.
  - Below the select: description of the selected field (or empty).
  - `Select` button: calls `onSelect(selectedFieldId)`. Disabled when no field selected.
  - `Cancel` button: calls `onCancel`.

## 13. Web: Design Form page

- [x] 13.1 Create `design-page.tsx` exporting `<FormDesignPage />`:
  - Reads `id` from `useParams`, `from` from `useSearchParams` (default `'detail'`).
  - Loads field list via `GET /forms/:id/fields` on mount into local state `rows: Array<{ fieldId, name, title, type }>`.
  - Title: `Design Form #<id>`. Back button navigates to `from === 'list' ? '/settings/form' : '/settings/form/:id'`.
  - `+ Add` button opens `<SelectFieldModal>`. On select: if fieldId already in rows, do nothing; else append to rows.
  - Table columns: drag handle (`⠿`), Position (1-based index), `#<fieldId>`, Name, trash icon (removes row).
  - Drag-and-drop: `draggable={true}` on each row; `onDragStart` records `dragIndex`; `onDragOver` swaps items in state for live preview; `onDragEnd` finalises.
  - `Save` button: `PUT /api/forms/:id/fields` with `{ fields: rows.map((r, i) => ({ fieldId: r.fieldId, position: i + 1 })) }`; on success navigate to `from` target.
  - `Cancel` button: navigate to `from` target without saving.

## 14. Web: routes

- [x] 14.1 Update `app.tsx`: add six routes (list, new, :id, :id/edit, :id/design — note `new` before `:id`) wrapped in `<RequireRole role="ADMIN">`.

## 15. Verification

- [x] 15.1 Run `npx tsc --noEmit` for both projects — clean.
- [x] 15.2 Run `npx nx build web` and `npx nx build @wo-poc/api` — both succeed.
- [x] 15.3 E2E: create a form, click `Design`, add two fields, drag to reorder, save — verify `GET /api/forms/:id/fields` returns the correct order. — Manual developer verification.
- [x] 15.4 E2E: `Save & Design` from Add page navigates directly to Design page; back button returns to Detail. — Manual developer verification.
- [x] 15.5 E2E: `Design` link from All Forms list navigates to Design page; back button returns to All Forms. — Manual developer verification.
- [x] 15.6 E2E: deleting a field that is in a form removes it from the form (CASCADE). — Manual developer verification.
