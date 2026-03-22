# Contributing to Kagora

Thanks for your interest in contributing to Kagora! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/dead1786/kagora.git
cd kagora
npm install
npm run dev
```

**Requirements:**
- Node.js 20+
- Windows: VS Build Tools with C++ workload + Python 3 (`pip install setuptools`)
- macOS: `xcode-select --install`
- Linux: `sudo apt install build-essential python3`

## Project Structure

```
src/
  main/           # Electron main process
    index.ts        # App entry, IPC handlers
    terminal-manager.ts  # PTY management
    chat-store.ts   # Message persistence
    scheduler.ts    # Automation scheduler
    plugin-loader.ts # Plugin system
  renderer/       # Vue 3 frontend
    src/
      components/   # UI components
      stores/       # Pinia stores
      i18n/         # Translations
  preload/        # Electron preload bridge
plugins/          # Plugin directory (drop-in JS plugins)
tests/            # Vitest test suite
```

## How to Contribute

### Bug Reports

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- OS and Node.js version
- Screenshot if applicable

### Feature Requests

Open an issue with `[Feature]` prefix. Describe the use case, not just the solution.

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Add tests if applicable
4. Run `npm test` to make sure all tests pass
5. Submit the PR

### Writing Plugins

Kagora has a plugin system — you can extend it without touching core code:

1. Create a folder in `plugins/` with a `manifest.json`
2. Implement your plugin in `index.js`
3. Use the Plugin Context API (chat, terminal, webhook, scheduler, events)
4. See `plugins/hello-world/` for a working example

### Translations

We support i18n. To add a new language:

1. Copy `src/renderer/src/i18n/en.ts` to your locale file
2. Translate the strings
3. Register it in the i18n config
4. Submit a PR

## Code Style

- TypeScript for main/renderer code
- Use existing patterns — check similar files before writing new code
- No unnecessary dependencies

## Testing

```bash
npm test
```

We use Vitest. Tests live in `tests/`. Aim for coverage on new features.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
