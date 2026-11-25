# Ledger UX direction

Keep the prototype's amount-first flow and familiar bottom navigation. Use cool neutral surfaces, ink text, and a restrained indigo accent, system typography, and tabular currency figures. Give section headings and primary figures more weight than card borders. Use words and icons to distinguish status alongside color. Pair each destination with a symbol and a text label. Keep Home, Activity, Add, Accounts, and More in the same order on phone and desktop. Home leads with one spending figure, then recent expenses and net worth on phones. Desktop places net worth alongside spending and activity.

The [mobile visual sample](UX-MOBILE-MOCKUP.svg) applies this direction to Home and Add using synthetic data. It is a representative design mockup; issue #10 will define the implementation tokens.

On phones, pin navigation above the safe area and use one content column. On desktop, move navigation to the left, limit reading width, and use two columns where the content is independent. Keep forms narrow. Follow [Apple's tab bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

[Mobile wireframes](UX-WIREFRAMES.md) show the primary paths. Review them against [the UX acceptance checklist](UX-REVIEW.md) when implementing each screen.

## Shared states

| State | Pattern |
|---|---|
| Empty | Explain what belongs on the screen and provide one next action. Missing balances or snapshots display as unavailable. Show zero for a complete period with zero expenses. |
| Loading | Keep the shell usable, reserve space where content will appear, and announce loading once to assistive technology. |
| Error | Keep entered values, explain which operation failed, and offer retry. Keep confirmed data visible if a later refresh fails. |
| Saved | Return to the relevant list and announce the action. Show the new or changed row in its normal position. |
| Delete | Name the record and consequence in the confirmation. Preserve history by archiving accounts. Reassign expenses before deleting a category they use. |

Use a semantic form and visible labels for editable fields. Keep amount first, then category, description, and date. Default date to today in the owner's calendar. Display the chosen category before saving. Keep optional notes collapsed until requested. For account balances, show the observation date and whether the account is an asset or liability.

## Implementation order

#10 establishes navigation, shared tokens, and reusable states. #17–#23 fill in expense entry, Activity, and Home. #11–#15 fill in account and category management. #28 and #69 cover workflow validation.
