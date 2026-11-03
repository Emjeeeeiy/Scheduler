// Metro (Expo SDK 52) already detects the npm-workspaces root, so the shared
// package is watched without extra config. What it does NOT do by default is
// read a package's "exports" map, and @cadence/shared is exposed only through
// one ("@cadence/shared/date.js" -> src/date.js) — the same specifiers the web
// app and Node use. Without this flag Metro looks for packages/shared/date.js.
// .cjs because this workspace is "type": "module" and Metro loads its config
// with require().
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
config.resolver.unstable_enablePackageExports = true

module.exports = config
