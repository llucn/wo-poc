## ADDED Requirements

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

The web app SHALL provide a page at route `/settings/issue-category/new` titled `Add Category` containing two text inputs labelled `Name` and `Display Name`, a primary `Save` button, and a secondary `Cancel` button. The page MUST require the caller to be a member of the `ADMIN` Cognito group; non-`ADMIN` users who reach the route MUST see a `403` placeholder rather than the form. While the user types, the page MUST debounce each input and call `GET /api/issue-categories/exists` to surface an inline error if the value is already taken. The `Save` button MUST be disabled while either field is empty, while either field has a duplicate-name error, or while a duplicate check is pending. Clicking `Save` MUST `POST /api/issue-categories`; on success the page MUST navigate back to `/settings/issue-category`. Clicking `Cancel` MUST navigate to `/settings/issue-category` without submitting.

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

#### Scenario: Server-side duplicate caught after race

- **WHEN** the pre-check returns `{ name: false }` but a concurrent client creates a row with that name before the ADMIN user clicks `Save`
- **THEN** the `POST` returns `409`, the page renders the same inline duplicate error on the corresponding field, and no navigation occurs

#### Scenario: Non-ADMIN sees a 403 placeholder

- **WHEN** an authenticated user whose `cognito:groups` does not include `ADMIN` navigates to `/settings/issue-category/new`
- **THEN** the page renders a `403` placeholder identifying the route as restricted; the form does not render
