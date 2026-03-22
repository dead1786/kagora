/**
 * Kagora Plugin System
 *
 * Plugins are JS/TS modules in the plugins directory that export:
 *   activate(ctx: PluginContext): void | Promise<void>
 *   deactivate?(): void | Promise<void>
 *
 * Plugin context provides safe access to Kagora internals:
 *   - chatStore: send messages, list agents
 *   - terminal: inject text into agent terminals
 *   - scheduler: register interval/cron tasks
 *   - webhook: register HTTP endpoints under /api/plugins/<pluginId>/
 *   - logger: namespaced console logger
 *   - events: subscribe to Kagora events (message, agent:online, etc.)
 */

import { readdirSync, existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'
import type { ChatStore, ChatMessage } from './chat-store'
import type { TerminalManager } from './terminal-manager'
import type http from 'http'

// ---- Public Types ----

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  main: string // entry file relative to plugin dir
}

export interface PluginLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type KagoraEventType =
  | 'chat:message'
  | 'agent:added'
  | 'agent:removed'
  | 'terminal:data'
  | 'terminal:exit'

export type EventHandler = (data: unknown) => void

export interface PluginContext {
  /** Plugin metadata */
  pluginId: string

  /** Chat operations */
  chat: {
    send: (from: string, to: string, text: string) => ChatMessage
    history: (channel: string) => ChatMessage[]
    agents: () => Array<{ id: string; name: string; status: string }>
  }

  /** Terminal operations */
  terminal: {
    inject: (agentId: string, text: string) => void
    write: (agentId: string, data: string) => void
    has: (agentId: string) => boolean
  }

  /** Register a webhook endpoint at /api/plugins/<pluginId>/<path> */
  webhook: {
    register: (
      method: string,
      path: string,
      handler: WebhookHandler
    ) => void
    unregister: (method: string, path: string) => void
  }

  /** Register a periodic task */
  scheduler: {
    addInterval: (name: string, intervalMs: number, fn: () => void | Promise<void>) => void
    removeInterval: (name: string) => void
  }

  /** Subscribe to Kagora events */
  events: {
    on: (event: KagoraEventType, handler: EventHandler) => void
    off: (event: KagoraEventType, handler: EventHandler) => void
  }

  /** Namespaced logger */
  log: PluginLogger
}

export type WebhookHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string
) => void | Promise<void>

// ---- Internal ----

interface LoadedPlugin {
  manifest: PluginManifest
  module: { activate: (ctx: PluginContext) => void | Promise<void>; deactivate?: () => void | Promise<void> }
  context: PluginContext
  intervals: Map<string, ReturnType<typeof setInterval>>
  eventHandlers: Map<KagoraEventType, Set<EventHandler>>
}

interface WebhookRoute {
  pluginId: string
  method: string
  path: string
  handler: WebhookHandler
}

export class PluginLoader {
  private plugins = new Map<string, LoadedPlugin>()
  private webhookRoutes: WebhookRoute[] = []
  private globalEventHandlers = new Map<KagoraEventType, Set<EventHandler>>()
  private chatStore: ChatStore
  private terminalManager: TerminalManager
  private pluginsDir: string

  constructor(chatStore: ChatStore, terminalManager: TerminalManager, pluginsDir: string) {
    this.chatStore = chatStore
    this.terminalManager = terminalManager
    this.pluginsDir = pluginsDir

    if (!existsSync(pluginsDir)) {
      mkdirSync(pluginsDir, { recursive: true })
      console.log(`[kagora-plugins] Created plugins directory: ${pluginsDir}`)
    }
  }

  /** Scan plugins directory and load all valid plugins */
  async loadAll(): Promise<void> {
    if (!existsSync(this.pluginsDir)) return

    const entries = readdirSync(this.pluginsDir)
    let loaded = 0
    let failed = 0

    for (const entry of entries) {
      const pluginPath = join(this.pluginsDir, entry)
      try {
        const stat = statSync(pluginPath)
        if (!stat.isDirectory()) continue

        await this.loadPlugin(pluginPath)
        loaded++
      } catch (err) {
        console.error(`[kagora-plugins] Failed to load plugin "${entry}":`, err)
        failed++
      }
    }

    console.log(`[kagora-plugins] Loaded ${loaded} plugin(s)${failed ? `, ${failed} failed` : ''}`)
  }

  /** Load a single plugin from its directory */
  private async loadPlugin(pluginPath: string): Promise<void> {
    const manifestPath = join(pluginPath, 'plugin.json')
    if (!existsSync(manifestPath)) {
      throw new Error(`No plugin.json found in ${pluginPath}`)
    }

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

    // Validate manifest
    if (!manifest.id || !manifest.name || !manifest.main) {
      throw new Error(`Invalid plugin.json: missing id, name, or main`)
    }
    if (!/^[a-z0-9_-]{1,64}$/.test(manifest.id)) {
      throw new Error(`Invalid plugin id: ${manifest.id}`)
    }
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" already loaded`)
    }

    const entryPath = join(pluginPath, manifest.main)
    if (!existsSync(entryPath)) {
      throw new Error(`Entry file not found: ${manifest.main}`)
    }

    // Load module
    const mod = require(entryPath)
    if (typeof mod.activate !== 'function') {
      throw new Error(`Plugin "${manifest.id}" has no activate() export`)
    }

    // Build context
    const plugin: LoadedPlugin = {
      manifest,
      module: mod,
      context: null as unknown as PluginContext, // filled below
      intervals: new Map(),
      eventHandlers: new Map()
    }

    const ctx = this.buildContext(plugin)
    plugin.context = ctx

    // Activate
    await mod.activate(ctx)

    this.plugins.set(manifest.id, plugin)
    console.log(`[kagora-plugins] Loaded: ${manifest.name} v${manifest.version || '0.0.0'}`)
  }

  /** Build a sandboxed PluginContext for a plugin */
  private buildContext(plugin: LoadedPlugin): PluginContext {
    const self = this
    const id = plugin.manifest.id
    const prefix = `[plugin:${id}]`

    return {
      pluginId: id,

      chat: {
        send: (from: string, to: string, text: string) => {
          return self.chatStore.addMessage(`plugin:${from}`, to, text)
        },
        history: (channel: string) => {
          return self.chatStore.getMessages(channel)
        },
        agents: () => {
          return self.chatStore.getAgents().map(a => ({
            id: a.id,
            name: a.name,
            status: a.status
          }))
        }
      },

      terminal: {
        inject: (agentId: string, text: string) => {
          self.terminalManager.inject(agentId, text)
        },
        write: (agentId: string, data: string) => {
          self.terminalManager.write(agentId, data)
        },
        has: (agentId: string) => {
          return self.terminalManager.has(agentId)
        }
      },

      webhook: {
        register: (method: string, path: string, handler: WebhookHandler) => {
          // Remove existing route with same method+path for this plugin
          self.webhookRoutes = self.webhookRoutes.filter(
            r => !(r.pluginId === id && r.method === method.toUpperCase() && r.path === path)
          )
          self.webhookRoutes.push({
            pluginId: id,
            method: method.toUpperCase(),
            path,
            handler
          })
          console.log(`${prefix} Registered webhook: ${method.toUpperCase()} /api/plugins/${id}/${path}`)
        },
        unregister: (method: string, path: string) => {
          self.webhookRoutes = self.webhookRoutes.filter(
            r => !(r.pluginId === id && r.method === method.toUpperCase() && r.path === path)
          )
        }
      },

      scheduler: {
        addInterval: (name: string, intervalMs: number, fn: () => void | Promise<void>) => {
          // Clear existing interval with same name
          const existing = plugin.intervals.get(name)
          if (existing) clearInterval(existing)

          const handle = setInterval(async () => {
            try {
              await fn()
            } catch (err) {
              console.error(`${prefix} Interval "${name}" error:`, err)
            }
          }, intervalMs)

          plugin.intervals.set(name, handle)
          console.log(`${prefix} Registered interval "${name}" every ${intervalMs}ms`)
        },
        removeInterval: (name: string) => {
          const handle = plugin.intervals.get(name)
          if (handle) {
            clearInterval(handle)
            plugin.intervals.delete(name)
          }
        }
      },

      events: {
        on: (event: KagoraEventType, handler: EventHandler) => {
          // Track per-plugin
          if (!plugin.eventHandlers.has(event)) {
            plugin.eventHandlers.set(event, new Set())
          }
          plugin.eventHandlers.get(event)!.add(handler)

          // Track globally
          if (!self.globalEventHandlers.has(event)) {
            self.globalEventHandlers.set(event, new Set())
          }
          self.globalEventHandlers.get(event)!.add(handler)
        },
        off: (event: KagoraEventType, handler: EventHandler) => {
          plugin.eventHandlers.get(event)?.delete(handler)
          self.globalEventHandlers.get(event)?.delete(handler)
        }
      },

      log: {
        info: (...args: unknown[]) => console.log(prefix, ...args),
        warn: (...args: unknown[]) => console.warn(prefix, ...args),
        error: (...args: unknown[]) => console.error(prefix, ...args)
      }
    }
  }

  /** Emit an event to all subscribed plugins */
  emit(event: KagoraEventType, data: unknown): void {
    const handlers = this.globalEventHandlers.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      try {
        handler(data)
      } catch (err) {
        console.error(`[kagora-plugins] Event handler error for ${event}:`, err)
      }
    }
  }

  /** Handle an HTTP request for plugin webhooks. Returns true if handled. */
  handleWebhook(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const pathname = (req.url || '/').split('?')[0]
    const prefix = '/api/plugins/'
    if (!pathname.startsWith(prefix)) return false

    const rest = pathname.slice(prefix.length) // e.g. "my-plugin/some/path"
    const slashIdx = rest.indexOf('/')
    if (slashIdx < 0) {
      // No path after plugin id - list plugin info
      const pluginId = rest
      const plugin = this.plugins.get(pluginId)
      if (!plugin) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Plugin "${pluginId}" not found` }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description
      }))
      return true
    }

    const pluginId = rest.slice(0, slashIdx)
    const path = rest.slice(slashIdx + 1)
    const method = (req.method || 'GET').toUpperCase()

    const route = this.webhookRoutes.find(
      r => r.pluginId === pluginId && r.method === method && r.path === path
    )

    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Route not found' }))
      return true
    }

    // Read body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      let body = ''
      let overflow = false
      req.on('data', (chunk: Buffer) => {
        body += chunk
        if (body.length > 64 * 1024) overflow = true
      })
      req.on('end', async () => {
        if (overflow) {
          res.writeHead(413)
          res.end('Body too large')
          return
        }
        try {
          await route.handler(req, res, body)
        } catch (err) {
          console.error(`[kagora-plugins] Webhook error (${pluginId}/${path}):`, err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Plugin error' }))
          }
        }
      })
    } else {
      route.handler(req, res, '').catch((err: Error) => {
        console.error(`[kagora-plugins] Webhook error (${pluginId}/${path}):`, err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Plugin error' }))
        }
      })
    }

    return true
  }

  /** List all loaded plugins */
  list(): PluginManifest[] {
    return Array.from(this.plugins.values()).map(p => p.manifest)
  }

  /** Unload a specific plugin */
  async unload(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return false

    // Deactivate
    try {
      await plugin.module.deactivate?.()
    } catch (err) {
      console.error(`[kagora-plugins] Error deactivating "${pluginId}":`, err)
    }

    // Clean up intervals
    for (const handle of plugin.intervals.values()) {
      clearInterval(handle)
    }

    // Clean up event handlers
    for (const [event, handlers] of plugin.eventHandlers) {
      const global = this.globalEventHandlers.get(event)
      if (global) {
        for (const h of handlers) {
          global.delete(h)
        }
      }
    }

    // Clean up webhook routes
    this.webhookRoutes = this.webhookRoutes.filter(r => r.pluginId !== pluginId)

    this.plugins.delete(pluginId)
    console.log(`[kagora-plugins] Unloaded: ${pluginId}`)
    return true
  }

  /** Unload all plugins */
  async unloadAll(): Promise<void> {
    for (const id of Array.from(this.plugins.keys())) {
      await this.unload(id)
    }
  }
}
