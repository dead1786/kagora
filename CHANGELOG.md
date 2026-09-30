# Changelog

All notable changes to Kagora will be documented in this file.

## [Unreleased]

### Changed
- Upgraded `electron` from `42.11.8` to `44.5.0` (43 and 44 major lines). Reviewed the 43/44 breaking changes (Electron `clipboard` module removed from renderers, workers/DevTools preload changes, Linux frameless rounded corners, dialog `defaultPath`, 32-bit builds dropped); none affect Kagora (renderer uses the web `navigator.clipboard`), so no source changes were required

### Security
- Patched `tar` critical vulnerability (process crash / DoS via PAX numeric path type confusion, unbounded decompression, and related advisories) and `postcss`, `js-yaml`, `fast-uri` high-severity advisories via `npm audit fix` (non-breaking, lockfile-only)
- Bumped `electron` from `42.2.0` to `42.7.1` (latest patch in the 42.x line) to pick up upstream Chromium/Electron security fixes; no code changes required
- Bumped `electron` from `42.7.1` to `42.11.8` (latest in the 42.x line); 42.7.1 was affected by several high-severity advisories published 2026-08-29 (sandbox inheritance for popups/windows, `<webview>` Node.js integration in Web Workers, cross-origin reads via file/HTTP protocol handlers, sandboxed preload code cache poisoning) fixed in 42.9.2/42.10.0 and later. Also bumped `@electron/rebuild` to `4.2.0`; no code changes required
- Patched `undici` (WebSocket permessage-deflate DoS), `vitest`/`@vitest/mocker` advisories and `js-yaml` via `npm audit fix` (non-breaking); vitest now dedupes onto the project's vite 7

### Fixed
- **Automation PATCH / IPC update missing field sanitization** — `PATCH /api/automations/:id` and the IPC `automations:update` handler passed unsanitized `schedule` and `description` fields directly to the store. Both paths now apply the same length caps and allowlisting used by the POST handler (`schedule` ≤ 64, `description` ≤ 512, `method` restricted to `chat`/`inject`, `target` validated via `isValidId`). Arbitrary data can no longer be written to `automations.json` via the update path.
- **ChatStore message cap off-by-one** — Trigger condition was `> 5000` (fired at 5001, trimming 501 messages); corrected to `>= 5000` so it fires at exactly 5000 and trims exactly 500, matching the comment "trim oldest 500 when exceeded"

### Performance
- **ChatStore: separate message and agent persistence** — Split the combined `save()` method into `saveMessages()` and `saveAgents()` so that `addMessage()` and `clearMessages()` no longer redundantly rewrite `agents.json` on every message. Agent mutations still flush only `agents.json`. Reduces disk I/O significantly in high-frequency chat scenarios (e.g. multi-AI group channels).

### Chore
- Synced `package-lock.json` root version field to match `package.json` 0.4.3 (was left at 0.4.2 during release)
- Patched `ip-address` XSS vulnerability via `npm audit fix` (non-breaking)

## [0.4.3] - 2026-04-08

### Added
- **Monthly schedule support** — New `monthly:DD:HH:MM` format (e.g. `monthly:01:08:00`) for automations that run once per month on a specific day
- **Monthly scheduler tests** — 4 tests covering `parseSchedule` and `shouldRun` for the new monthly type

### Security
- Updated `package-lock.json` dependencies via `npm audit fix` (reduces vulnerabilities in dev deps)

## [0.4.2] - 2026-03-31

### Added
- **Weekly schedule support** — New `weekly:DAY:HH:MM` format (e.g. `weekly:MON:09:00`) for automations that run once per week on a specific day
- **Scheduler unit tests** — 21 tests covering `parseSchedule` and `shouldRun` for interval, daily, weekly, and cron formats

### Changed
- Refactored scheduler internals: `parseSchedule` and `shouldRun` are now exported functions for better testability
- Added input validation for daily/weekly schedules (reject invalid hours > 23 or minutes > 59)

## [0.4.1] - 2026-03-27

### Fixed
- **i18n: chat timestamps now respect language setting** — Previously hardcoded to `zh-TW` locale in ChatPanel and DMLogPanel; now uses the correct locale based on the user's selected language (en/zh-TW/zh-CN/ja/ko)
- **README: fix incorrect API field names** — `POST /api/chat` example used wrong fields (`channel`/`sender`/`content`); corrected to `from`/`to`/`text`

### Security
- Patch `brace-expansion` and `picomatch` vulnerabilities via `npm audit fix` (17 -> 15 remaining, rest require major dep upgrades)

## [0.4.0] - 2026-03-23

### Added
- **System Monitor Dashboard plugin** — Real-time system monitoring with CPU, memory, uptime, and agent status
  - HTML dashboard at `/api/plugins/system-monitor/dashboard`
  - JSON API: `/api/plugins/system-monitor/status` and `/history`
  - Canvas-based CPU & memory trend chart (60 data points)
  - Auto-refresh every 10 seconds, 1-hour history retention
- Dark/light theme toggle (closes #3)

### Fixed
- Korean (ko) translation was already included in v0.3.0 (closes #1)

## [0.3.0] - 2026-03-22

### Added
- **Plugin system** — Load JS plugins from `plugins/` directory with manifest-based discovery
- Plugin Context API: chat, terminal, webhook, scheduler, events, logger
- Webhook routing: plugins register HTTP endpoints at `/api/plugins/<id>/<path>`
- Event system: subscribe to `chat:message`, `agent:added`, `agent:removed`, `terminal:data`, `terminal:exit`
- Interval scheduler for plugins
- Hello-world example plugin with full API demonstration
- 9 new plugin system tests (total: 30 tests)
- Plugin system documentation in README

## [0.2.1] - 2026-03-20

### Security
- Fix timing-safe token comparison to prevent length leakage via SHA-256 hashing
- Implement `?token=` query parameter authentication (was documented but not implemented)

### Fixed
- Prevent ghost agent cards when backend rejects `addAgent` (wait for confirmation before updating UI state)

### Added
- CHANGELOG.md for tracking version history

## [0.2.0] - 2026-03-09

### Added
- Admin mode with agent status indicators
- Inject queue for reliable message delivery
- Ctrl+Enter support for multi-line input
- i18n support (English, Traditional Chinese, Japanese)
- UI font size configuration
- Compact header mode
- Welcome screen for first-time users
- Startup memory (remembers last active view)
- Automation notes field
- DM target validation before routing

### Fixed
- DM log and automations panel scroll issues
- Agent activity detection and pulse animation visibility
- Inject queue stuck when concurrent messages interleave
- PTY auto-creation on startup
