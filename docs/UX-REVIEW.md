# UX and accessibility review

Apply this checklist to each major screen or workflow before marking it done. Record the screen, build, device or viewport, and pass, fail, or not-applicable results in the PR. Fix blocking issues in the PR and link follow-up issues for the rest. Coordinate implementation with #10 and the final responsive pass with #28.

## Checklist

- [ ] The page title, primary action, and most important figures are easy to locate. Labels use consistent plain language. Spacing, typography, colors, and component states follow the design system.
- [ ] Navigation makes the current destination clear. Common actions take a short, predictable path, and secondary actions stay out of the way. A cancel action preserves existing records.
- [ ] The workflow fits at 320 CSS px, a typical iPhone viewport, and desktop. Test narrow layouts with long labels and large amounts. Sticky controls respect safe areas and do not cover content or keyboard focus.
- [ ] Frequent touch controls target 44 × 44 CSS px. Check WCAG 2.2 AA target-size and spacing requirements for smaller controls.
- [ ] Every action works by keyboard. Focus is visible and follows the reading order. Modal dialogs keep focus inside while open, offer a keyboard exit, and return focus appropriately.
- [ ] Controls have semantic roles and accessible names. Inputs have persistent labels. Errors identify the affected field, are connected programmatically to it, and retain the entered values. A screen reader announces meaningful status changes.
- [ ] Normal text reaches 4.5:1 contrast, large text 3:1, and essential control boundaries, indicators, and focus states 3:1 against adjacent colors. Check both themes. Labels or icons communicate meaning alongside color.
- [ ] Empty, loading, success, and error states explain what happened and provide an appropriate next action. Retry is safe, and destructive actions name the affected item.

## Release pass

The Chromium regression suite runs sign-in, account management, expense entry and editing, Activity search and filters, dashboard widgets, category settings, CSV and Excel import, data exports, and reports at 320 × 720, 390 × 844, 430 × 932, and 1280 × 900. It checks for horizontal overflow, confirms selected primary controls and navigation targets are at least 44 × 44 CSS px, and tests keyboard access to the skip link. Account fixtures include a long unbroken name and the largest supported balance.

At 320 × 720, keyboard traversal also checks that the fixed bottom navigation leaves the expense save button visible. The focused-control review found that the bar could cover controls on Home, Accounts, Activity, and Add. Mobile scroll padding reserves the height of the bar and the device safe area.

An axe scan of Chromium workflow states at 320 × 720 and 1280 × 900 in both themes reported no automated WCAG A/AA violations in the sampled states. The November 27 review covered CSV duplicate decisions, Excel review, data exports, spending charts, and balance charts. A separate 390px Chromium review checked the navigation glyphs in both themes. The report layout review found that variable amount widths shifted chart bars between rows. Charts now share column widths, and More indicates the active settings section on its subpages.

Run dashboard navigation, quick-add expense, search and edit/delete, category management, accounts/net worth/history, import review, and report downloads on iPhone Safari and a desktop browser with synthetic data. Include a keyboard-only pass and a short VoiceOver or equivalent screen-reader pass. Test both themes. The physical iPhone Safari and screen-reader checks are tracked in [#69](https://github.com/GarMoore18/personal-finance-tracker/issues/69). Use [WCAG 2.2](https://www.w3.org/TR/WCAG22/) for exact criteria.
