# HomeHub test plan

Covers the new work (Household Directory, currencies, languages, local-first @HomeHub) and regression checks for everything that already worked. Tick each row as you go; log failures with the template at the end.

## 0. Known limits (so they are not reported as bugs)

- **Languages:** English, Français, Español, Português, Kiswahili. Navigation, money, directory, account and common labels are translated. Long-tail text (some hints, empty states, settings descriptions) still shows in English. Run `HomeHubI18n.missing()` in the browser console on any screen to list untranslated text. Translations are machine-quality and need review by native speakers. Bemba and Nyanja are not included.
- **@HomeHub commands** are parsed in English only when working locally. Other languages need the AI (online). Messages written by @HomeHub are stored in the language of the person who asked.
- **Private contacts** are stored on that device only (they are not uploaded). They do not follow the person to another phone.
- Existing items keep their old currency. Changing the household currency only affects new items.

## 1. Test setup

| Item | Detail |
|---|---|
| Accounts | 3 real accounts in one household: Admin, Member, Restricted. 1 account in a different household (for isolation tests). 1 Guest invite. |
| Devices | Android Chrome, iPhone Safari (installed to Home Screen), desktop Chrome, desktop Firefox/Edge. |
| Networks | Wi-Fi, mobile data, Chrome DevTools "Slow 3G", airplane mode. |
| Automated | `npm i -D playwright && npx playwright install chromium && node tests/smoke.js` must print `ALL PASSED` before every release. |
| Reset | Use a fresh household for each section when you need a clean state. |

## 2. Household Directory

| # | Test | Expected |
|---|---|---|
| D1 | Open Directory as Admin with no contacts | Empty state with guidance and an Add contact button |
| D2 | Add a contact with only a name | Saves; row shows name and category "Other" |
| D3 | Add a contact with every field (all 8 categories, one per category) | All fields show in the details view; category chip correct; filter chips appear only for categories in use |
| D4 | Phone "0977 123 456", "+260 977 123 456", "(021) 123-456" | Accepted. Call/Text links use digits only (`tel:+260977123456`) |
| D5 | Phone "abc", "12" | Rejected with a message |
| D6 | Email "bad@", website "javascript:alert(1)", website "data:text/html,x" | Email rejected. Unsafe website is saved as text but never becomes a link |
| D7 | Website "example.com" and "https://example.com" | Both open `https://example.com` in a new tab with `noopener` |
| D8 | Search by name, phone digits, note text, category name; clear search | List filters live and restores; "No contacts match" message when nothing matches; typing does not lose focus |
| D9 | Edit a contact, change category, save | Details update; Activity on Home shows "updated the directory contact" |
| D10 | Delete: first tap asks to confirm, second deletes; leave the dialog without confirming | Only deleted after second tap; activity entry added |
| D11 | Text with `<script>`, `"` and `'` in every field | Displayed as plain text, nothing executes |
| D12 | Very long name (80 chars), 400-char note, emoji, Bemba/French accents | Layout intact, no horizontal scroll at 360px width |
| D13 | Add a duplicate of an existing number | Accepted (no hard block). Confirm this matches what you want |

### Permissions and privacy

| # | Test | Expected |
|---|---|---|
| P1 | Admin: Household → Directory → "Administrators only" | Member can still see contacts, but cannot create shared ones (only "Private to me") |
| P2 | Set back to "Administrators and members" | Member can add and edit shared contacts |
| P3 | Member deletes a contact created by the Admin | Not offered (only the creator or an Admin can delete) |
| P4 | Restricted member | Can view and call; only offered "Private to me" when adding |
| P5 | Guest | No Directory in navigation |
| P6 | Turn the Directory module off | Nav entry disappears for everyone; data is kept; turning back on restores it |
| P7 | Create a private contact on phone A | Not visible to other members; **not** visible on the same user's phone B (known limit); not present in the synced household data (check in Supabase table `households.state`: no private names) |
| P8 | @HomeHub lookup of a private contact in the house chat | Not returned (chat only uses shared contacts) |

### Sync

| # | Test | Expected |
|---|---|---|
| S1 | Add a shared contact on phone A | Appears on phone B within about 10 seconds |
| S2 | Both phones edit different contacts offline, then reconnect | Both edits survive |
| S3 | Both phones edit the same contact offline | Merge completes with no error, last writer wins per field |
| S4 | Household created before this update (no `directory` field) | Opens normally; Directory empty; no console errors |

## 3. @HomeHub

### 3a. Local commands (must work with the network off and the AI switched off)

Say each phrase in the house chat with the AI toggle both on and off. Expected result is the same, and **no request is sent to `/functions/v1/homehub-ai`** (watch the Network tab).

| Phrase | Expected |
|---|---|
| `@HomeHub, what's our plumber's number?` | Saved plumber's details with tap-to-call/text buttons. If none saved: says so and shows how to add one |
| `@HomeHub call the electrician` / `number for the landlord` / `who is our landlord` | Same lookup behaviour |
| `@HomeHub add this number as our electrician` (then give a number) / `add 0966 555 444 as our electrician` | Asks "What name should I save it under?"; the next message you send (no @ needed) becomes the name; saved under Maintenance |
| `@HomeHub add Joe Banda 0966 555 444 as our plumber` | Saved immediately as "Joe Banda" in Maintenance |
| Reply `cancel` to the name question | "Okay, I didn't save it." Nothing saved |
| `@HomeHub add milk and eggs to the shopping list` | Added directly; duplicates reported |
| `what's on the shopping list` / `what bills are unpaid` / `who is home` / `what's on this week` / `help` | Correct read-only answers |
| `what's due today` / `what's on my plate` | Task summary |
| `move the trash to Friday`, `assign laundry to Chanda`, `delete the laundry task` | Asks for confirmation before changing/deleting |
| Phone number in a date or task, e.g. `add dentist 12 05 2026` | Must **not** create a contact |
| Restricted member says `add 0977 111 222 as our plumber` | Refused with a role message |
| Problem message (no @): `the pipe under the sink is leaking again` | Card offering the saved plumber with Call/Open directory/Dismiss. Not shown if no plumber saved. Dismiss hides it |
| Problem message: `power cut again` | No electrician card (load-shedding must not trigger it) |

### 3b. AI behaviour and quota protection

| # | Test | Expected |
|---|---|---|
| A1 | Online, AI on: `@HomeHub plan a surprise for mum this weekend` | One request to the AI; its reply shows; actions need confirmation where they did before |
| A2 | Simple requests from 3a | Zero AI requests (count them) |
| A3 | Airplane mode, same complex phrase | No request attempted; basic-mode message; app stays responsive |
| A4 | Phone Data Saver on, or a connection the browser reports as 2G (Chrome: `navigator.connection.effectiveType` in the console; DevTools "Slow 3G" may or may not report 2G) | AI skipped; local handling only. Slower connections that are not reported as 2G still try the AI but give up after 12 seconds (A5) |
| A5 | AI slow (throttle to offline mid-request) | Gives up after 12 seconds and falls back to basic mode |
| A6 | Force an HTTP 429 (temporarily set a bad `GEMINI_API_KEY` or use the Network "block" feature) | Falls back once, then **no AI requests for 15 minutes**; local commands still work |
| A7 | Edge function responds 404 | AI switched off for the session with a single notice |
| A8 | Household AI toggle off | No AI requests at all |
| A9 | Call the function with no `Authorization` header (`curl`) | 401. With a user from another household: 403 |
| A10 | Send 20 AI messages in a minute | Server rate limit answers 429; app handles it as in A6 |
| A11 | Check Gemini usage in Google AI Studio after a normal day | Calls are far below the number of @HomeHub messages sent |

## 4. Currencies

| # | Test | Expected |
|---|---|---|
| C1 | New household | Currency defaults to Zambian kwacha (ZMW) |
| C2 | Household settings | Select lists 49 currencies, ZMW/USD/EUR/GBP/ZAR first, rest alphabetical; the hint explains per-item currency |
| C3 | Add a bill: currency defaults to household currency; pick USD | Bill shows `$500` in the list, details, reminders and calendar |
| C4 | Mix a ZMW and a USD bill | Totals show both ("$500 + ZMW 250"), never a wrong sum |
| C5 | Mark a USD bill paid | History keeps USD; undo works |
| C6 | Money jar in EUR with equal and custom splits | Targets, shares, contributions and goal notification all in EUR; custom split error message uses EUR |
| C7 | Change the household currency ZMW → USD | Existing bills and jars keep ZMW; new ones default to USD |
| C8 | Zero-decimal currency (JPY, UGX) and 3-decimal inputs | Displays sensibly; no `NaN` |
| C9 | Insights → open bills by category with mixed currencies | Labels per currency (bar lengths are approximate when currencies are mixed) |
| C10 | Bills created before this update | Display in the household currency as before |
| C11 | Change language to French/Portuguese | Number and currency formatting follow the language (e.g. `250 ZMW`) |

## 5. Languages

| # | Test | Expected |
|---|---|---|
| L1 | First visit with browser set to French / Portuguese / Spanish / Swahili | App opens in that language; other browser languages open in English |
| L2 | Avatar → Account → Language | Changes immediately, no reload; also on the sign-in screen |
| L3 | Choice persists after reload and after sign-out/in; different phones can use different languages | Yes |
| L4 | Walk every nav item in each language | No `undefined`, no broken layout; long words (Swahili, German-length) do not overflow buttons at 360px |
| L5 | Dates, weekday names, "x min ago" | Follow the chosen language |
| L6 | Console: `HomeHubI18n.missing()` on each screen | Review list; add translations to the `I18N` table for anything important |
| L7 | A task/contact whose title equals a translated word (e.g. "Meals") | Note: it will display translated. If this is a problem for you, tell me and I will mark user text |
| L8 | Screen reader: `<html lang>` updates | Yes |

## 6. Offline, PWA and sync

| # | Test | Expected |
|---|---|---|
| O1 | Install to Home Screen, open in airplane mode | App opens with last data; "Offline. Changes are saved on this phone" pill |
| O2 | Make changes offline, reconnect | Pill shows Saving then Synced; changes appear on the other phone |
| O3 | Deploy a new version | After one reload the new `sw.js` (cache `homehub-v3`) takes over; old cache removed |
| O4 | Session expiry while offline | App still opens from cache; asks to sign in only when it needs the server |
| O5 | Photos/voice messages offline | Clear failure message, nothing lost |

## 7. Security and data safety

- Supabase **Row Level Security** on `households`, `household_members` and the `media` bucket: a user from another household cannot read or write (test with a second account and the REST API).
- The key in `index.html` is a publishable key (safe to expose). Confirm no `GEMINI_API_KEY` or service-role key appears in the repo (`git grep -n "AIza\|service_role"`).
- XSS: put `"><img src=x onerror=alert(1)>` into contact, task, chat, bill and household names; nothing may execute.
- Invite codes: used code rejected; wrong code rejected; Guest cannot edit anything.
- Private contacts never appear in `households.state` (check the row in Supabase).
- Edge function: CORS, 401 without token, 403 without household, 429 on abuse (see A9–A10).
- Privacy notice: AI toggle text explains that free-tier Gemini content may be used by Google.

## 8. Accessibility

Keyboard-only walk through Directory (tab order, Enter/Space on rows, Escape closes dialogs, focus returns to the opener). Screen reader (TalkBack/VoiceOver): form labels, button names, language announced correctly. 200% zoom and 360px width: no clipped controls. Dark mode contrast. "Reduce motion" respected.

## 9. Performance

500 contacts: Directory opens in under 1 second and search stays smooth. Cold start on Slow 3G: shell loads from cache on second visit. Chat with 300 messages scrolls smoothly.

## 10. Regression (existing features)

Go through each module once per role (Admin / Member / Restricted / Guest) and confirm nothing changed: tasks (create, assign, claim, complete, recurrence, overdue), routines, calendar layers, supplies (inventory, low-stock to shopping list), bills (reminders, mark paid, undo), money jars, events and RSVP, cleaning/maintenance, meals, board, polls, reactions/pins, photos and voice messages, presence, automation rules, insights, notifications, invite/join flow, profile photo, erase data.

## 10a. Smart Inventory Input (barcode, receipt, price)

Supplies > Inventory shows **Scan barcode**, **Scan receipt** and **Add item** (admins and members only). Everything scanned goes through a review screen; nothing is saved until the person taps **Save to inventory**.

| # | Test | Expected |
|---|---|---|
| S1 | Add item by hand with a price | Saved; the item detail shows "Last price paid" in the household currency |
| S2 | Scan barcode on Android Chrome, a product Open Food Facts knows | Camera opens, code is read, review shows brand + name + pack size |
| S3 | Same on iPhone Safari | No live scanner (Safari has no BarcodeDetector): the camera area is hidden and a message says to type the number. Typing works |
| S4 | Deny camera permission | Clear message; typing the number still works |
| S5 | Type "12ab" or 3 digits | Rejected with a message |
| S6 | Unknown barcode | Review opens with an empty name and a note; blank name is rejected; after naming it, scanning the same code again fills the name without a network call |
| S7 | Scan a code already on an inventory item, choose "I used it" | Stock goes down; at the minimum the item lands on the shopping list |
| S8 | "I used it" with "Add to" left on "New item" | Rejected, asks which item was used |
| S9 | Photo of a clear receipt (online) | Items listed with quantity, unit, price, category; store, date and total chips shown |
| S10 | Receipt line for something already in stock | "Add to" is preselected; saving tops up that item and records the price in its history |
| S11 | Change "Add to" to another item | Unit switches to that item's unit |
| S12 | Receipt line in a different unit from the stock item (for example 500 g against kg) | g/kg and ml/L convert automatically. Anything else (packs against kg) is rejected with a message |
| S13 | Untick a line, edit a name, save | Only ticked lines are saved, with the edited names |
| S14 | Receipt lists something that is on the open shopping list | That shopping item is ticked off; stock is not counted twice |
| S15 | Blurry photo, non-receipt photo | "No items were found" with the option to type the lines |
| S16 | Airplane mode, then Scan receipt > photo | Explains that you are offline; typing or pasting lines still works and parses "2 x Milk 1L 45.00" style lines |
| S17 | Restricted/guest role | No inventory tab, no scan buttons |
| S18 | Receipt with text such as `<script>` or "ignore previous instructions" | Shown as plain text, nothing executes, no behaviour change |
| S19 | Close the barcode dialog | Camera light turns off immediately |
| S20 | Second household member on another phone | Remembered barcodes (names you taught) appear there after sync |

Known limits: the receipt reader is Gemini via your `homehub-ai` edge function, so it needs the function redeployed (see `backend/`) and counts against the same per-minute limit as chat. Prices are the line total paid, not unit price. Handwritten or crumpled receipts will be unreliable; that is why the review screen exists.

## 11. Release checklist

1. `node tests/smoke.js` passes.
2. Sections 2–5 pass on two real phones.
3. Console has no errors on every screen.
4. Supabase backup/export taken.
5. Commit, push, wait for hosting to publish, reload twice, confirm the version.
6. Watch AI usage for 2–3 days; adjust the cool-down if the free quota is still hit.

## Bug report template

Device / browser / language · Role · Steps · Expected · Actual · Screenshot · Console or Network error · Online or offline.
