# CommonJS compatibility build

This local package adapts the MIT-licensed `decode-uri-component` 0.5.0 decoder
to CommonJS so Expo Router 57 can keep using its `query-string` 7 dependency.
The upstream 0.5.0 release fixes GHSA-vcc3-ghjq-m6fr but declares ESM-only
exports; Expo Router 57 calls `query-string` through `require()`, so a direct
npm override to the upstream package fails at runtime.

The decoder implementation is adapted from
https://github.com/SamVerschueren/decode-uri-component/tree/v0.5.0 and the
upstream MIT license is included in `LICENSE`. Remove this adapter when Expo
Router's dependency chain adopts a compatible patched release.
