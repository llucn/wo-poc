## 1. Database: append t_field DDL to docs/database.sql

- [x] 1.1 Append the following statement to `docs/database.sql` (after the existing `t_issue_category` block):

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

Verify the script remains idempotent (`IF NOT EXISTS`). — Manual developer verification (run the script twice).

## 2. API: FieldEntity + register in DatabaseModule

- [x] 2.1 Create `packages/api/src/app/field/field.entity.ts` exporting `FieldEntity` with `@Entity({ name: 't_field' })`:
  - `@PrimaryGeneratedColumn() id!: number`
  - `@Column({ type: 'varchar', length: 255, unique: true }) name!: string`
  - `@Column({ type: 'varchar', length: 255 }) title!: string`
  - `@Column({ type: 'text', nullable: true }) description!: string | null`
  - `@Column({ type: 'int', default: 0 }) required!: number`
  - `@Column({ name: 'default_value', type: 'text', nullable: true }) defaultValue!: string | null`
  - `@Column({ type: 'varchar', length: 64 }) type!: string`
  - `@Column({ type: 'text', nullable: true }) properties!: string | null`
  - `@CreateDateColumn({ name: 'created_on' }) createdOn!: Date`
  - `@Column({ name: 'created_by', type: 'varchar', length: 255 }) createdBy!: string`
  - `@UpdateDateColumn({ name: 'updated_on', nullable: true }) updatedOn!: Date | null`
  - `@Column({ name: 'updated_by', type: 'varchar', length: 255, nullable: true }) updatedBy!: string | null`
- [x] 2.2 Update `packages/api/src/app/database/database.module.ts`: import `FieldEntity` and add it to the `entities` array alongside `IssueCategoryEntity`.

## 3. API: field-type enum + properties validation

- [x] 3.1 Create `packages/api/src/app/field/field-type.ts` exporting:
  - `FIELD_TYPES` const array: `['text-field', 'text-area', 'number', 'select', 'radio', 'checkbox', 'date', 'datetime', 'file']`
  - `type FieldType = (typeof FIELD_TYPES)[number]`
  - `function isFieldType(value: string): value is FieldType`
- [x] 3.2 Create `packages/api/src/app/field/validate-properties.ts` exporting `validateProperties(type: FieldType, properties: unknown): string | null`. Rules:
  - `text-field`: optional object `{ min_length?: number, max_length?: number }`. Both must be non-negative integers if present.
  - `text-area`: optional object `{ rows?: number }`. Must be positive integer if present.
  - `number`: optional object `{ precision?: number, scale?: number }`. Both must be non-negative integers if present.
  - `select` / `radio`: required object `{ values: Array<{ label: string, value: string }> }`. `values` must be a non-empty array.
  - `checkbox`: optional object `{ label?: string }`.
  - `date`: optional object `{ format?: string }`.
  - `datetime`: optional object `{ format?: string }`.
  - `file`: optional object `{ types?: string[] }`. Each element must be a non-empty string.
  - Returns `null` if valid, or a human-readable error string.

## 4. API: DTOs

- [x] 4.1 Create `packages/api/src/app/field/field.dto.ts` exporting:
  - `CreateFieldDto`: `name` (@IsString, @MinLength(1), @MaxLength(255)), `title` (@IsString, @MinLength(1), @MaxLength(255)), `description` (@IsOptional, @IsString), `required` (@IsBoolean), `defaultValue` (@IsOptional, @IsString), `type` (@IsString, @IsIn(FIELD_TYPES)), `properties` (@IsOptional — accepts object or null).
  - `UpdateFieldDto`: same fields as Create (all present — full replacement semantics on PATCH).
  - `DeleteFieldsDto`: `ids` (@IsArray, @ArrayMinSize(1), @IsInt({ each: true })).
  - `FieldDto` type: `{ id: number; name: string; title: string; description: string | null; required: boolean; defaultValue: string | null; type: FieldType; properties: object | null; createdOn: string; createdBy: string; updatedOn: string | null; updatedBy: string | null }`.
  - `ExistsFieldResponseDto` type: `{ name: boolean }`.

## 5. API: FieldService

- [x] 5.1 Create `packages/api/src/app/field/field.service.ts` with methods:
  - `findAll(): Promise<FieldEntity[]>` — ordered by id ASC.
  - `findById(id: number): Promise<FieldEntity>` — throws NotFoundException if missing.
  - `existsByName(name: string): Promise<boolean>`.
  - `create(dto: CreateFieldDto, userName: string): Promise<FieldEntity>` — checks name duplicate (409), validates properties via `validateProperties` (400), serializes properties to JSON string, maps `required` boolean→int, sets `createdBy = userName`, saves.
  - `update(id: number, dto: UpdateFieldDto, userName: string): Promise<FieldEntity>` — loads row (404), checks name duplicate excluding self (409), validates properties (400), updates all mutable columns, sets `updatedBy = userName`, saves. Catches ER_DUP_ENTRY on `uk_t_field_name` as fallback 409.
  - `removeMany(ids: number[]): Promise<number>` — bulk delete, returns affected count.
  - `removeOne(id: number): Promise<void>` — loads row (404), deletes it.

## 6. API: FieldController

- [x] 6.1 Create `packages/api/src/app/field/field.controller.ts` annotated `@Controller('fields')` and `@Roles('ADMIN')`:
  - `@Get() findAll()` → `FieldDto[]`
  - `@Get('exists') exists(@Query('name') name?: string)` → `ExistsFieldResponseDto`
  - `@Get(':id') findOne(@Param('id', ParseIntPipe) id)` → `FieldDto`
  - `@Post() create(@Body() dto: CreateFieldDto, @CurrentUser() user)` → `FieldDto` (201). Passes `user.userName` to service.
  - `@Patch(':id') update(@Param('id', ParseIntPipe) id, @Body() dto: UpdateFieldDto, @CurrentUser() user)` → `FieldDto`. Passes `user.userName` to service.
  - `@Delete() removeMany(@Body() dto: DeleteFieldsDto)` → `{ deleted: number }`
  - `@Delete(':id') removeOne(@Param('id', ParseIntPipe) id)` → `{ deleted: boolean }`
  - A `toDto(entity)` helper that maps `required` int→boolean, `properties` string→parsed object, `createdOn`/`updatedOn` Date→ISO string.

## 7. API: FieldModule + wire up

- [x] 7.1 Create `packages/api/src/app/field/field.module.ts`: import `TypeOrmModule.forFeature([FieldEntity])`, declare controller, provide service.
- [x] 7.2 Import `FieldModule` in `packages/api/src/app/app.module.ts`.
- [x] 7.3 Run `npx tsc --noEmit -p packages/api/tsconfig.app.json` — clean.

## 8. Web: sidebar menu entry

- [x] 8.1 Update `packages/web/src/app/shell/menu-config.ts`: add a `Field` child in the `settings` group (after `Issue Category`): `{ id: 'settings-field', label: 'Field', to: '/settings/field', roles: ['ADMIN'] }`.

## 9. Web: shared types + hooks

- [x] 9.1 Create `packages/web/src/app/pages/field/types.ts` exporting `FieldDto`, `FieldType`, `FIELD_TYPES`, `ExistsFieldResponse`.
- [x] 9.2 Create `packages/web/src/app/pages/field/use-fields.ts` — hook that fetches `GET /fields` and returns `{ state, reload }` (same pattern as `useIssueCategories`).
- [x] 9.3 Create `packages/web/src/app/pages/field/use-field.ts` — hook that fetches `GET /fields/:id` and returns `{ state, reload }` with 404 distinction (same pattern as `useIssueCategory`).
- [x] 9.4 Create `packages/web/src/app/pages/field/use-field-exists-check.ts` — debounced name check hook (reuse pattern from `useExistsCheck` but for the `/fields/exists?name=…` endpoint).

## 10. Web: All Fields list page

- [x] 10.1 Create `packages/web/src/app/pages/field/list-page.tsx` exporting `<FieldListPage />`:
  - Title: `All Fields`.
  - Buttons: `+ Add` (navigates to `/settings/field/new`), `- Delete` (disabled when no rows selected; opens confirmation dialog `Delete Fields?`).
  - Table columns: checkbox, `#<id>`, Name (link to detail), Title, Required (Yes/No).
  - Delete flow: calls `DELETE /api/fields` with selected ids, reloads list.

## 11. Web: Field Detail page

- [x] 11.1 Create `packages/web/src/app/pages/field/detail-page.tsx` exporting `<FieldDetailPage />`:
  - Title: `Field #<id>`.
  - Back button → `/settings/field`.
  - Displays all 8 user-facing fields read-only. `Properties` renders type-specific key-value pairs.
  - Below the properties section, displays audit info: `Created` (formatted timestamp + `by <name>`) and `Updated` (formatted timestamp + `by <name>`, or "—" if never updated).
  - Buttons: `Edit` (navigates to edit page), `- Delete` (confirmation dialog `Delete Field #<id>?`; calls `DELETE /api/fields/:id`; on success navigates to list).
  - Handles 404 with `Field not found` placeholder.

## 12. Web: Properties display + editor components

- [x] 12.1 Create `packages/web/src/app/pages/field/properties-display.tsx` — a read-only component that renders the parsed properties object based on the field type. Used by the Detail page.
- [x] 12.2 Create `packages/web/src/app/pages/field/properties-editor.tsx` — a form component `<PropertiesEditor type={type} value={properties} onChange={setProperties} />` that renders type-specific inputs:
  - `text-field`: two number inputs (min_length, max_length).
  - `text-area`: one number input (rows).
  - `number`: two number inputs (precision, scale).
  - `select` / `radio`: a dynamic list of {label, value} rows with add/remove buttons.
  - `checkbox`: one text input (label).
  - `date` / `datetime`: one text input (format) with a placeholder showing the default.
  - `file`: one text input (comma-separated extensions).
  When `type` changes, reset the properties value to the new type's defaults.

## 13. Web: Add Field page

- [x] 13.1 Create `packages/web/src/app/pages/field/add-page.tsx` exporting `<FieldAddPage />`:
  - Title: `Add Field`. Back button → `/settings/field`.
  - Inputs: Name (with debounced duplicate check), Title, Description (textarea), Required (select: Yes/No), Default Value, Type (select from FIELD_TYPES), Properties (PropertiesEditor).
  - Save disabled while: name empty, title empty, name duplicate, name check pending, submitting.
  - On Save: POST `/api/fields`; on 201 → navigate to list; on 409 → inline error on Name; on 400 → show error message.
  - Cancel → navigate to list.

## 14. Web: Edit Field page

- [x] 14.1 Create `packages/web/src/app/pages/field/edit-page.tsx` exporting `<FieldEditPage />`:
  - Title: `Edit Field #<id>`. Back button → `/settings/field/:id`.
  - Loads existing field via `useField(id)`.
  - Inputs: ID (read-only), Name (editable, with duplicate check using ignoreValue for self), Title, Description, Required, Default Value, Type, Properties (PropertiesEditor).
  - Save disabled while: name empty, title empty, name duplicate, name check pending, submitting.
  - On Save: PATCH `/api/fields/:id`; on 200 → navigate to detail; on 409 → inline error; on 404 → navigate to list.
  - Cancel → navigate to detail.

## 15. Web: routes

- [x] 15.1 Update `packages/web/src/app/app.tsx`: add four routes (in order: list, new, :id, :id/edit) wrapped in `<RequireRole role="ADMIN">`, before the catch-all.

## 16. Verification

- [x] 16.1 Run `npx tsc --noEmit -p packages/web/tsconfig.app.json` and `npx tsc --noEmit -p packages/api/tsconfig.app.json` — both clean.
- [x] 16.2 Run `npx nx build web` and `npx nx build @wo-poc/api` — both succeed.
- [x] 16.3 End-to-end ADMIN flow: add a field with type `select` and two values, see it in the list, open detail, edit it to change type to `text-field`, confirm properties reset, save, verify detail shows new properties. — Manual developer verification.
- [x] 16.4 Duplicate-name check: on Add page type an existing name → inline error; on Edit page the field's own name does not trigger the error. — Manual developer verification.
- [x] 16.5 Delete from detail: click `- Delete` on detail page → confirmation shows `Delete Field #<id>?` → confirm → navigates to list and field is gone. — Manual developer verification.
- [x] 16.6 Non-ADMIN user: sidebar does not show `Field`; direct navigation to `/settings/field` shows 403 placeholder. — Manual developer verification.
