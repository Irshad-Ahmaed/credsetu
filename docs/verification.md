# MiniLedger verification record

Date: 23 October 2026

This record separates source checks from checks that need a running database or mobile device.

## Passed locally

- The mobile workspace is on Expo SDK 57 (`expo@57.0.31`), React Native 0.86.3 and React 19.2.3. The lockfile pins one React/React DOM instance across Expo and the mobile workspace.
- `npm test`: 48 tests passed (7 API business-rule tests, 14 Home data-flow/contract tests, 15 receipt download/viewer tests and 12 swipe/deletion tests). Receipt tests cover authorization headers, invalid links, expired sessions, missing receipts, unsupported/mismatched image data, size limits, timeouts, cancellation, retry, stale callbacks and temporary-file cleanup. Home tests cover out-of-order responses, cancellation, pagination retries/version changes, India midnight, malformed responses, expired sessions, duplicate repayment protection, failed writes and acknowledged repayments followed by refresh failure.
- `npm run typecheck`: API and React Native TypeScript checks passed.
- A root `.env` loading smoke test passed using a temporary, nonproduction config and left no `.env` file behind.
- All source modules changed in the Home/API recheck are under the 300-line limit; the largest changed module is `api/src/app.ts` at 258 lines. Ledger display, feedback, request state and response validation are separate modules.
- A read-only Neon PostgreSQL check passed for calendar-date parsing and the new dashboard queries. Empty-account results and the three existing ledgers passed the mobile dashboard validator within a repeatable-read snapshot. No database records were modified.
- The receipt recheck found one stored JPEG with matching stored/actual lengths and a valid signature; an in-memory image decode succeeded. Receipt bytes were not written to the workspace and no database records were modified. Native on-device receipt rendering remains to be checked.
- Android Metro export and Hermes compilation passed after the receipt viewer switched to authenticated binary downloads and temporary local image rendering.
- After the SDK 57 upgrade, `expo install --check` reports no SDK package mismatches using Expo's local SDK 57 dependency map. Networking was disabled, so this did not query the remote version service.
- `expo-doctor@1.21.5`: 21/21 checks passed after adding Expo Router's required SDK 57 peers and removing the obsolete `newArchEnabled` app config field.
- `expo prebuild --platform android --no-install`: completed. The generated Android manifest contains `CAMERA`, removes `RECORD_AUDIO`, and limits legacy storage permissions to API 32.
- Android Metro export completed and emitted the Hermes bundle after directing temporary output into the workspace. A fresh export passed in this recheck after adding guards against discarding a draft during submission or native photo selection; this checks JS bundling, not an installable APK.
- `npm audit --workspace api --omit=dev`: 0 vulnerabilities in API production dependencies.
- `npm ls decode-uri-component --all --depth=8` resolves Expo Router 57's `query-string` to the local `0.5.0-miniledger.1` CommonJS adapter. Tests cover valid, malformed and large malformed URI values, and Metro export verifies the patched CommonJS module bundles through Expo Router.

- Migration 002 was applied to the configured Neon database. Rollback-only deletion checks passed for ownership, repeated deletes, receipt-byte removal, exact totals, empty-dashboard validation and retained create-retry keys. Existing user entries were not deleted.
- Two swipe/deletion reviews covered response races, pagination invalidation, gesture cleanup and the last-card empty-state action guard. Native swipe behavior still needs physical-device acceptance.
- The swipe/deletion Android export emitted metadata, assets and a Hermes bundle. Receipt and Delete actions include pressed and disabled feedback; summary metrics adapt to large system text. Physical-device visual acceptance remains pending.

## Not run

- Full HTTP write/concurrency integration tests for create, receipt upload, idempotent retry and repayment against Neon were not executed in the Home recheck. The configured Neon connection and dashboard read queries were verified without Docker.
- The API process started with validated development config, but the sandbox blocked the HTTP smoke-test socket, so endpoint responses were not verified over HTTP.
- Android Gradle build or app launch: Android Debug Bridge/emulator is unavailable. The native project was generated but not compiled or installed.
- Physical camera, permission denial, gallery fallback, app restart and Android Developer Options “Don't keep activities” flows: must be exercised on a device or emulator.
- iOS native project generation and camera permissions: Expo CLI skipped iOS project generation on Windows. The Expo ImagePicker plugin carries the configured camera/photo usage strings into an iOS build.
- GitHub publication and 2–3 minute screen recording: no repository or recording has been published.

## Dependency audit

The live full-workspace `npm audit` after the SDK 57 upgrade reports 19 high-severity advisory entries, including Expo/Metro and React Native build dependencies. Its automatic fix recommendation downgrades Expo to 44 and React Native to 0.72, which breaks the requested SDK 57 setup; do not run `npm audit fix --force`. Review Expo-compatible upstream patches before changing those build dependencies. The API production dependency audit remains clean at the last API-only check.

The audit includes the known `braces@3.0.3` and `node-forge@1.4.0` findings: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv). Expo Router 57 imports `query-string@7.1.3` through CommonJS, so the decoder uses a local CommonJS adapter of upstream `decode-uri-component@0.5.0`; a plain override to upstream 0.5.0 would fail because that package declares ESM-only exports. The adapter source, compatibility note and MIT license are in `vendor/decode-uri-component-cjs`, and a lockfile-pinned tarball keeps Windows installs from needing symlink privileges.

## Device acceptance still required

On Android, test login, entry creation, repayment and summary against PostgreSQL, then test photo cancel, camera permission allow/deny, gallery fallback, background/resume, process/activity recreation, draft recovery and receipt retrieval. Also check 320/390/430 dp widths, large text, the keyboard, safe areas and back navigation. Record the device model, OS, build type and results here before describing these flows as verified.

