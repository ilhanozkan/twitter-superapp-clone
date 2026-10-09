## Summary

<!-- What changes and why. Link the issue if there is one. -->

## Screenshots

<!-- UI changes: light and dark, at phone (390px) and desktop (1280px) widths. Before / after when something existing changes. -->

## Test plan

- [ ] `npm run lint && npm run format:check && npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build && npm run test:e2e` (all three Playwright projects: `chromium`, `sarah`, `readonly`, with axe in both themes on new pages and dialogs)
- [ ] Studio changes: `cd sanity && npm run typecheck && npx sanity schema validate && npm run build`
- [ ] SuperApp features: `docs/api/<feature>.md` and `docs/features/<feature>.md` updated

## Manual keyboard and screen-reader check

<!--
Required for messages, orders, rides and stories (widgets axe can't judge);
recommended for any new interactive UI. Delete the rows that don't apply.
-->

Screen reader and browser: <!-- e.g. VoiceOver + Safari (macOS), NVDA + Firefox (Windows) -->

- [ ] **Keyboard only:** every new control is reachable with Tab in reading order, shows a visible focus ring in both themes, and works with Enter/Space. Nothing traps focus except an open dialog.
- [ ] **Dialogs and sheets:** opening moves focus inside and the title is announced; Esc closes; focus returns to the control that opened it. Errors use `role="alert"` and are tied to their field (`aria-describedby`).
- [ ] **Money (WCAG 3.3.4):** before credits move, a review step shows the payee, amount, fee and available-after, and focus lands on a Confirm button that repeats the amount and payee. Amounts are read as text with their direction ("received 12.50 credits"), never by colour alone.
- [ ] **Combobox:** arrow keys move the active option (`aria-activedescendant`), the number of results is announced, Enter picks, Esc closes.
- [ ] **Live updates:** order, ride, chat and activity changes announce their **status changes** once, politely; countdowns are never announced; incoming chat is batched (at most one announcement every 5 s) in a `role="log"`; polling never moves focus.
- [ ] **Progress steps:** an ordered list with `aria-current="step"` on the current step, and the times as text.
- [ ] **Story viewer:** Pause/Play is always visible; ←/→, Space and Esc work; on phones Previous/Next are named buttons; the position ("2 of 5") is announced; nothing advances on its own with reduced motion; focus goes back to the tray item.
- [ ] **Map:** `role="img"` with a label, and the same information as text.
- [ ] **Controls:** switches are `role="switch"` with `aria-checked`; chips use `aria-pressed`; ride options are a native radio group; quantity steppers name their item; the cart total is in a polite live region.
- [ ] **Scrollers:** horizontal lists (story tray, business carousel) are lists of focusable items that work without their arrow buttons.
- [ ] **Touch and zoom:** primary money and booking controls are at least 44px on phones (others at least 24px); at 200% zoom and at 320px wide nothing scrolls sideways or gets cut off.
- [ ] **Reduced motion:** with `prefers-reduced-motion: reduce`, no transitions or auto-advance.
