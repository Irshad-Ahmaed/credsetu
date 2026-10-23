# MiniLedger — Product Requirements and Specification

Version: 1.5 | Date: 22 October 2026 | Status: Source implemented; unit/type checks and Android bundle pass; PostgreSQL and device verification pending

Companion: [Implementation plan](./IMPLEMENTATION_PLAN.md).

## 1. Source of truth and corrections

The two assignment screenshots supplied by the user are authoritative. The earlier PDF and ten-screen mockup provide design inspiration and possible enhancements; they do not expand the assignment's mandatory scope. This revision supersedes version 1.1.

Reviewed sources: the two user-supplied assignment screenshots, covering backend/mobile requirements and bonuses/submission requirements. The matrix below preserves their requirements without depending on local attachment paths.

Corrections from version 1.1:

1. Print mock OTP in the server log as the assignment explicitly requests. The previous blanket prohibition contradicted this.
2. Require friend name, amount and due date. The assignment lists due date without explicitly defining nullability; requiring it is our implementation decision to cover the stated fields.
3. Put the summary at the top of the primary ledger screen, above the entries.
4. Treat separate dashboard, reports, profile, search/filter and ten-screen navigation as enhancements, not required acceptance gates.
5. Receipt upload is optional in the assignment. The user asked for camera handling, so this implementation selects B1. Input validation/basic tests are also included.
6. Explicitly require the GitHub/README link, 2–3 minute Loom/Google Drive recording link, and ability to explain all submitted code.
7. Keep production launch requirements separate from the local assignment demo.

## 2. Objective and requirement matrix

Build a small app to track money lent to friends, its repayment and overdue amount. It records events; it does not transfer money.

| ID | Assignment statement | Classification | Acceptance evidence |
|---|---|---|---|
| R1 | Backend: Node.js + TypeScript + PostgreSQL | Required | Source, build, migration and working database |
| R2 | Phone login with mock OTP printed in server log | Required | Read generated OTP from server terminal and sign in |
| R3 | API to add loan: friend name, amount, due date | Required | Persisted entry with these fields |
| R4 | API to mark entry repaid | Required | Persisted state change |
| R5 | Summary endpoint: total lent, total repaid, overdue amount | Required | Correct fixture-based API totals |
| R6 | React Native phone + OTP login screen | Required | Working app sign-in journey |
| R7 | Entry list with overdue ones highlighted | Required | Text and visual overdue indication |
| R8 | Add-entry form and summary card at the top | Required | Save flow and top summary above list |
| B1 | Upload receipt photo with entry | Optional bonus, selected | Camera/library capture, persisted photo and owner-only retrieval; device verification pending |
| B2 | Input validation and basic tests | Optional bonus, selected for inclusion | Field errors and focused passing tests |
| S1 | GitHub link with README explaining how to run | Required submission | Repository URL and clean setup |
| S2 | 2–3 minute recording, Loom or Google Drive link | Required submission | Reviewer-accessible playback link |
| S3 | Be able to explain every part of code; AI use is allowed | Required readiness | Code walkthrough and interview preparation |

Route names, date policy, money limits and session choices below are implementation decisions, not additional statements from the screenshots. The screenshots specify no deadline, hosting, real SMS, reports or app-store release.

## 3. Scope

### Required app plus selected quality work

- React Native with Expo/TypeScript; Node.js/TypeScript API with Express and PostgreSQL.
- Phone login, console mock OTP, session restoration and simple logout.
- Primary Ledger screen containing top summary and entry list.
- Add Entry form with friend name, INR amount and required due date.
- Full repayment confirmation directly from an entry or lightweight detail view.
- Overdue label, color highlight, loading/error/empty states.
- Selected B2: client/API validation and basic automated tests.
- Chosen quality measures: exact money, per-user ownership, safe retries, accessible controls.
- GitHub/README, shared recording and explanation readiness.

### Enhancements, not assignment gates

Search/filter, separate dashboard, dedicated details page, reports/charts, profile, notes, editable lent/repayment dates and expanded ten-screen navigation. Hide absent actions rather than shipping dead controls.

### Deferred

Partial repayments, interest, editing existing entries, reminders, settings, phone changes, exports, offline writes and multi-currency. Deletion is now a user-requested enhancement, implemented with confirmation and no in-app undo. Receipt B1 has a source implementation; the Expo version check used the local bundled map while networking was disabled, and physical camera verification remains outstanding. Real SMS, production hosting, backups/restore and store submission belong to a future production project.

## 4. User flow and screen behavior

Navigation: phone → OTP → Ledger → Add Entry / repayment confirmation. No bottom tabs are necessary. A native splash may cover startup; a separate welcome page is optional.

### Startup, phone and OTP

Check any stored session with `/auth/me`. Invalid/expired session returns to login; network failure offers retry without silently deleting a possibly valid session.

Use fixed +91 and a validated 10-digit national number for this INR demo, normalized server-side to E.164. The assignment itself does not mandate a country prefix. Show persistent labels and “Demo login: get your OTP from the server console.” Do not claim an SMS was sent.

Use one accessible six-digit input, optionally drawn as six cells. Support paste, expiry errors and resend cooldown. Read the code from the server terminal; never hardcode a universal code in the mobile app or return it in normal API JSON.

### Ledger

Layout order: header/logout → summary card → Add Entry action → entries. The summary appears above the list in the normal initial viewport. Allow growth/scrolling at large text sizes.

Summary card: Total Lent, Total Repaid, Pending Repayment and Overdue Amount. Pending is an enhancement; all three requested metrics remain present. Show the server's India business date.

Rows show friend, exact amount, due date and Pending / Overdue / Repaid text. Highlight pending past-due entries using both a red badge and a subtle surface/accent. Repaid entries never display Overdue.

Default order: overdue pending by due date ascending, other pending by due date ascending, repaid by creation time descending; use creation time/ID as stable tie-breakers. Use FlatList, pagination, refresh, initial loading, retry and empty state with Add Entry CTA.

Mark Repaid is available only for pending rows. Confirm friend/full amount, Cancel and Confirm; disable repeated writes while one is in progress. A separate detail screen is optional. Refresh both list and summary after create/repay, foreground entry and India day changes while Home is focused. Apply a confirmed repayment to the row and exact balances even if the follow-up refresh fails; display a refresh error rather than claiming the saved repayment failed.

Swipe left or right on any entry to request deletion. Only deliberate horizontal drags/flicks qualify; small, vertical, multi-touch and cancelled gestures restore the card. Preserve system back gestures at screen edges. Also provide a visible, accessible Delete action. Both paths confirm the friend and amount before deleting. Respect reduced-motion preferences for reset animation. Disable all mutations and entry navigation while a repayment/deletion is in progress, including the empty-state Add action.

Deletion marks the entry with `deleted_at`, removes its receipt bytes, and excludes it from the list, totals, repayment and receipt endpoints. Hidden row metadata and its submission key/fingerprint remain as a tombstone to prevent old create retries from resurrecting it. The same owner's repeated delete succeeds; missing/foreign entries return the same 404. No in-app undo is provided. Confirmed deletion updates visible totals even if a follow-up refresh fails; pagination resumes only after a fresh first page.

### Add Entry

Required fields: friend name, amount in rupees, due date selected by user. Do not silently default due date. Past dates are allowed so an existing overdue loan can be recorded.

Lent date is assigned by the server as the recording date; it is not an extra required form field. Show validation errors, saving progress and preserved inputs on failure. On success, return to Ledger and refresh data.

Retry uncertain delivery using the original submission key. Offer Retry Same Submission before a new submission; discarding a local draft cannot undo a possible server save. Do not silently generate a new key after a timeout.

Do not discard or navigate away while a submission or native photo picker is in flight. Disable the Cancel control during those operations and guard the discard action again when the confirmation is accepted, so a delayed tap cannot clear the draft behind active work.

### Logout

Revoke online session, clear local token/private caches/drafts and return to login. Offline logout clears local state but explains that server revocation could not be confirmed. The server token remains bounded by its expiry.

## 5. Money, state and date rules

### Money

INR only. Maximum single entry: ₹1,00,00,000.00, or `1000000000` paise. This is an implementation cap, not an assignment requirement.

Accept trimmed plain decimal rupees with up to two fractional digits. Reject zero, negatives, exponent notation, symbols, thousands separators and nonnumeric text. Normalize leading zeros in UI input. Convert using text arithmetic, not `parseFloat(value) * 100`.

API money values are canonical base-10 paise strings: `"250050"` means ₹2,500.50. Individual values are positive; totals may be `"0"`. Store amounts as PostgreSQL BIGINT and preserve numeric aggregate results as strings. Use BigInt/string arithmetic for exact formatting and totals; do not coerce aggregates to Number. Display Indian grouping and two decimals.

### State and totals

Persist pending/repaid only. Pending + `due_on < businessToday` means overdue. Due today is not overdue.

- `total_lent_paise`: all owned loan amounts, including repaid.
- `total_repaid_paise`: repaid owned loans.
- `total_overdue_paise`: pending owned loans due before businessToday.
- Optional `total_pending_paise`: all pending owned loans.
- Invariant: lent = repaid + pending; overdue ≤ pending. Never add overdue again.
- Empty sums are zero strings. No partial repayment or duplicate transition.

### Dates and validation

Business dates use Asia/Kolkata even when the device is abroad. Server supplies business_today. Store event dates as DATE, audit/session times as UTC TIMESTAMPTZ.

- due_on: required valid `YYYY-MM-DD`; past dates allowed.
- lent_on: server businessToday on creation, meaning recording date in this baseline, not historical transfer date.
- No due_on >= lent_on rule: that would prevent recording overdue loans without a historical lending-date field.
- repaid_on: server businessToday on repayment, no client date picker required.
- Friend name: trimmed, nonblank, 2–80 Unicode code points; preserve interior whitespace/punctuation.
- Reject impossible calendar dates, timestamps where dates are expected, and unexpected input fields.
- Client and API validate; API is authoritative. Refresh overdue state when India day changes.

Historical lent dates, if added later, need an explicit product/schema update and tests.

## 6. Authentication and logging

Generate a random six-digit mock OTP and print a development server event: `[DEV OTP] challenge=<id> code=<six digits>`. Challenge ID associates it with the request; full phone logging is unnecessary.

This is the explicit logging exception required by the assignment. Persist a keyed code/challenge digest rather than plaintext. Never log bearer tokens/private loan payloads. Do not forward mock OTP events to analytics or external error reporting. Tests can inject a logger and inspect events.

Chosen defaults: 5-minute expiry, 30-second resend cooldown, five wrong attempts per challenge. Resend invalidates previous active codes. Consume success atomically with user/session creation. Enforce normalized-phone uniqueness and serialize issue/verify by phone.

Add configurable phone/IP throttling. In-memory counters are sufficient for a documented single-process local demo; distributed rate-limit storage is future hardening.

Sessions: opaque random tokens with at least 256 bits of entropy, hashes stored in PostgreSQL, seven-day absolute expiry, no refresh flow. Store raw token in native SecureStore. Check expiry/revocation and ownership on every protected request. On 401 clear private caches and reauthenticate; a network error is not a 401.

Use HTTP only for documented local development, HTTPS for any future hosted deployment. Allow mock OTP in development/test and refuse production configuration with mock selected. Real SMS is not required for assignment submission. Keep server secrets out of mobile public environment variables.

## 7. API contract

Prefix `/v1`. All loan/summary routes require bearer auth. Use snake_case consistently. Success `{ data }`; list also has meta. Error `{ error: { code, message, field_errors? } }`. Do not expose SQL/stack traces.

| Method | Route | Contract |
|---|---|---|
| GET | `/health` | Liveness, no secrets |
| POST | `/auth/request-otp` | Public `{ phone }` → `{ challenge_id, expires_at, resend_available_at }`; prints console OTP |
| POST | `/auth/verify-otp` | Public `{ challenge_id, code }` → `{ token, expires_at, user }` |
| GET | `/auth/me` | `{ user, business_today, business_time_zone }` |
| POST | `/auth/logout` | Revoke current session → `{ logged_out: true }` |
| POST | `/loans` | Idempotency-Key required; create body below |
| GET | `/loans` | Owned rows; page default 1, limit default 20 / max 100 |
| PATCH | `/loans/:id/repay` | Empty body `{}`; atomic full repayment |
| DELETE | `/loans/:id` | Owned soft deletion and receipt-byte removal → `{ id, deleted: true }`; safe to repeat |
| GET | `/dashboard/summary` | Required three totals, optional pending, business date metadata |
| GET | `/dashboard` | Home `{ summary, entries }`, with entries using the list envelope; both read in one read-only repeatable-read transaction |

Create example:

```json
{
  "friend_name": "Amit Kumar",
  "amount_paise": "250050",
  "due_on": "2026-10-20"
}
```

Past due date is intentional. Currency, lent_on, status, user_id and repaid_on are server-owned; reject them in create input. Response fields: id, friend_name, amount_paise, currency, due_on, lent_on, status, repaid_on, is_overdue, created_at, updated_at. repaid_on is null for pending. Event dates are calendar strings; audit times UTC ISO timestamps.

Summary fields: total_lent_paise, total_repaid_paise, total_overdue_paise, total_pending_paise, business_today, business_time_zone, ledger_version. Calculate with one consistent snapshot/business date. The ledger version is `all_entry_count:all_repaid_count:deleted_entry_count`; it changes for every supported ledger mutation (insert/full repayment/deletion).

List envelope: `{ data: Loan[], meta: { page, limit, has_more, business_today, business_time_zone, ledger_version } }`. Fetch limit+1 to determine has_more; validate bounded positive page/limit integers. Cancel superseded reads, pause pagination during refresh/repayment/deletion, and require an explicit retry after page-load failure. Reset to page one if versions/dates differ or page IDs overlap, since rows can move between requests. Home validates date/status, exact monetary totals and response metadata before accepting a snapshot. A frozen multi-page snapshot or cursor is not required.

Status policy: 201 first create; 200 reads/repay/replayed create; 400 malformed JSON/query or missing key; 401 invalid session; 404 absent/foreign loan; 409 ALREADY_REPAID or IDEMPOTENCY_CONFLICT; 422 validation; 429 limit; 503 temporary failure.

### Safe create retries

Generate a UUID key and persist normalized payload/key/user before sending. Store key/fingerprint on loan under unique `(user_id, submission_key)`. Same user/key/payload returns original row with 200; different payload returns 409. Different users are independent. Insert atomically; validation failures do not reserve keys. Keep keys for loan lifetime.

This is chosen correctness work, not an explicit screenshot requirement. Protected pending storage supports retry after lost response/app restart. Clear on success or explicit discard/logout; never quietly change key after uncertainty.

### Repayment

Conditional owned UPDATE from pending sets status, repaid_on and updated_at together. No matching row: return 404 if absent/foreign or 409 if already repaid. No additive repayment record exists. After uncertain delivery, reload list/summary before retry; timeout never proves success.

## 8. Database

| Table | Fields/constraints |
|---|---|
| users | UUID PK, unique phone_e164, created_at |
| otp_challenges | UUID PK, phone_e164, otp_digest, expires_at, attempts, consumed_at, invalidated_at, created_at |
| sessions | UUID PK, user_id FK, unique token_hash, created_at, expires_at, revoked_at |
| loans | UUID PK, user_id FK, friend_name, amount_paise BIGINT, currency, due_on DATE NOT NULL, lent_on DATE NOT NULL, repaid_on DATE nullable, status, submission_key, payload_fingerprint, audit timestamps |

Enforce amount positive/within cap, INR, allowed statuses, pending → repayment date null, repaid → repayment date set and ≥ lent_on. Explicit NOT NULL constraints are required. Do not enforce due-versus-lent ordering. Use parameterized owned queries and 404 for foreign IDs.

Indexes: phone uniqueness, token hash, OTP phone/time, loans `(user_id, status, due_on)`, unique `(user_id, submission_key)`. Seed two isolated demo users and past/today/future pending plus repaid loans. Use versioned migrations; never auto-seed production.

## 9. Design and accessibility

Retain supplied green/light tokens. Calculated primary/white contrast is 5.48:1; supplied status pairs 5.14:1–6.62:1. These values do not certify a rendered app.

Add `borderInteractive: '#81938A'` and `focusRing: '#047857'`; retain subtle border for decoration. Interactive border is about 3.24:1 against white. Status always has readable text.

Treat 52 dp controls as minimum height; allow wrapping and scaling. Ensure at least 48 dp nonoverlapping touch regions. Respect safe areas, keyboard scroll, 200% text, screen-reader labels, modal focus and error announcements. Test 320/390/430 dp; let large amounts wrap. No tab-bar implementation is necessary for the baseline.

## 10. Receipt-photo bonus implementation

The assignment makes receipt upload optional. This project selects it to support the requested camera behavior. The Add Entry form can take a still photo or choose one from the library. It asks for camera permission only after the user taps Take photo and removes microphone permission. The native picker is opened outside the app view; MiniLedger does not keep a live camera preview mounted in the form.

The phone resizes the image to JPEG at a maximum width of 1600 px and 5 MB, then copies it into the app-private documents area. The pending form/key/photo path are stored in SecureStore before launching native camera/gallery UI. Android `ImagePicker.getPendingResultAsync()` is called during auth hydration, so recovery does not depend on Android restoring the Add route. The authenticated user snapshot allows the draft to be recovered while the API is temporarily unavailable.

Create uses a single multipart API request, so loan and optional receipt bytes commit in one PostgreSQL transaction with the same idempotency key. The API enforces a 5 MB limit, validates JPEG/PNG/WebP signatures against the declared MIME type, stores bytes in a private BYTEA column, and returns a receipt availability flag. The owner-only receipt route streams the image with `no-store` and `nosniff` headers. List queries select receipt metadata only; they do not load image bytes for every row.

The receipt viewer makes an explicit authenticated binary download and renders a temporary local image file. It validates the response status, MIME type, image signature and 5 MB bound; expired sessions offer sign-in, and download/decoder failures offer retry. Pending requests are cancelled and temporary files are removed on close, retry or account change. A failed or missing native image callback cannot leave an endless spinner.

A declined camera permission or missing camera leaves the form usable without a receipt; the gallery remains available. The current code has not yet been exercised on a physical camera or Android's “Don't keep activities” setting. Those checks remain a release verification task.

## 11. Acceptance and submission

All R1–R8 must pass with PostgreSQL persistence and server-console OTP on an Android emulator or device. Physical-device testing is preferred extra evidence, not an explicit screenshot requirement. Deliver selected B2 and B1. Record camera/device verification accurately; do not claim native camera recovery was tested until it is.

Fixture on a fixed business date: ₹100 pending due yesterday + ₹200 pending due tomorrow + ₹50 repaid with past due date = Lent ₹350, Repaid ₹50, Overdue ₹100, optional Pending ₹300. Repay ₹100 → Lent ₹350, Repaid ₹150, Overdue ₹0, Pending ₹200. Empty ledger yields zeros; due today is not overdue.

Submission requires:

1. GitHub repository URL, source/lockfile/migrations/example env and runnable README including console OTP instructions.
2. Working 2–3 minute recording via Loom or Google Drive link, with reviewer-accessible playback permissions. Local video alone is insufficient.
3. Honest bonus, platform and limitation notes; no invented claims about tests, uploads, hosting or real SMS.
4. Ability to explain every submitted module, schema, auth flow, money/date rule, ownership check, retry/repayment transaction, UI refresh and test. AI use is allowed; understanding remains the submitter's responsibility.

These documents do not themselves implement, test, publish, upload or submit the application.

