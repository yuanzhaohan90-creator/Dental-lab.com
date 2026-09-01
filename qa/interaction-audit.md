# YZH Interaction and Visual QA

Status: Preview review only. Production was not deployed.

## Public interaction inventory

| Page | Control | Expected destination / result | Browser result | Fixed |
| --- | --- | --- | --- | --- |
| All public pages | Header logo | `/` | PASS | Yes |
| All public pages | Home | `/` | PASS | No change |
| All public pages | Services | Opens/closes service menu by click, Enter, Space and Escape | PASS | Yes |
| All public pages | Services: Implant Restorations | `/implant-restorations` | PASS | No change |
| All public pages | Services: Full-Arch / All-on-X | `/full-arch-all-on-x` | PASS | No change |
| All public pages | Services: Crown & Bridge | `/crown-bridge` | PASS | No change |
| All public pages | Services: Digital Dentistry / CAD-CAM | `/digital-dentistry` | PASS | No change |
| All public pages | Services: Surgical Guides | `/surgical-guides` | PASS | No change |
| All public pages | Cases | `/cases` | PASS | No change |
| All public pages | About | `/about` | PASS | No change |
| All public pages | Send a Trial Case | `/submit-case` | PASS | No change |
| All public pages | Footer service/company links | Existing public routes | PASS | No change |
| All public pages | Email | `mailto:` public address | PASS | No change |
| All public pages | Copy Email | Copies public address and shows Copied | PASS | No change |
| All public pages | WhatsApp | Configured `wa.me` destination in a new tab | PASS | No change |
| All public pages | Phone | Configured `tel:` destination | PASS | No change |
| All public pages | LinkedIn | Configured HTTPS profile in a new tab | PASS | No change |
| Mobile public pages | Menu | Opens/closes at 375, 390 and 430px; Escape restores focus | PASS | Yes |
| Homepage | Hero: Send a Trial Case | `/submit-case` | PASS | No change |
| Homepage | Core capability summary (5 links) | Relevant Implant, Full-Arch, Digital and QC sections | PASS | No change |
| Homepage | Full-Arch capability card | `/full-arch-all-on-x` | PASS | No change |
| Homepage | Implant Bridge capability card | Implant case information | PASS | No change |
| Homepage | Custom Implant capability card | Implant case information | PASS | Yes, replaced premature Submit Case jump |
| Homepage | Technical Review links (4) | Implant information/QC or Digital Workflow | PASS | Yes, contrast and keyboard states |
| Homepage | Workflow cards (4) | Submit, Digital, Production and QC destinations | PASS | No change |
| Homepage | Final CTA | Submit Case and WhatsApp | PASS | No change |
| Implant | Hero CTAs | Submit Case and WhatsApp | PASS | No change |
| Implant | Featured Work card | Published owner-approved case detail | PASS when configured | Yes, SSR destination applied |
| Implant | Technical workflow cards | Relevant technical anchors | PASS | Yes, full-card keyboard activation |
| Implant | Final CTA | `/submit-case` and WhatsApp | PASS | No change |
| Full-Arch | Hero CTAs | Submit Case and WhatsApp | PASS | No change |
| Full-Arch | Featured Case | Published owner-approved case detail | PASS when configured | Yes, SSR destination applied |
| Full-Arch | Zirconia on Titanium Bar card | Configured case detail, otherwise prefilled Submit Case | PASS | Yes, removed transparent overlay |
| Full-Arch | Immediate-Load PMMA card | Configured case detail, otherwise prefilled Submit Case | PASS | Yes, removed transparent overlay |
| Full-Arch | Final Zirconia card | Configured case detail, otherwise prefilled Submit Case | PASS | Yes, removed transparent overlay |
| Full-Arch | Final CTA | `/submit-case` and WhatsApp | PASS | No change |
| Crown & Bridge | Hero CTAs | Submit Case and WhatsApp | PASS | No change |
| Crown & Bridge | Zirconia card | Filtered Crown & Bridge Case Library | PASS | Yes |
| Crown & Bridge | PFM card | Prefilled Crown & Bridge submission | PASS | Yes |
| Crown & Bridge | Veneers / Inlays / Onlays card | Prefilled Crown & Bridge submission | PASS | Yes |
| Crown & Bridge | Shade & Surface Finish card | Prefilled Crown & Bridge submission | PASS | Yes |
| Crown & Bridge | Contacts & Occlusion card | Prefilled Crown & Bridge submission | PASS | Yes |
| Crown & Bridge | Overflow Support card | Prefilled trial submission | PASS | Yes |
| Digital Workflow | Hero/final CTAs | Submit Case and WhatsApp | PASS | No change |
| Surgical Guides | Hero/final CTAs | Submit Case and WhatsApp | PASS | No change |
| Cases | Category filters | Filter visible published work | PASS | Yes, URL category deep link supported |
| Cases | Featured and Recent Work cards | Correct case detail slug | PASS | No change |
| Case detail | Logo, nav, gallery and CTA | Existing public destinations | PASS | No change |
| About | CTA and contact row | Submit, Email, Copy Email, Phone, LinkedIn, WhatsApp | PASS | No change |
| Submit Case | Required-field validation | Focus first invalid field | PASS | No change |
| Submit Case | Unsupported file error | Clear English error; no POST | PASS | No change |
| Submit Case | Case-type deep link | Select requested case type and preserve focus context | PASS | Yes |
| Submit Case | Send Case for Review | Shows loading; success only after API success | PASS (regression test) | No backend change |
| Privacy Policy | Header/footer links | Existing public destinations | PASS | No change |
| Unknown route | 404 CTAs | Homepage or Submit Case | PASS | Yes, secondary button standardized |
| Legacy case slugs | Old case URLs | 308 to canonical case URL | PASS (regression test) | No change |

## Admin interaction inventory

| Page | Control | Expected result | Browser result | Fixed |
| --- | --- | --- | --- | --- |
| `/admin` | Login | Opens existing manager shell | PASS on Preview | No feature change |
| All manager pages | Header brand | `/admin` | PASS | No change |
| All manager pages | Mobile menu | Click/Enter/Space open; outside click/Escape close | PASS | Yes |
| All manager pages | Sidebar routes | Correct editor/list route and active state | PASS | Yes, `aria-current` added |
| All manager pages | View Website / Logout | Public site in new tab / return to login | PASS | No change |
| Dashboard | Seven quick entries | Correct existing manager module | PASS | No change |
| Page editors | Save Draft / Preview / Publish / Restore | Existing action, clearly distinct button state | PASS (non-destructive controls inspected) | Yes, visual states |
| Cases | Add Quick Work / Create Featured Case Study | Opens correct editor mode | PASS | No change |
| Cases | Close / Upgrade / Preview / Publish / Duplicate / Delete | Correct existing action; no fake button | PASS (destructive commit not executed) | No change |
| Cases | Image reorder controls | Adjust order without overflow | PASS at 390px | No change |
| Submissions | Status filters and record rows | Filter/open selected submission | PASS | Yes, active/pressed state |
| Submissions | Archive / Trash / Restore / Permanent Delete | Correct existing action | PASS (destructive commit not executed) | Yes, visual states |
| Media | Upload, filters, sorting and list actions | Correct existing action | PASS | Yes, active/disabled states |
| Media | Replace/Delete/Trash/Restore/Permanent Delete | Correct existing action | PASS (destructive commit not executed) | Yes, danger states |
| Settings | Save Draft / Preview / Publish / Restore | Existing settings workflow | PASS (publish not executed) | Yes, Chinese status labels |

## Failed controls found and repaired

1. Desktop Services lost focus after Escape and did not reliably reopen with Enter/Space.
2. Mobile/admin menus lacked complete Escape, outside-click and focus-return behavior.
3. Full-Arch cards used an empty absolute overlay link instead of one semantic card link.
4. Custom Implant homepage card jumped directly to submission instead of first explaining Implant support.
5. Crown & Bridge cards looked actionable but had no visible action label and generic destinations.
6. Server-rendered Featured Implant/Full-Arch case links did not apply the configured published case.
7. Submit Case deep links did not preselect Full Arch because the URL label and option label differed.
8. The branded 404 secondary action used a button class not defined by the public visual system.

## Color and contrast

| Use | Foreground | Background | Ratio |
| --- | --- | --- | --- |
| Body text | `#263e53` | `#ffffff` | 11.07:1 |
| Muted text | `#52677d` | `#ffffff` | 5.84:1 |
| Blue text / link | `#0b5fa5` | `#ffffff` | 6.57:1 |
| Primary button | `#ffffff` | `#0b5fa5` | 6.57:1 |
| WhatsApp button | `#ffffff` | `#0f7a4a` | 5.38:1 |
| Footer text | `#d8e2ea` | `#0d2238` | 12.27:1 |
| Technical Review card text | `#304c65` | `#ffffff` | 8.95:1 |

## Browser matrix

Public pages tested at 375x844, 390x844, 430x844 and 1440x900. Results: horizontal overflow 0, empty links 0, broken images 0 and public Chinese text 0. Mouse/touch clicks, keyboard activation, menu open/close, forward/back, refresh, form input and client-side errors were exercised in a real browser.

Destructive Admin actions and Publish actions were opened/inspected but not committed, to avoid changing owner data during Preview QA.
