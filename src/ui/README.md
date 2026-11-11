# Spartan UI

The Helm sources in this directory are copied from the official `@spartan-ng/cli` 1.9.0 Nova templates. Nova style tokens were expanded into their corresponding utilities, as Spartan's generator does. The MIT license is included in `LICENSE`.

`@spartan-ng/brain` supplies the accessible behavior. The application uses these source components directly: sidebars, sheets, tooltips, avatars, cards, tables, fields, buttons, inputs, comboboxes, date pickers, calendars, labels, selects, radio groups, checkboxes, badges, tabs, popovers, dropdown menus, dialogs, alert dialogs, alerts, empty states, separators, skeletons and Sonner notifications.

There are no application-specific component wrappers or CSS overrides. Dialogs use Spartan's built-in close, focus, dismissal and transition behavior. Alerts and notifications use the standard components. Layout is expressed with Tailwind utilities in the page templates.

The default neutral theme and Tailwind v4 setup live in `src/theme.css`. DM Sans is bundled locally. The previous custom CSS, particle components, GSAP directives and dialog wrapper have been removed.

Keep copied Helm sources compatible with the installed Brain version when updating. Run `npm run build` and `npm run test:ui` after changes.
