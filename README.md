# Pause — Angular, Spartan UI and Supabase

## Run locally

Use a Node version supported by Angular 21, such as the project's current Node 20.20.2 or Node 22.22.3+.

```sh
npm install
npm start
```

Open http://localhost:4200. `npm start` uses the development configuration with dependency prebundling. `npm run build` creates an optimized production build in `dist/booking-massage/browser`. Use the project's scripts instead of a global Angular CLI.

## Interface

All active screens use Spartan's Nova components and default neutral theme. The original custom UI has been removed, including particle effects, GSAP, legacy stylesheets, custom cards, dialog wrappers and notification styling.

- `src/booking-page.html`: campaign/date selection, time table, booking form and confirmation.
- `src/admin-page.html`: sign-in, campaign table/editor, settings, history and confirmations.
- `src/bookings-page.html`: booking filters, date-grouped tables and booking editor.
- `src/ui`: source-owned Helm components from Spartan 1.9.0; see its README and MIT license.
- `src/theme.css`: Tailwind v4 setup and standard semantic theme tokens. Fonts are bundled locally.

Notifications use Spartan Sonner at the top right. Dialogs and alert dialogs use Spartan's own focus, keyboard and transition behavior. There are no application-specific component CSS overrides.

## Browser checks

```sh
npx playwright install chromium
npm run test:ui
```

The suite starts a development server on port 4201 if needed. It uses mocked Supabase responses and blocks hosted realtime connections; it does not create live bookings or send email. Tests cover employee booking, duplicate warnings, campaign/date selection, keyboard focus, mobile layouts, admin edits, confirmations, business units and email-form submission.

## Supabase setup

1. Create a Supabase project and keep its database password secure.
2. Apply `supabase/migrations/001_initial.sql` through `015_cancel_booking.sql` in numeric order in SQL Editor. For an existing project, apply only migrations not already applied. The initial migration creates a new database schema; it does not import Firebase records.
3. Copy the project URL and public publishable key (or legacy anon key) into `src/supabase-config.ts`. Never put a service-role key or database password in the frontend.
4. Under Authentication → URL Configuration, allow `http://localhost:4200/bk-admin-codex/login` and your deployed sign-in URL. Enable email authentication and configure SMTP for actual delivery. Keep the magic-link template's `{{ .ConfirmationURL }}`.
5. Add an approved administrator after the migrations:

```sql
insert into public.admin_emails(email, full_name, enabled)
values ('your.actual.email@example.com', 'Your Full Name', true)
on conflict(email) do update
set full_name=excluded.full_name, enabled=true;
```

6. Open Admin portal, request a sign-in link and open it. A verified account must match an enabled admin entry; creating an Auth account does not grant admin access.
7. Configure business units, create a campaign with future dates, and publish it.

To revoke access, set `admin_emails.enabled` to false. Every protected read and operation checks current admin authorization in the database.

Apply `013_admin_profile.sql` to display names from `admin_emails.full_name` in the navbar account menu. Until it is applied, the menu falls back to the sign-in profile or email initials.

## Database updates

- 001: tables, policies, booking transactions, admin functions and realtime.
- 002–006: campaign editing/deletion, scheduled-date replacement, idempotent saves and publishing.
- 007–008: business-unit changes and configured dropdown validation.
- 009: admin booking editing and rescheduling with optimistic concurrency.
- 010: admin full names, last-save details and audit history.
- 011: safe business-unit replacement.
- 012: indexes, paginated booking reads and scoped campaign metadata.
- 013: the signed-in administrator’s name and email for the account menu.
- 014: paginated administrator directory, audited administrator creation/name edits and activation changes.
- 015: audited booking cancellation with administrator identity, cancellation time and transactional capacity release.

Campaign and date deletion are protected when booking history exists. Date edits/removals remain staged until Save campaign. Exact save retries do not append duplicate dates. Existing duplicate dates are not removed automatically.

## Architecture

Angular calls protected Postgres RPCs. `create_booking` validates the campaign, session, expiry and business unit, serializes retries and employee eligibility with advisory locks, and locks the slot before consuming capacity. It commits the booking and public names together. A partial unique index enforces one confirmed booking per campaign and normalized employee code. Exact retries return the original reference.

Admin RPCs check the authenticated account's verified email against `admin_emails`. Employee codes and business units remain private. Browser table writes are revoked. Realtime refreshes availability; database transactions protect correctness. Campaign/booking reads use scoped subscriptions and pagination; availability also refreshes as time slots expire.

## Deployment and database verification

Build with `npm run build`. Host `dist/booking-massage/browser` on a static host that serves `index.html` for `/bk-admin-codex` and `/bk-admin-codex/login`. Apply migrations separately in Supabase.

`supabase/tests/booking.py` and the SQL fixtures validate booking concurrency, idempotency, authorization, editing, history and loading behavior. Run these only against a disposable migrated PostgreSQL database with the required Supabase auth roles/functions. Do not run fixtures against production.

Browser mocks and a local build do not validate live SMTP, hosted Realtime or production database policies. Cancellation, reminders and production abuse protection are separate features.


The Spartan sidebar holds Pause branding at the top and the account dropdown at the bottom, replacing the signed-in admin navbar. Its content toggle collapses it to icons on desktop. The fixed sidebar provides Campaigns, Bookings, Business units and Administrators. On mobile it opens as a Sheet. Apply migration 014 to enable administrator management. All active administrators share management permissions. Email addresses stay unchanged when editing an existing account; deactivate the old account and add the corrected address if necessary. Self-deactivation is blocked on the server. New accounts use the existing passwordless sign-in flow; adding an administrator does not send an email.

Administrator changes are recorded in audit logs and use update timestamps to reject stale edits. `supabase/tests/admin-management.sql` exercises creation, edits, activation, self-deactivation protection and unauthorized access in a disposable database.


Administrators can cancel a confirmed booking from its table row after confirming an Alert Dialog. Apply migration 015 first. Cancelled rows stay visible with the administrator’s name and Mauritius timestamp; their edit/cancel actions are removed. Cancellation releases capacity and removes only cancelled attendees from public slot names. The employee can make a new booking with a new request reference. Duplicate cancellations do not release capacity twice or change the original cancellation attribution. `supabase/tests/cancel-booking.sql` covers cancellation, stale edits, retries, rebooking and permission checks.


The employee booking screen uses three numbered sections on the same page: choose a campaign (Spartan Select), choose a date (Radio Group), then select a time (Table and Button). Multiple campaigns require an explicit choice; a lone campaign or date is selected automatically. All form dropdowns use Spartan Select, including filters, business units, booking destinations and time hours/minutes. Action menus continue to use Dropdown Menu. Empty states explain the next action before any times are shown. Skeletons cover only fetched values while headings remain visible. Selecting a time opens the existing confirmation form without extra Next/Back steps.

Admin booking status filters: apply `supabase/migrations/016_booking_status_filter.sql` in the Supabase SQL Editor. This adds an admin-only paginated query for Confirmed and Cancelled bookings; existing all-status queries remain compatible.

Pagination: apply `supabase/migrations/017_ten_rows_per_page.sql` for 10 rows per page in campaigns, bookings, and administrators. This updates both booking query variants and the administrator directory without removing data.


### Admin-only sign-in requests

1. Run migration `018_admin_sign_in_requests.sql` in Supabase SQL Editor.
2. Set the Edge Function secret `ADMIN_SIGN_IN_ORIGINS` to a comma-separated list of exact app origins, e.g. `http://localhost:4200,https://your-app.example`. No trailing slash. The redirect is fixed to `/bk-admin-codex/login` on the requesting allowed origin; also allow these redirects in Auth URL Configuration.
3. Deploy with `npx supabase functions deploy request-admin-sign-in --no-verify-jwt`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Never put the service role key in Angular.
4. Keep your existing Auth SMTP configuration. The function checks enabled `admin_emails` records before calling Supabase Auth; new authorized accounts can still be created on their first sign-in. Requests share a database-backed 60-second cooldown per enabled email.

The UI intentionally returns the same message for enabled, inactive, unknown and rate-limited addresses. Provider/database failures are logged without exposing addresses or tokens; inspect Edge Function and Auth logs if delivery fails. The browser has no fallback to direct OTP requests. An undeployed function produces a request error.

Scope: this gates requests through the app. Supabase's public `/auth/v1/otp` endpoint still exists and can be called outside the app. To enforce the recipient allowlist for every Auth email, configure a Supabase Send Email Hook with the same enabled-admin check and a mail provider; that hook replaces built-in SMTP delivery. A client-side check or Before User Created hook alone cannot prevent emails to previously created non-admin Auth users. Existing `is_admin()` checks still reject unauthorized sessions.

## Publish on GitHub Pages

The workflow in `.github/workflows/pages.yml` builds and publishes pushes to `main`.
In the GitHub repository, select **Settings → Pages → Source → GitHub Actions**.

- Employee website: https://dk-22.github.io/booking-massage/
- Administration: https://dk-22.github.io/booking-massage/bk-admin-codex/
- Admin sign-in callback: https://dk-22.github.io/booking-massage/bk-admin-codex/login/

The Pages build uses `npm run build:pages`. It sets the Angular base path to
`/booking-massage/` and creates admin entry documents so direct links work.

Before using hosted admin sign-in:

1. In Supabase **Authentication → URL Configuration**, set Site URL to
   `https://dk-22.github.io/booking-massage/` and add both
   `https://dk-22.github.io/booking-massage/bk-admin-codex/login` and
   `https://dk-22.github.io/booking-massage/bk-admin-codex/login/` to Redirect URLs.
   Keep `http://localhost:4200/bk-admin-codex/login` for local development.
2. In **Edge Functions → Secrets**, set `ADMIN_SIGN_IN_ORIGINS` to
   `http://localhost:4200,https://dk-22.github.io`.
3. Set `ADMIN_SIGN_IN_REDIRECT_URLS` to
   `https://dk-22.github.io/booking-massage/bk-admin-codex/login`.
4. Deploy the updated sign-in function:

   ```sh
   npx supabase functions deploy request-admin-sign-in --no-verify-jwt
   ```

Only public Supabase configuration belongs in the frontend. SMTP passwords,
service-role keys and Edge Function secrets stay in Supabase. The Git ignore
rules exclude local settings, environment files, dependencies and generated previews.
