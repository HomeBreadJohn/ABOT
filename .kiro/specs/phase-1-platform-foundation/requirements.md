# Requirements Document

## Introduction

This document defines the requirements for Phase 1 of the platform foundation owned by Person 1. The phase strengthens the existing Next.js App Router and Supabase foundation, audits authentication and ownership boundaries, adds profile language preferences, establishes reusable UI and presentation foundations, improves accessibility and responsive behavior, and makes validation repeatable.

Phase 1 is intentionally independent of Person 2's unresolved analysis JSON schema. The phase may render primitive status, severity, and certainty values through presentation components and may use existing mock data for previews, but it shall not define, extend, or revise the analysis payload contract.

The requirements use `product.md` as the product source of truth, especially sections 7, 8, 9, 10, 12, 16, 17, 18, and 19. The existing repository baseline includes authentication routes and services, a protected dashboard layout, a `profiles` table with `preferred_language`, Row Level Security policies, shared UI primitives, proposed shared contracts, analysis mocks, and npm validation scripts.

### Scope Boundary

Phase 1 includes platform foundation work only. Document upload, document vault behavior, processing screens, report sections, evidence navigation, OCR correction, follow-up chat, reminders, sharing, Lumen integration, and production analysis orchestration remain later phases. Phase 1 may expose stable foundation interfaces that later phases can consume.

## Glossary

- **Platform_Foundation**: The Person 1-owned authentication, profile preference, shared UI, accessibility, responsive layout, validation, and mock boundary work covered by this document.
- **Person_1**: The owner responsible for the platform and UI work described in `product.md` section 17.
- **Person_2**: The owner responsible for OCR, analysis, evidence, correction, and AI document intelligence work described in `product.md` section 17.
- **Auth_Provider**: Supabase Auth, which creates accounts and manages authenticated sessions for the application.
- **Authenticated_User**: A user with a valid Auth_Provider session recognized by the server.
- **Protected_Route**: An application route that requires an Authenticated_User session before the route can render private workspace content.
- **Profile**: The application-owned row associated with one Auth_Provider user and containing account preferences such as preferred language.
- **Preferred_Language**: The user-selected explanation language, limited to English, Filipino, or Taglish. English is the default Filipino-friendly English setting.
- **Row_Level_Security (RLS)**: Database policies that allow a user to read or change only rows authorized for the authenticated user.
- **Shared_UI_Primitive**: A reusable visual or interactive component such as a button, input, label, card, badge, separator, form message, or status indicator.
- **Presentation_Value**: A status, severity, certainty, or similar domain value supplied by an existing shared contract or a future adapter.
- **Mock_Data**: Local deterministic sample data used to preview platform interfaces without calling Lumen or persisting real document analysis.
- **Analysis_Contract**: The shared structured analysis payload owned jointly by Person 1 and Person 2. The current repository marks the contract as proposed and unresolved.
- **Validation_Setup**: The repeatable type-checking, linting, formatting, unit-test, and production-build checks used by the repository.
- **Security_Audit**: A recorded review of authentication, session, ownership, RLS, secret handling, and protected-route behavior against this document.

## Requirements

### Requirement 1: Authentication and protected-session foundation

**User Story:** As a workspace user, I want authentication and protected routes to behave predictably, so that private document work remains available only inside my account.

#### Acceptance Criteria

1. WHEN an unauthenticated request reaches a Protected_Route, THE Platform_Foundation SHALL redirect the request to the login route and SHALL not render private workspace content.
2. WHEN an Authenticated_User requests a Protected_Route, THE Platform_Foundation SHALL render the shared authenticated workspace shell and the requested route content.
3. WHEN an authentication request fails, THE Authentication_Interface SHALL display an error indicating that authentication failed, provide a retry or correction action within the authentication flow, and SHALL not expose credentials, server secrets, or provider tokens.
4. WHEN an Authenticated_User signs out successfully, THE Auth_Provider SHALL clear the application session and THE Platform_Foundation SHALL route the user to the login route.
5. THE Security_Audit SHALL record a pass/fail verification result for registration, sign-in, sign-out, session refresh, protected-route enforcement, expired-session behavior, and authentication-failure handling.
6. IF an authenticated session expires while an Authenticated_User requests a Protected_Route, THEN THE Platform_Foundation SHALL prevent private workspace content from rendering, clear the application session, and redirect the request to the login route.

### Requirement 2: Profile and preferred-language settings

**User Story:** As an Authenticated_User, I want to choose English, Filipino, or Taglish for explanations, so that future document guidance matches my communication preference.

#### Acceptance Criteria

1. THE Profile_Settings_Interface SHALL present exactly three selectable Preferred_Language choices: English, Filipino, and Taglish.
2. WHEN a new Profile is created without a saved Preferred_Language, THE Profile_Settings_Interface SHALL select and display English as the default Preferred_Language.
3. WHEN an Authenticated_User saves one of the three supported Preferred_Language choices, THE Profile_Service SHALL persist that value to the Profile associated with the current authenticated user identifier.
4. WHEN an Authenticated_User opens the Profile_Settings_Interface after a successful preference save, THE Profile_Settings_Interface SHALL display the persisted Preferred_Language for the current authenticated user identifier.
5. IF a request contains a Preferred_Language value other than English, Filipino, or Taglish, THEN THE Profile_Service SHALL reject the request and preserve the previously persisted Preferred_Language.
6. IF an unauthenticated request or a request associated with a different user identifier attempts to read or change a Profile, THEN THE Profile_Service SHALL deny the operation and leave the Profile unchanged.
7. WHEN an Auth_Provider account is created, THE Profile_Service SHALL ensure that exactly one Profile is associated with the new Auth_Provider user identifier.

### Requirement 3: Shared UI primitives and domain-value presentation

**User Story:** As a platform developer, I want reusable UI primitives and consistent value presentation, so that later document workflows can use the same interaction and communication patterns.

#### Acceptance Criteria

1. THE Platform_Foundation SHALL provide Shared_UI_Primitives for buttons, text inputs, labels, cards, badges, separators, form feedback, loading states, and empty states, with each primitive usable independently by later interfaces.
2. WHEN a Shared_UI_Primitive receives a Presentation_Value, THE Presentation_Component SHALL render the value's text label and at least one visual cue that remains distinguishable without relying on color.
3. WHEN a Presentation_Value represents status, severity, or certainty, THE Presentation_Component SHALL render the value category separately from the value label so that a tester can identify both the category and the label from the rendered interface.
4. IF a Presentation_Component receives a Presentation_Value that it does not support, THEN THE Presentation_Component SHALL render an unknown-value label and neutral visual treatment, SHALL NOT render a status, severity, or certainty category for that value, and SHALL preserve the surrounding interface state.
5. WHILE the Analysis_Contract remains unresolved, THE Platform_Foundation SHALL consume Presentation_Values only through primitive props or adapters and SHALL NOT add fields, change meanings, or change validation rules in the Analysis_Contract.
6. THE Platform_Foundation SHALL allow report, processing, evidence, correction, chat, reminder, and sharing interfaces to compose the same Shared_UI_Primitives for their common interaction and presentation needs without requiring a separate primitive for each interface or value category.

### Requirement 4: Accessibility and responsive interaction groundwork

**User Story:** As a user with different devices or access needs, I want the foundation to remain understandable and operable, so that I can use the workspace on a phone, tablet, desktop, keyboard, or assistive technology.

#### Acceptance Criteria

1. THE Platform_Foundation SHALL expose exactly one semantic main landmark, at least one page heading that identifies the page purpose, and an accessible label for each navigation landmark on every public and authenticated page.
2. WHEN a user navigates with a keyboard, THE Platform_Foundation SHALL make every interactive control reachable in an order that follows the page’s reading and interaction sequence and SHALL display a visible focus indicator for the focused control.
3. WHEN asynchronous content changes a loading, success, or error message, THE Platform_Foundation SHALL expose loading and success messages through a status announcement and error messages through an alert announcement, while preserving the user’s current focus.
4. WHEN the viewport width is between 320 CSS pixels and 1440 CSS pixels inclusive, THE Platform_Foundation SHALL keep primary navigation, authentication forms, settings controls, and foundation previews visible and operable without requiring horizontal scrolling.
5. THE Platform_Foundation SHALL provide text and interactive-state contrast that meets WCAG 2.2 AA thresholds: at least 4.5:1 for normal text, at least 3:1 for large text, and at least 3:1 for essential non-text controls.
6. WHEN a control has an icon-only presentation, THE Platform_Foundation SHALL provide an accessible name that identifies the control’s action.

### Requirement 5: Validation and automated test setup

**User Story:** As a development team, I want repeatable validation checks, so that Person 1 can change the foundation safely while Person 2 works on intelligence features in parallel.

#### Acceptance Criteria

1. THE Validation_Setup SHALL provide one non-interactive, single-run repository command for each of strict TypeScript checking, linting, formatting verification, unit tests, and a production build.
2. WHEN the repository is checked using the repository-designated supported Node.js version and placeholder values for every required environment variable, THE Validation_Setup SHALL complete each of the five validation commands with exit code zero.
3. THE Automated_Test_Suite SHALL include passing tests for every supported Preferred_Language value, rejection of at least one unsupported preference value, access denial for a profile owned by another user, denial of protected-route access without a session, and the defined fallback behavior of each affected Presentation_Component.
4. WHEN any validation command or automated test fails, THE Validation_Setup SHALL identify the failed check in its output and SHALL return a nonzero exit code to the invoking automation.
5. THE Automated_Test_Suite SHALL complete without making a network request to Lumen and without requiring a real document, real analysis payload, or production user account.
6. THE Platform_Foundation SHALL retain and execute all existing repository contract tests, and SHALL preserve every assertion covering ownership, evidence, lifecycle, status, severity, certainty, or schema integrity.

### Requirement 6: Mock-only boundary and analysis-contract independence

**User Story:** As Person_1, I want to develop and validate the platform before Person_2 finalizes the analysis contract, so that UI foundation work can proceed without creating contract conflicts.

#### Acceptance Criteria

1. WHERE the Analysis_Contract is unresolved, THE Platform_Foundation SHALL use only Mock_Data or primitive foundation view data for previews and SHALL not require a live Lumen request.
2. WHERE a foundation preview displays analysis-like content, THE Platform_Foundation SHALL identify the content as mock or sample content and SHALL not represent it as a completed user analysis.
3. WHILE Phase 1 is active, THE Platform_Foundation SHALL not create, update, or delete real document analysis, OCR, evidence, correction, conversation, reminder, or sharing records.
4. THE Platform_Foundation SHALL keep provider credentials, provider endpoints, and provider response parsing outside client-side platform code.
5. WHEN Person_2 changes the approved Analysis_Contract after Phase 1, THE authentication, profile, accessibility, responsive, validation, and Shared_UI_Primitive requirements SHALL remain independently testable using Mock_Data or primitive foundation view data, without requiring a redesign of those foundations or a live Analysis_Contract.

### Requirement 7: Ownership, secret handling, and foundation security

**User Story:** As a document owner, I want the platform to enforce account boundaries from the beginning, so that later document features inherit a safe foundation.

#### Acceptance Criteria

1. THE Security_Audit SHALL verify that every Profile read and write operation derives the owner from the authenticated session identifier and does not use a client-supplied owner identifier.
2. THE Security_Audit SHALL verify that RLS is enabled for Profile data and that Profile read and write policies allow access only to the owning Authenticated_User.
3. THE Security_Audit SHALL verify that document, analysis, task, share, processing-job, and private-storage policies continue to restrict access to the owner or an explicitly shared user while Phase 1 changes are applied.
4. IF client input includes an owner identifier that differs from the authenticated session identifier, THEN THE Platform_Foundation SHALL ignore the client-supplied identifier for authorization and SHALL deny access to any data not owned by the authenticated user.
5. THE Platform_Foundation SHALL keep service-role credentials and future Lumen credentials server-only and SHALL exclude their secret values from user-facing errors, rendered markup, and application logs.
6. THE Security_Audit SHALL record the repository files, database policies, and automated checks used to verify the ownership and secret-handling criteria.

## Out of Scope

The following work is explicitly deferred to later phases: document upload and file validation flows, document-vault behavior, OCR submission and polling, processing-stage UI, category classification, adaptive report sections, evidence navigation, selective OCR correction, document-grounded chat, reminders, cross-document analysis, family sharing, Lumen client implementation, and any redesign or versioning of the Analysis_Contract.

## Product Alignment Notes

- Preferred language choices and Filipino-friendly English default align with `product.md` section 7.
- Protected workspace behavior, responsive groundwork, and understandable status messaging align with `product.md` section 9.
- Server-only provider credentials, ownership checks, RLS, and private storage boundaries align with `product.md` section 16.
- Shared contracts and mock-only development boundaries align with `product.md` section 17.
- Repeatable validation and security checks support the MVP acceptance criteria in `product.md` section 19 without claiming that later document-intelligence capabilities are complete.
