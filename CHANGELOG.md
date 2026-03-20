# Changelog

All notable changes to Kagora will be documented in this file.

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
