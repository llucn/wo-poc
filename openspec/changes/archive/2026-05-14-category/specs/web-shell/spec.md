## ADDED Requirements

### Requirement: Settings menu contains an Issue Category entry visible only to ADMIN

The sidebar's `Settings` group SHALL include an `Issue Category` child link routed to `/settings/issue-category`. The link is a real (non-demo) feature link and MUST coexist with the existing demo children under `Settings`. The link MUST be visible only to users whose access-token `cognito:groups` claim includes `ADMIN`; non-`ADMIN` users MUST NOT see the link in the sidebar.

#### Scenario: ADMIN sees Issue Category under Settings

- **WHEN** an ADMIN user expands the `Settings` group in the sidebar
- **THEN** an `Issue Category` child link is visible and clicking it navigates to `/settings/issue-category`

#### Scenario: Issue Category child is highlighted when active

- **WHEN** an ADMIN user is on a route matching `/settings/issue-category` (the list page or the `/new` add page)
- **THEN** the `Issue Category` child item in the sidebar renders with the active visual treatment

#### Scenario: Non-ADMIN does not see the Issue Category entry

- **WHEN** an authenticated user whose `cognito:groups` does not include `ADMIN` expands the `Settings` group
- **THEN** the `Issue Category` child link is not rendered in the sidebar
