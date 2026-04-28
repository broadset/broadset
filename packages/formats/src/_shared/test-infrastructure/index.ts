export * from './assert-re-importable';
export * from './chain-round-trip';
// `producer-fixtures` reads from `node:fs` / `node:path` and MUST NOT
// be re-exported here — the formats barrel is reachable from CT
// bundles (browser-side), and a Node-only import poisons the build.
// Test suites import it directly via
// `import { ... } from '../_shared/test-infrastructure/producer-fixtures'`.
