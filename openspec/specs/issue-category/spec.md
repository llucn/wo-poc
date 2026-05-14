# issue-category Specification

## Purpose
Database-backed CRUD for the issue-category taxonomy — the `t_issue_category` table schema, six REST endpoints under `/api/issue-categories`, the All/Add/Detail/Edit pages in the web shell, the duplicate-name rule, the kebab-case format rule on `name`, and the name-is-immutable-post-creation rule. All pages and endpoints are gated to users in the `ADMIN` Cognito group.

## Requirements


### Requirement: `t_issue_category` schema

The database SHALL contain a table named `t_issue_category` with the following columns:

| Column         | Type         | Constraints                       |
| -------------- | ------------ | --------------------------------- |
| `id`           | INT          | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| `name`         | VARCHAR(255) | NOT NULL, UNIQUE                  |
| `display_name` | VARCHAR(255) | NOT NULL, UNIQUE                  |

The table MUST use the `utf8mb4` character set so that full-Unicode category names are supported. Both unique indexes MUST be enforced at the database level so that any attempt to insert a duplicate `name` or `display_name` value fails regardless of whether the application performed a pre-check.

#### Scenario: Inserting two rows with the same name

- **WHEN** a client successfully creates a category with `name = 'hardware'` and then attempts to create a second category with `name = 'hardware'` and a different `displayName`
- **THEN** the database rejects the second insert and the API returns `409 Conflict`

#### Scenario: Inserting two rows with the same display name

- **WHEN** a client successfully creates a category with `displayName = 'Hardware'` and then attempts to create a second category with a different `name` but `displayName = 'Hardware'`
- **THEN** the database rejects the second insert and the API returns `409 Conflict`

#### Scenario: Identifier is auto-assigned

- **WHEN** a client creates a category and does not supply an `id` in the request body
- **THEN** the database assigns the next sequential integer and the API returns the created row including that `id`

### Requirement: List issue categories

The API SHALL expose `GET /api/issue-categories` that returns every row in `t_issue_category`. The response MUST be a JSON array of `{ id, name, displayName }` objects ordered by `id` ascending. The response MUST NOT be paginated. The endpoint MUST require an authenticated session (the global `JwtAuthGuard` applies) AND membership in the `ADMIN` Cognito group; non-`ADMIN` callers MUST receive `403`.

#### Scenario: List with no rows

- **WHEN** an authenticated ADMIN client calls `GET /api/issue-categories` against an empty table
- **THEN** the response is `200` with body `[]`

#### Scenario: List with multiple rows

- **WHEN** an authenticated ADMIN client calls `GET /api/issue-categories` against a table with three rows
- **THEN** the response is `200` with all three rows returned in ascending `id` order, each with fields `id`, `name`, and `displayName`

#### Scenario: List requires authentication

- **WHEN** an unauthenticated client calls `GET /api/issue-categories`
- **THEN** the response is `401`

#### Scenario: List requires ADMIN role

- **WHEN** an authenticated client whose access token's `cognito:groups` does not include `ADMIN` calls `GET /api/issue-categories`
- **THEN** the response is `403`

### Requirement: Create an issue category

The API SHALL expose `POST /api/issue-categories` accepting a JSON body of shape `{ name: string, displayName: string }`. Both fields MUST be non-empty strings no longer than 255 characters. The endpoint MUST require an authenticated session AND membership in the `ADMIN` Cognito group; non-`ADMIN` callers MUST receive `403`. On success the API MUST return `201` with the created row including its assigned `id`. If either field collides with an existing row's `name` or `display_name`, the API MUST return `409 Conflict` with a body that identifies which field collided.

#### Scenario: Successful create

- **WHEN** an authenticated ADMIN client posts `{ name: 'hardware', displayName: 'Hardware' }` to `POST /api/issue-categories` against a table where neither value exists
- **THEN** the response is `201` with body `{ id: <number>, name: 'hardware', displayName: 'Hardware' }` and the row is persisted

#### Scenario: Duplicate name

- **WHEN** an authenticated ADMIN client posts `{ name: 'hardware', displayName: 'Hardware (new)' }` and a row with `name = 'hardware'` already exists
- **THEN** the response is `409` with a body identifying `name` as the duplicate field

#### Scenario: Duplicate display name

- **WHEN** an authenticated ADMIN client posts `{ name: 'hardware-new', displayName: 'Hardware' }` and a row with `display_name = 'Hardware'` already exists
- **THEN** the response is `409` with a body identifying `displayName` as the duplicate field

#### Scenario: Empty field rejected

- **WHEN** an authenticated ADMIN client posts `{ name: '', displayName: 'Hardware' }`
- **THEN** the response is `400` with a validation error identifying `name`

#### Scenario: Field exceeds 255 characters

- **WHEN** an authenticated ADMIN client posts a `name` of 256 characters
- **THEN** the response is `400` with a validation error identifying `name`

#### Scenario: Create requires ADMIN role

- **WHEN** an authenticated client whose access token's `cognito:groups` does not include `ADMIN` posts `{ name: 'hardware', displayName: 'Hardware' }` to `POST /api/issue-categories`
- **THEN** the response is `403` and no row is persisted

### Requirement: Bulk delete issue categories

The API SHALL expose `DELETE /api/issue-categories` accepting a JSON body of shape `{ ids: number[] }`. The endpoint MUST require an authenticated session AND membership in the `ADMIN` Cognito group; non-`ADMIN` callers MUST receive `403`. The response MUST be `200` with body `{ deleted: <count> }` where `<count>` is the number of rows actually removed. Ids that do not match any row MUST be silently ignored (they contribute zero to the count). An empty `ids` array MUST be rejected with `400`.

#### Scenario: Delete multiple rows

- **WHEN** an authenticated ADMIN client posts `DELETE /api/issue-categories` with body `{ ids: [1, 2, 3] }` and all three rows exist
- **THEN** the response is `200` with body `{ deleted: 3 }` and the three rows are removed

#### Scenario: Delete with mix of valid and invalid ids

- **WHEN** an authenticated ADMIN client posts `DELETE /api/issue-categories` with body `{ ids: [1, 999] }`, row `1` exists and row `999` does not
- **THEN** the response is `200` with body `{ deleted: 1 }` and row `1` is removed

#### Scenario: Empty ids array rejected

- **WHEN** an authenticated ADMIN client posts `DELETE /api/issue-categories` with body `{ ids: [] }`
- **THEN** the response is `400`

#### Scenario: Delete requires ADMIN role

- **WHEN** an authenticated client whose access token's `cognito:groups` does not include `ADMIN` posts `DELETE /api/issue-categories` with body `{ ids: [1] }`
- **THEN** the response is `403` and no rows are removed

### Requirement: Duplicate-check endpoint for live form validation

The API SHALL expose `GET /api/issue-categories/exists` accepting optional query parameters `name` and `displayName`. The endpoint MUST require an authenticated session AND membership in the `ADMIN` Cognito group; non-`ADMIN` callers MUST receive `403`. The response MUST be `200` with body `{ name: boolean, displayName: boolean }`, where each boolean reports whether the corresponding value is already taken in `t_issue_category`. Missing query parameters MUST yield `false` for that field. The endpoint MUST NOT mutate any data.

#### Scenario: Both fields present, both available

- **WHEN** an authenticated ADMIN client calls `GET /api/issue-categories/exists?name=foo&displayName=Foo` against a table where neither value exists
- **THEN** the response is `200` with body `{ name: false, displayName: false }`

#### Scenario: Name already taken

- **WHEN** an authenticated ADMIN client calls `GET /api/issue-categories/exists?name=foo&displayName=Bar` and a row with `name = 'foo'` exists
- **THEN** the response is `200` with body `{ name: true, displayName: false }`

#### Scenario: Only one parameter provided

- **WHEN** an authenticated ADMIN client calls `GET /api/issue-categories/exists?name=foo`
- **THEN** the response is `200` with body `{ name: <true|false>, displayName: false }` reflecting only the `name` lookup

#### Scenario: Exists check requires ADMIN role

- **WHEN** an authenticated client whose access token's `cognito:groups` does not include `ADMIN` calls `GET /api/issue-categories/exists?name=foo`
- **THEN** the response is `403`

### Requirement: All Issue Categories page

The web app SHALL provide a page at route `/settings/issue-category` titled `All Issue Categories` that lists every category in a single non-paginated table. The page MUST require the caller to be a member of the `ADMIN` Cognito group; non-`ADMIN` users who reach the route MUST see a `403` placeholder rather than the table. The table MUST contain the columns `Check Box`, `ID` (rendered as `#<id>`), `Name`, and `Display Name`. Above the table the page MUST show two buttons: `+ Add` and `- Delete`. The `+ Add` button MUST navigate to `/settings/issue-category/new`. The `- Delete` button MUST open a confirmation dialog with the literal text `Delete categories?` and a confirm action that calls `DELETE /api/issue-categories` for the selected rows.

#### Scenario: List loads from API on mount

- **WHEN** an authenticated ADMIN user navigates to `/settings/issue-category`
- **THEN** the page issues `GET /api/issue-categories` and renders one row per returned object with the row's id formatted as `#<id>` in the `ID` column

#### Scenario: Add button navigates to add page

- **WHEN** the ADMIN user clicks the `+ Add` button
- **THEN** the SPA navigates to `/settings/issue-category/new`

#### Scenario: Delete button shows confirmation dialog

- **WHEN** the ADMIN user selects one or more rows and clicks the `- Delete` button
- **THEN** a dialog appears containing the exact text `Delete categories?`

#### Scenario: Delete confirm removes the selected rows

- **WHEN** the ADMIN user confirms the deletion dialog with ids `[2, 5]` selected
- **THEN** the page issues `DELETE /api/issue-categories` with body `{ ids: [2, 5] }`, reloads the list, and the two rows no longer appear

#### Scenario: Delete cancel keeps the rows

- **WHEN** the ADMIN user opens the deletion dialog and clicks `Cancel`
- **THEN** the dialog closes, no API call is made, and the selected rows remain in the list

#### Scenario: Non-ADMIN sees a 403 placeholder

- **WHEN** an authenticated user whose `cognito:groups` does not include `ADMIN` navigates to `/settings/issue-category`
- **THEN** the page renders a `403` placeholder identifying the route as restricted; no `GET /api/issue-categories` request is issued

### Requirement: Add Category page

The web app SHALL provide a page at route `/settings/issue-category/new` titled `Add Category` containing two text inputs labelled `Name` and `Display Name`, a primary `Save` button, and a secondary `Cancel` button. The page MUST require the caller to be a member of the `ADMIN` Cognito group; non-`ADMIN` users who reach the route MUST see a `403` placeholder rather than the form. The page header MUST render a borderless left-arrow back button to the left of the page title; clicking it MUST navigate to `/settings/issue-category` without submitting any form data. While the user types, the page MUST debounce each input and call `GET /api/issue-categories/exists` to surface an inline error if the value is already taken. The `Save` button MUST be disabled while either field is empty, while either field has a duplicate-name error, or while a duplicate check is pending. Clicking `Save` MUST `POST /api/issue-categories`; on success the page MUST navigate back to `/settings/issue-category`. Clicking `Cancel` MUST navigate to `/settings/issue-category` without submitting.

#### Scenario: Successful save

- **WHEN** the ADMIN user fills `Name = 'hardware'` and `Display Name = 'Hardware'` with no duplicates and clicks `Save`
- **THEN** the page calls `POST /api/issue-categories` with the field values and on success navigates to `/settings/issue-category`

#### Scenario: Inline duplicate-name error

- **WHEN** the ADMIN user types `hardware` into the `Name` field and a row with that name already exists
- **THEN** after the debounce expires the page shows an inline error on the `Name` field stating that the value is already taken

#### Scenario: Save disabled while duplicate check pending

- **WHEN** the ADMIN user has just typed a character and the debounced existence check has not yet returned
- **THEN** the `Save` button is disabled

#### Scenario: Cancel does not submit

- **WHEN** the ADMIN user fills both fields and clicks `Cancel`
- **THEN** the page navigates to `/settings/issue-category` and no `POST` is issued

#### Scenario: Back button returns to the list

- **WHEN** the ADMIN user has typed values into the form and clicks the back button to the left of the page title
- **THEN** the SPA navigates to `/settings/issue-category` and no `POST` is issued

#### Scenario: Server-side duplicate caught after race

- **WHEN** the pre-check returns `{ name: false }` but a concurrent client creates a row with that name before the ADMIN user clicks `Save`
- **THEN** the `POST` returns `409`, the page renders the same inline duplicate error on the corresponding field, and no navigation occurs

#### Scenario: Non-ADMIN sees a 403 placeholder

- **WHEN** an authenticated user whose `cognito:groups` does not include `ADMIN` navigates to `/settings/issue-category/new`
- **THEN** the page renders a `403` placeholder identifying the route as restricted; the form does not render

### Requirement: `Name` field must be kebab-case

The `name` column of `t_issue_category` MUST match the kebab-case regex `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`: only lowercase ASCII letters, digits, and hyphens are allowed; the value MUST start and end with an alphanumeric character; consecutive hyphens are not allowed; empty strings are not allowed. The API MUST enforce this on `POST /api/issue-categories` and return `400 Bad Request` when the supplied `name` does not match. The Add Category web page MUST also surface an inline format error as the user types when the current `Name` value is non-empty and does not match the rule, and MUST disable `Save` while the format error is present.

#### Scenario: Uppercase letters rejected by the API

- **WHEN** an authenticated ADMIN client posts `{ name: 'Hardware', displayName: 'Hardware' }` to `POST /api/issue-categories`
- **THEN** the response is `400` with a validation error identifying `name` and a message stating the value must be kebab-case

#### Scenario: Leading hyphen rejected by the API

- **WHEN** an authenticated ADMIN client posts `{ name: '-hardware', displayName: 'Hardware' }` to `POST /api/issue-categories`
- **THEN** the response is `400` with a validation error identifying `name`

#### Scenario: Trailing hyphen rejected by the API

- **WHEN** an authenticated ADMIN client posts `{ name: 'hardware-', displayName: 'Hardware' }` to `POST /api/issue-categories`
- **THEN** the response is `400` with a validation error identifying `name`

#### Scenario: Consecutive hyphens rejected by the API

- **WHEN** an authenticated ADMIN client posts `{ name: 'hardware--tools', displayName: 'Hardware Tools' }` to `POST /api/issue-categories`
- **THEN** the response is `400` with a validation error identifying `name`

#### Scenario: Underscore rejected by the API

- **WHEN** an authenticated ADMIN client posts `{ name: 'hardware_tools', displayName: 'Hardware Tools' }` to `POST /api/issue-categories`
- **THEN** the response is `400` with a validation error identifying `name`

#### Scenario: Valid kebab-case accepted by the API

- **WHEN** an authenticated ADMIN client posts `{ name: 'hardware-tools', displayName: 'Hardware Tools' }` to `POST /api/issue-categories` and no existing row collides
- **THEN** the response is `201` with the created row

#### Scenario: Add page shows inline format error

- **WHEN** the ADMIN user types `Hardware` into the `Name` field on the Add Category page
- **THEN** the page shows an inline error stating the value must be kebab-case and the `Save` button is disabled

#### Scenario: Add page suppresses duplicate check while format is invalid

- **WHEN** the ADMIN user types `Hardware` into the `Name` field on the Add Category page
- **THEN** no `GET /api/issue-categories/exists` request is issued for that value (the format gate runs first)

### Requirement: Get a single issue category

The API SHALL expose `GET /api/issue-categories/:id` that returns a single row by its primary key. The endpoint MUST require an authenticated session AND membership in the `ADMIN` Cognito group; non-`ADMIN` callers MUST receive `403`. On success the response MUST be `200` with body `{ id, name, displayName }`. If no row matches the supplied `id`, the response MUST be `404 Not Found`.

#### Scenario: Get an existing category

- **WHEN** an authenticated ADMIN client calls `GET /api/issue-categories/7` and a row with `id = 7` exists
- **THEN** the response is `200` with body `{ id: 7, name: <string>, displayName: <string> }`

#### Scenario: Get a non-existent category

- **WHEN** an authenticated ADMIN client calls `GET /api/issue-categories/9999` and no row with `id = 9999` exists
- **THEN** the response is `404`

#### Scenario: Get-by-id requires ADMIN role

- **WHEN** an authenticated client whose access token's `cognito:groups` does not include `ADMIN` calls `GET /api/issue-categories/7`
- **THEN** the response is `403`

### Requirement: Update an issue category's display name

The API SHALL expose `PATCH /api/issue-categories/:id` accepting a JSON body of shape `{ displayName: string }`. The body MUST NOT contain `name` — `name` is immutable post-creation; a request that includes `name` MUST be rejected with `400 Bad Request` by the global validation layer. The endpoint MUST require an authenticated session AND membership in the `ADMIN` Cognito group; non-`ADMIN` callers MUST receive `403`. On success the response MUST be `200` with the updated row including `id`, `name`, and the new `displayName`. If no row matches the supplied `id`, the response MUST be `404 Not Found`. If the supplied `displayName` collides with another row's `display_name`, the response MUST be `409 Conflict` with a body identifying `displayName` as the duplicate field.

#### Scenario: Successful update

- **WHEN** an authenticated ADMIN client posts `PATCH /api/issue-categories/7` with body `{ displayName: 'New Display' }` and no other row has `display_name = 'New Display'`
- **THEN** the response is `200` with the updated row, and subsequent `GET /api/issue-categories/7` returns the new `displayName`

#### Scenario: No-op update

- **WHEN** an authenticated ADMIN client posts `PATCH /api/issue-categories/7` with body `{ displayName: <the current displayName> }`
- **THEN** the response is `200` with the row unchanged

#### Scenario: Duplicate display name on update

- **WHEN** an authenticated ADMIN client posts `PATCH /api/issue-categories/7` with body `{ displayName: 'Existing' }` and another row already has `display_name = 'Existing'`
- **THEN** the response is `409` with a body identifying `displayName` as the duplicate field, and the row at id `7` is not modified

#### Scenario: Update with name in the body is rejected

- **WHEN** an authenticated ADMIN client posts `PATCH /api/issue-categories/7` with body `{ name: 'new-name', displayName: 'New' }`
- **THEN** the response is `400` because `name` is not a permitted field on this endpoint

#### Scenario: Update a non-existent category

- **WHEN** an authenticated ADMIN client posts `PATCH /api/issue-categories/9999` with body `{ displayName: 'Anything' }` and no row with `id = 9999` exists
- **THEN** the response is `404`

#### Scenario: Update requires ADMIN role

- **WHEN** an authenticated client whose access token's `cognito:groups` does not include `ADMIN` posts `PATCH /api/issue-categories/7` with body `{ displayName: 'New' }`
- **THEN** the response is `403` and no row is modified

### Requirement: Category Detail page

The web app SHALL provide a page at route `/settings/issue-category/:id` titled with the category's `name` that displays a read-only view of the row: `ID` rendered as `#<id>`, `Name`, and `Display Name`. The page MUST require the caller to be a member of the `ADMIN` Cognito group; non-`ADMIN` users who reach the route MUST see a `403` placeholder. The page header MUST render a borderless left-arrow back button to the left of the page title; clicking it MUST navigate to `/settings/issue-category` (the list). The page MUST provide an `Edit` button that navigates to `/settings/issue-category/:id/edit`. If the API returns `404` for the supplied `id`, the page MUST render a `Category not found` placeholder rather than a partial view.

The All Issue Categories list page MUST render each row's `Name` cell as a navigable link to `/settings/issue-category/:id`, so clicking a category in the list opens its Detail page.

#### Scenario: Detail page loads on mount

- **WHEN** an authenticated ADMIN user navigates to `/settings/issue-category/7` for an existing row
- **THEN** the page issues `GET /api/issue-categories/7` and renders `#7`, the row's `name`, and the row's `displayName` in a read-only layout, with the page title equal to the row's `name`

#### Scenario: Detail page Edit button navigates

- **WHEN** an authenticated ADMIN user clicks the `Edit` button on `/settings/issue-category/7`
- **THEN** the SPA navigates to `/settings/issue-category/7/edit`

#### Scenario: Detail page handles missing row

- **WHEN** an authenticated ADMIN user navigates to `/settings/issue-category/9999` and the API returns `404`
- **THEN** the page renders a `Category not found` placeholder with a way back to the list

#### Scenario: Detail page restricted to ADMIN

- **WHEN** an authenticated user whose `cognito:groups` does not include `ADMIN` navigates to `/settings/issue-category/7`
- **THEN** the page renders a `403` placeholder; no `GET /api/issue-categories/7` request is issued

#### Scenario: List row name links to Detail page

- **WHEN** an authenticated ADMIN user clicks the `Name` cell of a row on the list page
- **THEN** the SPA navigates to `/settings/issue-category/<that row's id>` (without toggling the row's checkbox)

#### Scenario: Back button returns to the list

- **WHEN** an authenticated ADMIN user is on `/settings/issue-category/7` and clicks the back button to the left of the page title
- **THEN** the SPA navigates to `/settings/issue-category`

### Requirement: Edit Category page

The web app SHALL provide a page at route `/settings/issue-category/:id/edit` titled `Edit Category` that allows an ADMIN to update only the row's `displayName`. The page MUST require the caller to be a member of the `ADMIN` Cognito group; non-`ADMIN` users who reach the route MUST see a `403` placeholder. The page header MUST render a borderless left-arrow back button to the left of the page title; clicking it MUST navigate to `/settings/issue-category/:id` (the Detail page for the same id), NOT to the list. The form MUST render three fields: `ID` (displayed as `#<id>`, read-only), `Name` (displayed as the existing value, read-only — never editable), and `Display Name` (a controlled text input prefilled with the existing value). The page MUST debounce the `Display Name` input and call `GET /api/issue-categories/exists?displayName=…` to surface an inline duplicate error; the check MUST NOT flag the row's own current `displayName` as a duplicate. The `Save` button MUST be disabled while the field is empty, while it has a duplicate error, while a check is pending, or while the PATCH is in flight. Clicking `Save` MUST call `PATCH /api/issue-categories/:id` with `{ displayName }`. On `200` the page MUST navigate back to `/settings/issue-category/:id`. On `409` the page MUST render the inline duplicate error and remain on the page. On `404` the page MUST navigate back to `/settings/issue-category`. Clicking `Cancel` MUST navigate to `/settings/issue-category/:id` without submitting.

#### Scenario: Edit page initializes with existing values

- **WHEN** an authenticated ADMIN user navigates to `/settings/issue-category/7/edit` for an existing row
- **THEN** the page issues `GET /api/issue-categories/7`, the `ID` and `Name` fields render the existing values as read-only, and the `Display Name` input is prefilled with the existing `displayName`

#### Scenario: Name field is read-only on the Edit page

- **WHEN** an authenticated ADMIN user opens `/settings/issue-category/7/edit`
- **THEN** the `Name` field cannot be focused for editing and any submitted change must not be sent to the API

#### Scenario: Successful display-name update

- **WHEN** the ADMIN user changes `Display Name` to a value not used by any other row and clicks `Save`
- **THEN** the page calls `PATCH /api/issue-categories/7` with `{ displayName: <new value> }` and on success navigates to `/settings/issue-category/7`

#### Scenario: Unchanged display name does not flag a duplicate

- **WHEN** the ADMIN user opens the Edit page and leaves `Display Name` equal to its initial value
- **THEN** the page does not surface an `Already exists` error for that value and `Save` is not disabled solely because of duplicate checking

#### Scenario: Inline duplicate error on Edit page

- **WHEN** the ADMIN user changes `Display Name` to a value that already exists on another row
- **THEN** after the debounce expires the page shows an inline `Already exists` error and disables `Save`

#### Scenario: Server-side duplicate caught after race on Edit page

- **WHEN** the pre-check returns `false` but a concurrent client claims the same `displayName` before the ADMIN user clicks `Save`
- **THEN** the `PATCH` returns `409`, the page renders the same inline `Already exists` error, and no navigation occurs

#### Scenario: Cancel returns to Detail page

- **WHEN** the ADMIN user edits the `Display Name` value and clicks `Cancel`
- **THEN** the page navigates to `/settings/issue-category/7` and no `PATCH` is issued

#### Scenario: Back button returns to the Detail page (not the list)

- **WHEN** an authenticated ADMIN user is on `/settings/issue-category/7/edit` and clicks the back button to the left of the page title
- **THEN** the SPA navigates to `/settings/issue-category/7` (the Detail page for the same id) and no `PATCH` is issued

#### Scenario: Edit page handles missing row

- **WHEN** an authenticated ADMIN user navigates to `/settings/issue-category/9999/edit` and the API returns `404` on the initial load
- **THEN** the page renders a `Category not found` placeholder; clicking `Save` is not possible

#### Scenario: Edit page restricted to ADMIN

- **WHEN** an authenticated user whose `cognito:groups` does not include `ADMIN` navigates to `/settings/issue-category/7/edit`
- **THEN** the page renders a `403` placeholder; no `GET /api/issue-categories/7` request is issued
