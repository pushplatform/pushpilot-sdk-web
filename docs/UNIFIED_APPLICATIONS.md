# Unified application SDK release

Version: 0.2.0. One application ID/key across SDKs and server. The key is deliberately extractable and grants device registration/read access and message sending/history only for that application; no organization/platform/billing administration.

No project/environment selection is needed. Optional legacy environment arguments remain compatible. APNs sandbox/production follows the build entitlement and is a transport property. Native SDK metadata includes real model/versions/locale/timezone/permission/device kind; Web reports unknown hardware kind. Test subscription is a separate console flag.

Validation on 2026-11-01: Android 170 tests and release Maven staging; iOS metadata tests plus 21 affected API/token integration tests on Simulator; RN 98 JS tests, Expo plugin tests, packed-distribution Maven/Pod probes and actual Android/iOS consumer builds; Flutter 74 tests and actual Android/iOS consumer builds. Web 91 unit tests, 11 browser scenarios headless and the actual notification display scenario in a visible macOS browser (headless macOS resolves showNotification without retaining a visible notification). The actual built Web SDK also registered through the unified real API and origin policy in console acceptance.

Console acceptance uses a disposable postgres database and real queue/worker with guarded mock transports. Same key registers iOS/Android/Web; two native devices share an External ID, metadata/tags/test-marker persist; composer creates one message/two accepted mock deliveries. No real push, credentials exchange with Apple/Firebase, or charging occurred. Real device/provider delivery still requires the customer's actual APNs/Firebase/Web credentials, OS permission and signed builds.

## Publication verified on 2026-11-01

Web 0.2.0 is published to npm; `latest` points to 0.2.0. The public tarball was downloaded anonymously and is byte-for-byte identical to the previously validated 25-file candidate. Registry SHA-1/SHA-512 integrity matches. SHA-256: `9c0e7f8ff8fdb29227ebe70c58825c5d18b3beaefc63be5091df4dd8a248e0e1`. Source tag `v0.2.0` points to merged main `7052d1969c8f713ceb476e4fda7c9fd2128d20af`. The existing candidate was published with `--ignore-scripts` after npm browser confirmation; tests/builds were not repeated for publication. [PR #4](https://github.com/pushplatform/pushpilot-sdk-web/pull/4).

## CI follow-up, 2026-11-01

The Ubuntu workflow exposed a Playwright collection error: worker-scoped `headless` cannot be set inside `test.describe`. The OS notification test now lives in its own spec with file-level configuration; shared browser fixtures were extracted without changing assertions. Eleven runtime tests remain headless, while the notification test uses a window only on macOS. Both artifact uploads explicitly include their enumerated `.artifacts` files. Local `npm run release:check` passed: 91 unit tests, package/clean consumer validation and all 12 browser tests. This changes only test/CI configuration, not published runtime behavior.
