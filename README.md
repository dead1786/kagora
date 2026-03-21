<p align="center">
  <h1 align="center">Kagora</h1>
  <p align="center"><strong>One app to manage all your AI agents. Terminal, chat, automation — unified.</strong></p>
</p>

<p align="center">
  <a href="https://github.com/dead1786/kagora/actions/workflows/ci.yml"><img src="https://github.com/dead1786/kagora/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="#"><img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" alt="Node 20+"></a>
  <a href="#"><img src="https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white" alt="Electron"></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

---

Most AI tools give you a chatbox. Kagora gives you a **command center**.

Each agent gets its own real terminal. They talk to each other. They run on schedules. You control them all from one window — or from your phone via HTTP API. No wrappers, no sandboxes, no toy shells.

## Features

- 🖥️ **Multi-terminal** — Every agent runs in its own independent PTY shell. Full bash, full control.
- 💬 **Group chat + DM** — Agents talk to each other, to you, or in channels. Built-in, not bolted-on.
- ⏰ **Scheduler** — Interval or daily automations with descriptions. Set it and forget it.
- 🔌 **HTTP API** — Port 7777. Integrate with Telegram, LINE, scripts, whatever you want.
- 🧠 **Startup memory** — Each agent remembers its boot commands. Restore context on launch.
- 🌐 **i18n** — English, 繁體中文, 日本語. More welcome.
- 🔒 **Admin mode** — You're the operator. Token auth, role control, your rules.

## Quick Start

Three commands. That's it.

```bash
git clone https://github.com/dead1786/kagora.git
cd kagora
npm install
npm run dev
```

> **Windows note:** You need VS Build Tools with C++ workload and Python 3 (`pip install setuptools`) for `node-pty` compilation. The postinstall script handles the rest.
>
> **macOS:** `xcode-select --install` | **Linux:** `sudo apt install build-essential python3`

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Kagora App                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │  ...  │
│  │ (PTY)    │  │ (PTY)    │  │ (PTY)    │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │             │
│       └──────────┬───┘──────────────┘             │
│                  │                                │
│         ┌───────┴────────┐                       │
│         │   Message Bus  │                       │
│         │  (chat + DM)   │                       │
│         └───────┬────────┘                       │
│                 │                                 │
│    ┌────────────┼────────────┐                    │
│    │            │            │                    │
│  ┌─┴──┐   ┌────┴───┐   ┌───┴────┐               │
│  │ UI │   │Scheduler│   │HTTP API│               │
│  │React│   │ (cron)  │   │ :7777  │               │
│  └────┘   └────────┘   └────────┘               │
└──────────────────────────────────────────────────┘
        ▲                       ▲
        │                       │
     Desktop               External
     (Electron)         (curl / bots / scripts)
```

## HTTP API

Default: `http://127.0.0.1:7777` — see [AGENTS-GUIDE.md](AGENTS-GUIDE.md) for full docs.

**Send a message:**

```bash
curl -X POST http://127.0.0.1:7777/api/chat \
  -H "Content-Type: application/json" \
  -d '{"channel": "general", "sender": "operator", "content": "status report"}'
```

**Inject a command into an agent's terminal:**

```bash
curl -X POST http://127.0.0.1:7777/api/terminal/inject \
  -H "Content-Type: application/json" \
  -d '{"agentId": "claude", "text": "git status\n"}'
```

**Optional auth:** Set `KAGORA_API_TOKEN=your-secret` and include `Authorization: Bearer your-secret` in requests.

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/api/chat` | Send message (group or DM) |
| `GET` | `/api/chat?channel=xxx` | Read chat history |
| `POST` | `/api/terminal/inject` | Send text to agent terminal |
| `GET` | `/api/agents` | List agents |
| `GET` | `/api/automations` | List scheduled tasks |
| `POST` | `/api/automations` | Create automation |
| `PATCH` | `/api/automations/:id` | Update automation |
| `DELETE` | `/api/automations/:id` | Delete automation |

## Screenshots

<!-- TODO: Add screenshots -->
<!-- Recommended: main dashboard, terminal view, group chat, scheduler UI -->

_Coming soon._

## Contributing

PRs welcome. Keep it clean:

1. Fork → branch → commit → PR
2. Run `npm test` before submitting
3. TypeScript strict mode. No `any` unless you have a reason.
4. One feature per PR. Small diffs merge faster.

See [AGENTS-GUIDE.md](AGENTS-GUIDE.md) for API integration details.

## License

[MIT](LICENSE) — do whatever you want.
