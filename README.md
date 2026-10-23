# MiniLedger

MiniLedger is a React Native app and Node.js/PostgreSQL API for keeping a small ledger of money lent to friends. It supports development phone + mock OTP login, a summary above the entry list, overdue highlighting, adding entries, marking them repaid and attaching a receipt photo from the camera or photo library.

The mock OTP is printed in the API terminal. No SMS is sent. Do not deploy this mode as a public authentication service.

## Requirements

- Node.js 24 LTS and npm 11
- Docker Desktop with Compose, a local PostgreSQL 17 database, or a Neon PostgreSQL database
- Expo Go compatible with SDK 57 for a preview; a development build may be needed for native configuration changes
- A phone and computer on the same network when using a physical device

## First run

From the repository root in PowerShell:

    Copy-Item .env.example .env
    npm install
    npm run db:up
    npm run db:migrate
    npm run db:seed

The example environment uses a local development database and placeholder session secret. Replace SESSION_SECRET with a random value of at least 32 characters before starting the API. The API loads the repository-root .env.

### Use Neon instead of Docker

Create or select a Neon development database, then copy its pooled PostgreSQL connection string from the Neon dashboard into DATABASE_URL in the repository-root .env. Keep sslmode=require in the URL and never commit or share the connection string. Do not run npm run db:up when using Neon. Apply the app schema with:

    npm run db:migrate

The Neon database stores the data, but the phone app still sends requests through the MiniLedger API running on your computer. Keep npm run dev:api running while using the app. Confirm Neon is reachable and migrated at http://localhost:4000/v1/ready; it should return status ready.

The seed creates four example entries for +919999000001 and two for +919999000002. Sign in with either number to see its own ledger and verify account isolation. The first account includes past-due, due-today and future-due pending loans plus a repaid loan. Seed dates are relative to India date when the command runs. Rerunning the seed resets only these two demo ledgers.

### Run the API

In one terminal:

    npm run dev:api

The API listens on port 4000. Health check: http://localhost:4000/v1/health.

### Run the mobile app

For the Android emulator, copy mobile/.env.example to mobile/.env and set:

    EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/v1

For a physical phone, use your computer's LAN IP instead, e.g. http://192.168.1.20:4000/v1. Phone localhost points to the phone itself. Keep both devices on the same network and allow Node through the computer firewall on private networks.

In another terminal:

    npm run dev:mobile

Scan the Expo QR code with an Expo Go build compatible with SDK 57. On Android, install the SDK 57 build from [expo.dev/go](https://expo.dev/go?device=true&platform=android&sdkVersion=57); the latest Expo Go targets SDK 58 and will reject this SDK 57 app. A physical iPhone needs an EAS Go build or a development build for SDK 57. If you change native permissions or Expo SDK packages, restart Metro with a cleared cache and rebuild the development client.

## Sign in with mock OTP

1. Enter a 10-digit Indian phone number and tap Send demo code.
2. Find the line starting [DEV OTP] in the terminal running npm run dev:api.
3. Enter the six-digit code in the app. It expires after five minutes; resend is limited by a 30-second cooldown.
4. No SMS is sent. The development code is intentionally printed to the server console. The database stores a keyed digest rather than the code.

## App behavior

- Friend name, amount in INR and due date are required. Past due dates are allowed to record an already-overdue loan.
- Lent date is assigned by the server as the record date. Calendar dates use Asia/Kolkata.
- Amounts use integer paise strings end to end, avoiding floating-point money errors.
- The top summary shows total lent, total repaid, pending repayment and overdue. Overdue is already included in pending.
- Mark as repaid records one full repayment. Repeating the request cannot apply it twice.
- A per-entry save key is stored with the draft so an uncertain network retry will not duplicate an entry.
- If a create request has an uncertain result, the form keeps its submitted values locked and retries with the same key. Check the ledger before discarding an uncertain save and starting another entry.
- Leaving the add form saves its current draft first. If local storage cannot complete that save, navigation stays on the form and shows an error.
- Cancel is disabled during a save or native photo picker, and discard rechecks in-flight work before clearing the draft or photo.
- Receipt photos are optional. The app asks for camera access only after Take photo, asks for no microphone access, resizes images on device, and stores a pending form in SecureStore. During Android session hydration it recovers the native picker result if the OS recreates the main Activity. The server checks JPEG/PNG/WebP file signatures, limits each image to 5 MB and stores it with its loan in PostgreSQL. Only the authenticated loan owner can retrieve a receipt.
- View receipt downloads the binary image with the session header, checks its MIME/signature/size, and displays a temporary local file. The viewer supports retry, session-expiry recovery and loading timeouts; it cancels stale requests and removes temporary files when closed or retried.
- Swipe an entry left or right to request deletion, then confirm. Small/vertical gestures cancel; the visible Delete action offers the same flow without swiping. Deletion persists in PostgreSQL, removes receipt bytes and excludes the entry from totals. A submission-key tombstone prevents an old create retry from restoring it. There is no in-app undo.
- If camera permission is denied, the user can open Settings or choose from the photo library. Without a camera, the entry form still works.
- Expo Router's current CommonJS query parser is pinned to the patched decoder compatibility build under `vendor/decode-uri-component-cjs`; its source and MIT license are included. Remove the adapter when Expo Router ships a CommonJS-compatible patched dependency.

## API routes

All loan/summary endpoints need Authorization: Bearer session-token.

| Method | Path | Purpose |
|---|---|---|
| GET | /v1/health | Liveness |
| GET | /v1/ready | Database readiness |
| POST | /v1/auth/request-otp | Request console mock code |
| POST | /v1/auth/verify-otp | Verify and create session |
| GET | /v1/auth/me | Restore/check session |
| POST | /v1/auth/logout | Revoke session |
| POST | /v1/loans | Create entry; JSON or multipart with optional receipt |
| GET | /v1/loans?page=1&limit=20 | List owned entries |
| PATCH | /v1/loans/:id/repay | Mark pending entry repaid |
| GET | /v1/loans/:id/receipt | Retrieve private image |
| DELETE | /v1/loans/:id | Delete an owned entry and receipt; safe to repeat after a lost response |
| GET | /v1/dashboard/summary | Exact totals |
| GET | /v1/dashboard | Summary and first 20 entries from one consistent database snapshot (Home screen) |

JSON create example:

    {
      "friend_name": "Amit Kumar",
      "amount_paise": "250050",
      "due_on": "2026-10-20"
    }

Include a UUID Idempotency-Key header. Multipart requests use friend_name, amount_paise, due_on and one file field named receipt. Receipts accept JPEG, PNG or WebP signatures; mobile photos are resized to JPEG. Maximum upload is 5 MB.

Summary returns total_lent_paise, total_repaid_paise, total_pending_paise and total_overdue_paise as decimal strings, plus business-date metadata. Users can only access their own entries.

## Useful commands

    npm run typecheck
    npm test
    npm run db:migrate
    npm run db:seed
    npm run db:down

db:down stops the local PostgreSQL container but preserves its named volume. Only use docker compose down -v when intentionally removing local demo data.

## Camera, navigation and layout checks

The app opens the native camera/gallery picker; it does not keep a live camera preview mounted inside the form. The flow saves the form and retry key before opening the system UI, requests camera permission only after a user tap, accepts still images without microphone permission, then resizes and copies the image into app-private documents. During Android session hydration, the app checks Expo's pending picker result because Android can recreate MainActivity while external camera UI is open. A saved entry and its photo are committed together so retry after a lost response uses the same key and photo.

Exercise picker cancel/back, denied permission, no-camera emulator, gallery fallback, camera return, background/resume, Android Developer Options “Don't keep activities,” network failure and app restart. Confirm form fields and photo draft survive picker return. Permission denial must never block saving without a photo. Test at 320/390/430 dp with large text and keyboard open. Check navigation return from add/receipt, and verify modal/back actions leave the list state intact. The app is intentionally portrait-locked.

Expo SDK 57 documents getPendingResultAsync for Android Activity recreation: https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/. Test this path on a native Android build; TypeScript checks cannot prove the platform callback behavior.

## Tests

npm test runs API business-rule tests and Home data-flow tests covering stale/cancelled requests, pagination retries, invalid responses, session expiry and repayment recovery. These tests do not prove physical camera behavior. Restart the API after updates before reloading Expo Go so the Home dashboard endpoint matches the mobile app.

The mobile UI is composed from reusable field, summary, loan-row and empty-state components. `useLedger` owns focus/foreground refresh and guarded pagination; form, auth and picker work stays in the corresponding screen hooks and helpers. Keep authored TypeScript, JavaScript and SQL files at 300 lines or fewer.

See PRODUCT_SPEC.md for scope/acceptance and IMPLEMENTATION_PLAN.md for build and evidence checklists. Record actual device/database/package checks; do not claim checks that were not run.

## Troubleshooting

- API cannot reach PostgreSQL: check DATABASE_URL in the repository-root .env and run npm run db:migrate. With Neon, verify the connection string is current and your computer can reach Neon; Docker and local port 5432 are not required.
- Save says it cannot reach MiniLedger: keep npm run dev:api running on the computer, use the computer's current LAN IP in mobile/.env, and open `http://YOUR-LAN-IP:4000/v1/ready` from the phone. Expo Metro on port 8081 only serves the mobile bundle; it is not the API.
- Phone cannot reach API: use the computer LAN IP in mobile/.env, not localhost.
- OTP missing: inspect the API terminal, confirm development mode, request again after cooldown.
- Code expired: request a new one and enter the latest [DEV OTP].
- Camera denied/unavailable: enable Camera in OS settings or choose a photo. Saving without a photo remains available.
- Image too large/invalid: choose a smaller image; server allows one verified JPEG/PNG/WebP up to 5 MB.
- Native module mismatch: clear Metro cache and use matching Expo Go or rebuild the development client.
- Port in use: change API_PORT in root .env and update the mobile API URL.

## Submission status

Actual GitHub and recording URLs belong in docs/submission.md after publication. This local workspace does not count as a published repository or shared recording. Use fictional names/numbers and never upload .env, tokens or private database content.
