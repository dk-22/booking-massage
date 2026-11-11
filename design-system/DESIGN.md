# Pause — Spartan interface

The application uses Spartan's Nova components and standard neutral theme throughout. The earlier custom visual system has been discarded.

## Page structure

- Employee booking: a card for campaign and date selection alongside a standard time table. Selecting Book opens a Spartan dialog with appointment details and employee fields. Confirmation appears after the booking transaction succeeds.
- Admin sign-in: a standard card and email field; Enter submits the form.
- Administration: Spartan tabs for campaigns and business units. Campaigns appear in a searchable table with status badges and a dropdown action menu.
- Campaign editor: standard field groups, date table, radio group for visibility, date dialog, and alert-dialog confirmations.
- Bookings: filter fields and a table for each date. A standard dialog edits employee details or moves the reservation.
- Notifications: Spartan Sonner, top-right, with one visible notification and a close button.

## Components and behavior

No bespoke stylesheets, particle effects, animation directives, custom dialog wrappers, or custom notification implementations remain. Semantic HTML and Tailwind utilities provide layout around the Spartan components. Reduced-motion preferences are respected. Forms expose labels and validation errors, and overlays use Spartan's focus management.

Supabase transactions, authorization, realtime subscriptions, expiry refresh, audit history, search and pagination remain intact. UI work does not apply database migrations or change hosted data.

## Verification

The Playwright suite mocks backend responses and blocks realtime connections to the hosted project. It checks booking validation and confirmation, campaign/date selection, keyboard focus restoration, admin editing, visibility and deletion confirmations, settings, email-form submission, and mobile overflow. This does not verify live SMTP delivery or hosted database behavior.
