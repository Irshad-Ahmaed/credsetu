# MiniLedger — Implementation and Submission Plan

Version: 1.5 | Date: 22 October 2026 | Status: Source implemented; unit/type checks and Android bundle pass; PostgreSQL and device verification pending

Product authority: [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), based on the assignment screenshots. This supersedes the broader ten-screen roadmap. Required assignment work comes first. B2 and camera/receipt B1 are selected; native verification remains outstanding.

## 1. Architecture and delivery strategy

Build a vertical slice: Node.js/TypeScript/PostgreSQL → logged mock OTP → React Native Ledger with summary at top → Add Entry → Mark Repaid → persistent totals. Keep modules straightforward enough to explain in an interview.

Implementation defaults: Expo/TypeScript/Expo Router, Express/TypeScript, versioned PostgreSQL SQL migrations, API-side Zod schemas, and pure money/date helpers. Choose compatible stable versions from official documentation when implementing, commit the lockfile and record runtime prerequisites. No SMS or cloud-storage account is needed for baseline setup.

```text
mobile/
  app/                  # Expo Router auth, Ledger, Add Entry, receipt routes
  src/                  # Shared components, screen data hooks, auth/API, drafts, picker recovery, formatting and theme
api/
  src/                  # Express app, config, domain helpers, database tools and tests
  migrations/           # PostgreSQL schema
docs/
  verification.md
  interview-guide.md
  submission.md
README.md
.env.example
PRODUCT_SPEC.md
IMPLEMENTATION_PLAN.md
```

The tree above reflects the implemented workspace. Reports, profile, settings and five-tab navigation remain outside the assignment baseline.

Keep screens compositional: reusable display/input pieces belong in components, and shared asynchronous state and lifecycle behavior belongs in hooks. Keep every hand-written TypeScript, JavaScript and SQL source file at 300 lines or fewer; split by responsibility when a module approaches that limit. Preserve cleanup for timers, subscriptions, file copies and native picker transitions.

## 2. Implementation phases

Task markers: `[x]` means implemented locally; database/device checks and external submission evidence are recorded separately in [verification](./docs/verification.md) and [submission](./docs/submission.md).

### Phase 0 — Assignment contract

- [x] Track R1–R8 and S1–S3 from the product matrix.
- [x] Record validation/basic tests B2 and camera/receipt B1 as selected.
- [x] Define auth/create/list/repay/summary schemas, examples and errors.
- [x] Confirm required due_on accepts past dates; lent_on is server recording date.
- [x] Lock snake_case, paise strings, India calendar and session defaults.
- [x] Sketch phone → OTP → Ledger → form/confirm, with top summary.

Gate: no conflict with logged mock OTP or overdue entry creation; no mandatory reports/profile/public launch work.

### Phase 1 — Runnable foundation

Dependencies: Phase 0.

- [x] Initialize workspace packages, strict TypeScript and lockfile.
- [x] Boot Expo and Express as separate workspace packages.
- [x] Provide local PostgreSQL setup through Docker Compose; integration testing still needs a running test database.
- [x] Add validated environment config, safe examples, health endpoint, JSON errors and size limits.
- [x] Document mobile API URL for emulator/physical phone, including LAN networking.
- [x] Add dev/typecheck/test/migrate/seed scripts.

Gate: fresh setup boots app/API and connects to PostgreSQL without bundling secrets in mobile.

### Phase 2 — Schema and exact domain helpers

Dependencies: Phase 1.

- [x] Migrate users/challenges/sessions/loans, constraints, foreign keys and indexes.
- [x] Require due_on and omit a due_on >= lent_on constraint.
- [x] Add unique normalized phone, token hash and per-user submission key.
- [x] Seed two isolated users and past/today/future pending plus repaid loans relative to business date.
- [x] Implement exact rupee parsing, paise string validation, currency formatting and India date helpers.
- [x] Preserve BIGINT/numeric strings in database adapters.
- [x] Test money/date helpers and input validation; database constraint tests remain pending a local PostgreSQL run.

Gate: clean migrations/repeatable seeds, exact arithmetic, valid overdue inserts, invalid-row rejection.

### Phase 3 — Logged mock OTP and sessions

Dependencies: Phase 2.

- [x] Implement phone normalization and OTP request/verify routes.
- [x] Generate six-digit random code and print `[DEV OTP]` event with challenge ID/code in server terminal.
- [x] Store digest only; enforce five-minute expiry, 30-second resend and five wrong attempts.
- [x] Invalidate previous codes and atomically consume success with user/session creation.
- [x] Implement phone/IP throttling; document single-process in-memory limitation.
- [x] Issue opaque tokens, store hashes, enforce seven-day expiry and revocation.
- [x] Add auth middleware, me/logout endpoints, mobile SecureStore, hydration and route guards.
- [x] Block mock outside development; log only the deliberate development OTP and redact tokens/private payloads.
- [x] Build phone/OTP UI with accurate demo instructions, errors and retry.

Gate: app login works using server-console code; wrong/expired/reused/superseded codes fail; restart restores session; revoked token fails. No SMS provider is needed.

### Phase 4 — Required loan and summary APIs

Dependencies: Phases 2–3.

- [x] Create owned entry from friend_name/amount_paise/due_on; assign currency/state/recording date server-side.
- [x] Persist idempotency key/fingerprint atomically and resolve replay/conflict.
- [x] Implement paginated owned list, deterministic ordering and derived overdue state.
- [x] Implement conditional full repayment with server date and 404/409 behavior.
- [x] Implement required summary totals and optional pending total from a coherent aggregate/date.
- [x] Read Home summary and first page in a single read-only repeatable-read snapshot; include a ledger version to detect changes between pagination requests.
- [x] Parameterize SQL and validate inputs/ownership.
- [ ] Add and run PostgreSQL integration tests for summary, ownership, retry and concurrent repayment.

Gate: R3–R5 pass independently of mobile; retries create one row; foreign data is inaccessible; double repay has one transition; repaid loans leave overdue.

### Phase 5 — Mobile complete journey

Dependencies: Phase 4; primitives can begin after Phase 1 once contracts stabilize.

- [x] Apply design tokens with stronger input border, scalable type and min-height controls.
- [x] Put summary above entries on Ledger with all three required metrics.
- [x] Include the pending balance and India business date; validate totals, entry statuses and metadata before displaying API responses.
- [x] Implement FlatList rows with due date, text/color overdue highlight, pagination and refresh.
- [x] Build required-field form/date picker, allowing past dates and no extra lent-date input.
- [x] Persist key/payload before dispatch and reuse after uncertain save/restart.
- [x] Add row repayment confirmation; dedicated details page is optional.
- [x] Refresh list/summary after writes, foreground and India day change.
- [x] Add loading/empty/error/retry/expired-session states; preserve failed form inputs.
- [x] Extract Ledger summary/row/empty states and entry date/photo controls into focused components; centralize ledger loading, refresh and pagination in a hook.
- [x] Serialize secure draft writes, protect uncertain idempotent retries, and save the draft before navigation removes the form.
- [x] Audit source-file sizes; keep each authored source module below the 300-line limit.
- [x] Reconcile uncertain repayment by refreshing before asking the user to retry.
- [x] Guard duplicate repayment writes, keep acknowledged repayments after a failed refresh, and test stale requests, pagination retries and session expiry using controlled asynchronous responses.
- [x] Add left/right swipe deletion, a visible Delete fallback, native confirmation, reduced-motion reset and owner-scoped idempotent deletion with receipt cleanup.
- [x] Add migration 002 for deletion tombstones, protect create retries from resurrection, update pagination versions, and verify deletion/totals/ownership using rollback-only PostgreSQL fixtures.
- [x] Put logout in header and clear user-scoped state on logout.
- [ ] Verify camera permission denial, gallery fallback, app resume, Android Activity recreation and photo retry after a lost response on a device.

Gate: login → add → list → repay → totals works on emulator/device and survives restarts. Summary is at top; no dead optional navigation.

### Phase 6 — Validation, tests and usability

Dependencies: Phase 5.

- [x] Run strict typechecks and focused units; real PostgreSQL integration tests remain pending.
- [ ] Check client/API field errors, overdue boundaries and correct empty/mixed totals through API integration.
- [ ] Test lost response after create commit and original-key recovery after restart.
- [ ] Test duplicate/concurrent repay, ownership and session changes against PostgreSQL.
- [ ] Check 320/390/430 dp, 200% text, keyboard, safe areas and long amounts/names on a device.
- [ ] Check 48 dp targets, labels, status beyond color, modal focus and error announcements on a device.
- [ ] Verify top summary in normal initial viewport and accessible growth/scroll with large text on a device.
- [ ] Record actual emulator/device/OS/build; no emulator or Android Debug Bridge is currently available.

Gate: selected B2 works, correctness defects resolved, no unperformed platform/tests claimed.

### Phase 7 — Submission and explanation

Dependencies: Phase 6. Optional features do not block handoff.

- [x] Write README and setup/database/migration instructions for Neon or local PostgreSQL; Docker is optional.
- [x] Include lockfile, example env, seed and API examples.
- [x] Record actual checks/limitations in docs/verification.md.
- [x] Review workspace source for secrets/personal data and use fictional demonstration records.
- [ ] Create/push GitHub repo when account access and publication authorization are available; record actual URL.
- [ ] Record 2–3 minute working-app demonstration.
- [ ] Upload to Loom/Google Drive when access/sharing authorization are available; verify reviewer playback.
- [ ] Put actual GitHub/video links in docs/submission.md; do not invent URLs or substitute local video for shared link.
- [x] Write interview notes; the submitter still needs to rehearse them.

Gate: S1–S3 have evidence and links work for reviewer. Report missing external access clearly while finishing all possible local work. Do not send a submission to an evaluator without authorization.

## 3. Transaction recipes

### Create

Validate/normalize and establish authenticated user/business date. Insert loan with key/fingerprint under unique `(user_id, submission_key)`. Use safe conflict handling such as INSERT ON CONFLICT DO NOTHING RETURNING, then fetch owned matching row. Same payload returns original; mismatch returns 409. Do not rely on a pre-insert check; commit before responding.

Mobile stores pending key/payload before dispatch. Clear on success or explicit discard/logout; reuse after timeout. Discard cannot undo a possible server save.

### Repay

Conditional UPDATE by ID/user/pending status sets repaid state/date/audit time together. No updated row means inspect owned state for 404 or 409. No additive amount is applied twice.

### OTP

Serialize issue/verify by normalized phone using PostgreSQL transaction locks. Invalidate prior challenges on issue; update attempts or consume success/session atomically. Print console event for successfully issued mock challenges. Inject logger in tests. This required event is the deliberate exception to general secret-log redaction.

### Summary

Use one coherent aggregate snapshot/business date, owned rows, COALESCE zero and exact result strings. Overdue = pending with due date before today; never double-count it.

## 4. Verification matrix

| Area | Selected coverage | Evidence |
|---|---|---|
| Stack | TypeScript API, PostgreSQL migrations, React Native boot | Commands/setup record |
| OTP | Server console event; correct/wrong/expired/reused/resend | Tests and demo |
| Fields | Missing friend/due date; blank name; invalid amount/date | Client/API errors |
| Money | 0, negative, extra precision, 0.01, cap/cap+1, sums/format | Units and DB fixtures |
| Dates | Yesterday/today/tomorrow, invalid leap date, India midnight | Injected clock tests |
| Summary | Empty/mixed, after repay, overdue subset | Independent expected fixtures |
| Ownership | Two users' lists and repayment isolation | Integration tests |
| Retry | Same key, changed payload, concurrent create, response loss | Integration/manual recovery |
| Repay | Normal/already/concurrent/uncertain | Integration and UI checks |
| Mobile | Top summary, highlight, add, confirm, error/restart recovery | Emulator/device record |
| Layout | Small widths, large type, keyboard, labels, focus | Manual checklist |
| Submission | Clean setup, repo URL, video duration/permissions | Handoff record |
| Explainability | Every module/decision | Interview notes/rehearsal |

Use one unit runner (Vitest/Jest), Supertest and a real isolated PostgreSQL database. Focused React Native Testing Library tests can cover critical UI behavior. Avoid a testing framework larger than the assignment. B2 is selected bonus; concurrency/ownership checks are chosen quality work, not claims about screenshot wording.

Fixture: ₹100 pending overdue + ₹200 pending future + ₹50 repaid past-due = Lent ₹350, Repaid ₹50, Overdue ₹100. Repay ₹100 → Lent ₹350, Repaid ₹150, Overdue ₹0. Also test zero loans and due-today exclusion. Synchronize concurrency tests using barriers, not timing guesses.

## 5. README checklist

1. Runtime/package manager/PostgreSQL or Docker/Expo prerequisites and versions.
2. Exact install, DB start, migrate, seed, API start and mobile start commands.
3. Safe env examples, no committed secrets.
4. Emulator/physical-phone API URLs and localhost explanation.
5. Request OTP and read `[DEV OTP]` from server console; no SMS setup.
6. API examples, required due_on and paise representation.
7. Business date/overdue, sessions/logout, safe retries and limitations.
8. Test commands/results; B2 included and camera/receipt B1 verification status.
9. Actual GitHub/video links or pointer to docs/submission.md once available.
10. Troubleshooting database, migration, networking, OTP expiry and ports.

Verify these instructions from a clean checkout, not only the author's environment.

## 6. Recording and sharing

Target about 2:30, within the required 2–3 minutes.

| Time | Demonstration |
|---|---|
| 0:00–0:20 | App/stack introduction and phone login |
| 0:20–0:45 | Request OTP; briefly show server console, enter code |
| 0:45–1:05 | Top summary and pending/repaid/overdue rows |
| 1:05–1:35 | Add friend/amount/past due date; highlight and totals change |
| 1:35–2:00 | Mark overdue loan repaid; show state and totals change |
| 2:00–2:15 | Restart/reopen to demonstrate persistence |
| 2:15–2:40 | README/tests and honest bonus/limitation note |

Use fictional data. Show no env secrets or tokens; showing development OTP is intentional. Share via Loom or Google Drive with reviewer-accessible permissions, verify playback/readability and record actual URL. No unsolicited evaluator message or public upload is implied by planning.

## 7. Interview readiness

AI help is allowed, but the submitter must explain every part. Prefer simple modules and explicit transactions over unnecessary infrastructure.

- [ ] Explain app → API → PostgreSQL request path and schema/index choices.
- [ ] Explain phone normalization, random OTP/digest/expiry/console logging/one-time use.
- [ ] Explain token hash, SecureStore, ownership, expiry and logout.
- [ ] Explain exact paise strings and UI decimal conversion.
- [ ] Explain required due date, server recording date and India overdue rule.
- [ ] Explain summary math and why overdue is inside pending.
- [ ] Explain idempotency and conditional repay with a race/timeout example.
- [ ] Explain client/API validation, HTTP errors and UI refresh.
- [ ] Run/explain tests and setup; discuss actual limitations.
- [ ] Distinguish assignment requirements, selected bonus, optional extras and production work.

## 8. Illustrative schedule

No deadline is supplied. This is a working sequence for one developer, not a commitment.

| Day | Output |
|---|---|
| 1 | Contract, scaffold, database, money/date helpers |
| 2 | Console OTP, sessions and ownership |
| 3 | Create/list/repay/summary APIs and tests |
| 4 | Login, top summary, list/form/repayment UI |
| 5 | Retry/restart, validation, usability and fixes |
| 6 | Clean setup, README, repo, recording, interview rehearsal |

Re-estimate after setup and full app journey. Defer search/reports/profile before reducing required behavior. Camera/receipt is selected B1, but is still subordinate to the required flow. The earlier broader twelve-day plan is no longer the assignment acceptance gate.

## 9. Optional/future work

Camera/receipt B1 has a source implementation because the user explicitly asked that phone camera behavior be handled. It uses Expo's system image picker, asks permission at the point of use, disables microphone permission, resizes/copies photos on-device, persists drafts in SecureStore, recovers Android pending picker results during session hydration, and commits the receipt with the loan. The API limits and inspects image bytes and checks the authenticated owner on retrieval.

Physical camera, gallery, denied permission, app restart and Android Developer Options “Don't keep activities” remain manual verification tasks. Do not report B1 as device-verified before those checks pass. The baseline app can save entries without photos if permission is declined or no camera exists.

Search, reports and extra screens can follow separately. If reports are added, lend events use lent_on and repayments use repaid_on; baseline lent_on is recording date, so historical accounting requires a product change.

Real SMS, shared/distributed throttling, public hosting, privacy/deletion processes, backups/restore and store release are future production work. Local mock OTP is sufficient for the assignment, but cannot be called production authentication.

## 10. Traceability and definition of done

| Requirement | Phase | Proof |
|---|---|---|
| R1 backend stack | 1–2 | Source/build/migrations |
| R2 console mock OTP | 3 | Console event and login |
| R3 add API | 4 | Three required fields persist |
| R4 repay API | 4 | One atomic state transition |
| R5 summary API | 4 | Required three correct totals |
| R6 RN login | 3/5 | App journey |
| R7 highlighted overdue list | 5 | Past-due pending badge/surface |
| R8 form/top summary | 5 | Save and Ledger placement |
| B2 selected validation/tests | 2/4/6 | Errors and actual passing checks |
| B1 selected receipt bonus | 5/7 | Upload source, owner-only retrieval, device verification still pending |
| S1 GitHub/README | 7 | Actual URL and reproduction |
| S2 shared 2–3 minute video | 7 | Loom/Drive URL/duration/access |
| S3 code explanation | 7 | Interview notes/rehearsal |

Complete means real evidence for required R/S rows, selected B2 delivered and known limitations documented. The app source and local checks are implemented; PostgreSQL/device evidence and GitHub/video delivery remain open. Optional features and production work do not block submission.
