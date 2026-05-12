## MODIFIED Requirements

### Requirement: Topbar layout and contents

The web app SHALL render a single top-of-viewport bar that is 48 pixels tall, spans the full viewport width, and remains visible regardless of sidebar state. From left to right the topbar MUST contain:

1. A menu (hamburger) button — see the "Responsive hamburger button" requirement for visibility rules.
2. The system title text `Work Order System`.
3. A theme switch control aligned to the right.
4. The authenticated user's display name, aligned to the right. The display name MUST be derived from the active OIDC session's profile claims, preferring `name`, falling back to `cognito:username`, then to `email`.
5. A circular user avatar button aligned to the right, whose label is the initials derived from the same display name (first letter of each of the first two whitespace-separated tokens, uppercased). Clicking the avatar opens a dropdown menu.

#### Scenario: Topbar renders with all elements

- **WHEN** the app loads at any viewport width
- **THEN** the topbar is visible at the top of the viewport with the system title, theme switch, username, and avatar present

#### Scenario: Topbar height is 48 pixels

- **WHEN** the topbar renders
- **THEN** its computed height is exactly 48 pixels (excluding any safe-area inset padding)

#### Scenario: Username reflects the authenticated user

- **WHEN** an authenticated user with `profile.name === 'Alice Lee'` views the app
- **THEN** the topbar shows the text `Alice Lee` and the avatar displays the initials `AL`

#### Scenario: Username falls back when name claim is absent

- **WHEN** the OIDC `profile.name` claim is missing but `profile['cognito:username']` is `alice123`
- **THEN** the topbar shows `alice123` and the avatar shows initials derived from that value

### Requirement: Avatar dropdown menu

The user avatar button in the topbar SHALL open a dropdown menu when clicked. The dropdown MUST contain at least the items `Profile` and `Logout`. Clicking outside the dropdown or clicking the avatar again MUST close it. The `Profile` item MUST navigate the SPA to the `/profile` route. The `Logout` item MUST trigger Cognito sign-out — clearing the local OIDC session AND redirecting the browser to Cognito's `/logout` endpoint constructed from the configured authority and client ID — so that the hosted UI session is also invalidated.

#### Scenario: Open avatar dropdown

- **WHEN** the user clicks the avatar button
- **THEN** a dropdown menu becomes visible containing `Profile` and `Logout` items

#### Scenario: Close avatar dropdown by clicking outside

- **WHEN** the dropdown is open and the user clicks anywhere outside the dropdown
- **THEN** the dropdown closes

#### Scenario: Profile menu navigates to /profile

- **WHEN** the user clicks `Profile` in the avatar dropdown
- **THEN** the dropdown closes and the SPA navigates to `/profile`

#### Scenario: Logout menu invalidates the session

- **WHEN** the user clicks `Logout` in the avatar dropdown
- **THEN** the local OIDC user store is cleared and the browser is navigated to the Cognito `/logout` URL parameterized by the configured authority and client ID
