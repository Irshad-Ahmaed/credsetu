# MiniLedger interview guide

Use this to rehearse the code in your own words. The assignment allows AI tools, but expects you to explain the implementation.

## One-minute walkthrough

MiniLedger records money lent to friends. A React Native Expo app signs in with a phone number and a development OTP printed by the Node API. The API stores users, OTP challenges, sessions and loans in PostgreSQL. The Ledger screen loads the summary and a paginated owned-loan list; overdue status is derived from the due date in India time. The Add Entry screen validates the friend, exact INR amount and due date, then sends an idempotent create request. A pending loan can be marked fully repaid. Receipt photos are optional and stored with their loan.

## Explain the important decisions

- **Money:** the UI accepts rupees but converts to integer paise; API and database keep paise as decimal strings/BIGINT. This avoids floating-point rounding.
- **Dates:** due dates are calendar dates, not timestamps. The server assigns `lent_on` and uses Asia/Kolkata to decide whether a pending loan is overdue. A due date today is not overdue; a past due date can be entered intentionally.
- **OTP and sessions:** the server generates a random six-digit development code, stores only an HMAC digest, expires it after five minutes, limits attempts and consumes it once. The opaque session token is returned once while only its hash is stored. Mock OTP is blocked outside development.
- **Ownership:** every loan query includes the authenticated user ID. A UUID is not treated as authorization.
- **Retries and repayment:** Add Entry saves a submission key and payload locally before sending. The server stores a unique user/key pair and payload fingerprint, so the same retry returns the original record while changed data conflicts. Repayment is a conditional pending-to-repaid update, preventing a second full repayment.
- **Summary:** total lent equals repaid plus pending. Overdue is a subset of pending, so it is shown separately but never added twice.
- **Camera lifecycle:** MiniLedger opens the system camera or photo picker instead of embedding a camera preview in the form. It asks permission after an explicit tap, saves the draft before leaving the app, resizes/copies the image to private storage, and checks Expo's Android pending picker result during session hydration after Activity recreation. The API verifies image signatures and ownership.
- **Navigation and layout:** Expo Router guards authenticated routes. The Ledger refreshes on focus/foreground and India date rollover. Forms use safe areas, keyboard-aware scrolling, accessible labels, status text plus color and controls at least 48 dp high.
- **React structure:** screens compose shared input, summary, loan-row and empty-state components. `useLedger` subscribes to a user-scoped ledger store with `useSyncExternalStore`. Requests have cancellation and generation checks; tests control response order to verify stale requests cannot overwrite current data. The add screen uses `usePreventRemove` to persist its draft before a back action, and serializes SecureStore updates so a delayed save cannot overwrite the newest photo or fields.
- **Home consistency:** `/v1/dashboard` reads totals and the first entry page in one read-only, repeatable-read PostgreSQL transaction. Pagination includes a ledger version based on all-created, all-repaid and deleted counts; these monotonic counts cover insertion, full repayment and deletion, including delete/insert combinations with unchanged visible totals. When the version or India business date changes, Home reloads the dashboard rather than combining pages from different states.
- **Uncertain creates:** after a timeout, the form locks its submitted payload and retries with the same UUID key. This prevents an edited payload from colliding with a request that may already have committed; a user can return to the ledger and inspect the result before starting a new entry.

## Be ready to discuss these limits

- OTP delivery is a local mock printed in the API terminal; there is no SMS provider.
- Rate-limit counters are in memory and reset when the API restarts.
- Receipt bytes are stored in PostgreSQL for this small demo; a production app would use managed object storage and lifecycle controls.
- Deletion is owned and idempotent. It clears receipt bytes and marks the row deleted while retaining the submission key, so an old create retry cannot recreate the entry. All list/summary/repayment/receipt reads exclude deleted rows. Horizontal swipes and the visible Delete action share one confirmation and mutation guard; failed deletes retain the card until a server response/refresh confirms removal.
- Unit tests and typechecks pass, but PostgreSQL/API integration, native build and real camera lifecycle checks still need a database and device. See [verification](./verification.md).
- The app is not a payment processor, and it does not support partial repayments, interest, reminders or editing/deleting entries.

## Practice questions

1. What happens if the create request reaches PostgreSQL but the response is lost?
2. Why is the due date a date-only value, and who decides the recording date?
3. How does the server prevent one user from reading another user's receipt?
4. What does the app do when Android recreates its Activity while the camera is open?
5. Why does marking a loan repaid use a conditional update?
6. Which checks have you personally run, and which still require a phone/database?

