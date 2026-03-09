import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import crypto from 'crypto'
import http from 'http'
import { TerminalManager, detectAvailableShells } from './terminal-manager'
import { ChatStore, type ChatMessage } from './chat-store'
import { Scheduler } from './scheduler'

const API_TOKEN = process.env.KAGORA_API_TOKEN || ''
const MAX_BODY_SIZE = 64 * 1024 // 64KB

// Input validation helpers
const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/
const SAFE_SHELL = /^[a-zA-Z0-9_\-\\/.:\s()]{1,256}$/

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

let mainWindow: BrowserWindow | null = null
let terminalManager: TerminalManager
let chatStore: ChatStore
let scheduler: Scheduler

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // Required for node-pty integration
      contextIsolation: true
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d1117',
      symbolColor: '#8b949e',
      height: 36
    },
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', () => {
    terminalManager.destroyAll()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupIPC() {
  // Terminal — embedded PTY via node-pty
  ipcMain.handle('terminal:create', (_e, agentId: string, shell?: string, adminMode?: boolean) => {
    const effectiveShell = shell || chatStore.getSettings().defaultShell || undefined
    terminalManager.create(agentId, effectiveShell, adminMode)
    return true
  })

  // Available shells for dropdown
  ipcMain.handle('shell:list', () => {
    return detectAvailableShells()
  })

  // Guide path for onboarding
  ipcMain.handle('app:guidePath', () => {
    const isDev = !!process.env.ELECTRON_RENDERER_URL
    if (isDev) {
      return join(process.cwd(), 'AGENTS-GUIDE.md')
    }
    return join(process.resourcesPath || process.cwd(), 'AGENTS-GUIDE.md')
  })

  ipcMain.on('terminal:input', (_e, agentId: string, data: string) => {
    terminalManager.write(agentId, data)
  })

  ipcMain.on('terminal:resize', (_e, agentId: string, cols: number, rows: number) => {
    terminalManager.resize(agentId, cols, rows)
  })

  ipcMain.handle('terminal:destroy', (_e, agentId: string) => {
    terminalManager.destroy(agentId)
    return true
  })

  // Chat
  ipcMain.handle('chat:send', (_e, from: string, to: string, text: string) => {
    const msg = chatStore.addMessage(from, to, text)
    mainWindow?.webContents.send('chat:message', msg)

    // Bridge: inject group messages into all agent terminals (queued to avoid interrupting typing)
    if (to === 'group') {
      const agents = chatStore.getAgents()
      for (const agent of agents) {
        if (agent.id !== from) {
          terminalManager.inject(agent.id, `[Kagora] ${from}: ${text}\r`)
        }
      }
    }
    // Bridge: inject DM into target agent terminal
    if (to !== 'group') {
      terminalManager.inject(to, `[Kagora DM] ${from}: ${text}\r`)
    }

    return msg
  })

  ipcMain.handle('chat:history', (_e, channel: string) => {
    return chatStore.getMessages(channel)
  })

  // Agent management
  ipcMain.handle('agent:list', () => {
    return chatStore.getAgents()
  })

  ipcMain.handle('agent:add', (_e, agent: any) => {
    if (!isValidId(agent?.id) || typeof agent?.name !== 'string' || typeof agent?.color !== 'string') {
      return false
    }
    if (agent.shell && !SAFE_SHELL.test(agent.shell)) return false
    chatStore.addAgent({
      id: agent.id,
      name: agent.name.slice(0, 64),
      color: agent.color.slice(0, 20),
      shell: agent.shell || undefined,
      status: agent.status === 'online' ? 'online' : 'offline'
    })
    return true
  })

  ipcMain.handle('agent:update', (_e, id: string, partial: any) => {
    const safe: Record<string, unknown> = {}
    if (typeof partial?.startupCommand === 'string') safe.startupCommand = partial.startupCommand.slice(0, 4096)
    if (partial?.startupCommand === null) safe.startupCommand = undefined
    if (typeof partial?.color === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(partial.color)) safe.color = partial.color
    if (typeof partial?.adminMode === 'boolean') safe.adminMode = partial.adminMode
    chatStore.updateAgent(id, safe)
    return chatStore.getAgents()
  })

  ipcMain.handle('agent:remove', (_e, id: string) => {
    terminalManager.destroy(id)
    chatStore.removeAgent(id)
    return true
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return chatStore.getSettings()
  })

  ipcMain.handle('settings:update', (_e, partial: any) => {
    const safe: Record<string, unknown> = {}
    if (typeof partial?.adminName === 'string') safe.adminName = partial.adminName.slice(0, 64)
    if (typeof partial?.defaultShell === 'string') {
      if (partial.defaultShell === '' || SAFE_SHELL.test(partial.defaultShell)) {
        safe.defaultShell = partial.defaultShell
      }
    }
    if (typeof partial?.terminalFontSize === 'number') {
      safe.terminalFontSize = Math.max(8, Math.min(32, partial.terminalFontSize))
    }
    if (typeof partial?.uiFontSize === 'number') {
      safe.uiFontSize = Math.max(10, Math.min(24, partial.uiFontSize))
    }
    if (typeof partial?.language === 'string' && ['en', 'zh-TW', 'zh-CN', 'ja', 'ko'].includes(partial.language)) {
      safe.language = partial.language
    }
    if (typeof partial?.clearChatOnExit === 'boolean') safe.clearChatOnExit = partial.clearChatOnExit
    chatStore.updateSettings(safe)
    return chatStore.getSettings()
  })

  // Automations
  ipcMain.handle('automations:list', () => {
    return chatStore.getAutomations()
  })

  ipcMain.handle('automations:add', (_e, auto: any) => {
    if (typeof auto?.name !== 'string' || typeof auto?.script !== 'string' ||
        typeof auto?.schedule !== 'string' || !isValidId(auto?.target)) return null
    if (auto.method !== 'chat' && auto.method !== 'inject') return null
    return chatStore.addAutomation({
      name: auto.name.slice(0, 128),
      description: typeof auto.description === 'string' ? auto.description.slice(0, 512) : undefined,
      script: auto.script.slice(0, 4096),
      target: auto.target,
      schedule: auto.schedule.slice(0, 64),
      method: auto.method,
      enabled: auto.enabled !== false
    })
  })

  ipcMain.handle('automations:update', (_e, id: string, partial: any) => {
    chatStore.updateAutomation(id, partial)
    return chatStore.getAutomations()
  })

  ipcMain.handle('automations:remove', (_e, id: string) => {
    chatStore.removeAutomation(id)
    return true
  })
}

function startChatAPI() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // API token authentication (optional, set KAGORA_API_TOKEN env var)
    if (API_TOKEN) {
      const auth = req.headers.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token || !timingSafeEqual(token, API_TOKEN)) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
    }

    // Parse pathname for routing (strip query params)
    const pathname = (req.url || '/').split('?')[0]

    // List all agents
    if (req.method === 'GET' && pathname === '/api/agents') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(chatStore.getAgents()))
      return
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      let body = ''
      let overflow = false
      req.on('data', (chunk: Buffer) => { body += chunk; if (body.length > MAX_BODY_SIZE) overflow = true })
      req.on('end', () => {
        if (overflow) { res.writeHead(413); res.end('Body too large'); return }
        try {
          const { from, to, text } = JSON.parse(body)
          const dest = to || 'group'
          const msg = chatStore.addMessage(from, dest, text)
          mainWindow?.webContents.send('chat:message', msg)

          // Bridge: inject into target terminals (queued to avoid interrupting typing)
          if (dest === 'group') {
            const agents = chatStore.getAgents()
            for (const agent of agents) {
              if (agent.id !== from) {
                terminalManager.inject(agent.id, `[Kagora] ${from}: ${text}\r`)
              }
            }
          } else {
            terminalManager.inject(dest, `[Kagora DM] ${from}: ${text}\r`)
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(msg))
        } catch {
          res.writeHead(400)
          res.end('Invalid request')
        }
      })
      return
    }

    if (req.method === 'GET' && pathname === '/api/chat') {
      const url = new URL(req.url, 'http://localhost')
      const channel = url.searchParams.get('channel') || 'group'
      const messages = chatStore.getMessages(channel)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(messages))
      return
    }

    // Inject text into agent terminal
    if (req.method === 'POST' && pathname === '/api/terminal/inject') {
      let body = ''
      let overflow = false
      req.on('data', (chunk: Buffer) => { body += chunk; if (body.length > MAX_BODY_SIZE) overflow = true })
      req.on('end', () => {
        if (overflow) { res.writeHead(413); res.end('Body too large'); return }
        try {
          const { agentId, text } = JSON.parse(body)
          if (!isValidId(agentId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid agentId' }))
            return
          }
          if (typeof text !== 'string' || text.length > 8192) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid or too long text' }))
            return
          }
          if (!terminalManager.has(agentId)) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Agent not found' }))
            return
          }
          terminalManager.write(agentId, text)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end('Invalid request')
        }
      })
      return
    }

    // Automations API
    if (req.method === 'GET' && pathname === '/api/automations') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(chatStore.getAutomations()))
      return
    }

    if (req.method === 'POST' && pathname === '/api/automations') {
      let body = ''
      let overflow = false
      req.on('data', (chunk: Buffer) => { body += chunk; if (body.length > MAX_BODY_SIZE) overflow = true })
      req.on('end', () => {
        if (overflow) { res.writeHead(413); res.end('Body too large'); return }
        try {
          const data = JSON.parse(body)
          if (!isValidId(data?.target) || typeof data?.name !== 'string' ||
              typeof data?.script !== 'string' || typeof data?.schedule !== 'string' ||
              (data.method !== 'chat' && data.method !== 'inject')) {
            res.writeHead(400); res.end('Invalid automation data'); return
          }
          const auto = chatStore.addAutomation({
            name: data.name.slice(0, 128),
            script: data.script.slice(0, 4096),
            target: data.target,
            schedule: data.schedule.slice(0, 64),
            method: data.method,
            enabled: data.enabled !== false
          })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(auto))
        } catch {
          res.writeHead(400)
          res.end('Invalid request')
        }
      })
      return
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/automations/')) {
      const id = pathname.slice('/api/automations/'.length)
      let body = ''
      let overflow = false
      req.on('data', (chunk: Buffer) => { body += chunk; if (body.length > MAX_BODY_SIZE) overflow = true })
      req.on('end', () => {
        if (overflow) { res.writeHead(413); res.end('Body too large'); return }
        try {
          const partial = JSON.parse(body)
          if (partial.target && !isValidId(partial.target)) { res.writeHead(400); res.end('Invalid target'); return }
          if (partial.script && typeof partial.script === 'string') partial.script = partial.script.slice(0, 4096)
          if (partial.name && typeof partial.name === 'string') partial.name = partial.name.slice(0, 128)
          chatStore.updateAutomation(id, partial)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end('Invalid request')
        }
      })
      return
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/automations/')) {
      const id = pathname.slice('/api/automations/'.length)
      chatStore.removeAutomation(id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  server.listen(7777, '127.0.0.1', () => {
    console.log('[kagora] Chat API on http://127.0.0.1:7777')
  })
}

app.whenReady().then(() => {
  terminalManager = new TerminalManager()
  chatStore = new ChatStore(app.getPath('userData'))

  // Wire PTY data/exit events to renderer
  terminalManager.onData((agentId, data) => {
    if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('terminal:data', agentId, data)
  })
  terminalManager.onExit((agentId, code) => {
    if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('terminal:exit', agentId, code)
  })

  setupIPC()
  startChatAPI()
  createWindow()
  const dataDir = join(app.getPath('userData'), 'kagora-data')
  scheduler = new Scheduler(chatStore, terminalManager, () => mainWindow, dataDir)
  scheduler.start()
})

app.on('window-all-closed', () => {
  scheduler?.stop()
  if (chatStore?.shouldClearOnExit()) {
    chatStore.clearMessages()
  }
  terminalManager?.destroyAll()
  app.quit()
})
