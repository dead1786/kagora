import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface ChatMessage {
  id: string
  from: string
  to: string
  text: string
  time: string
}

export interface Agent {
  id: string
  name: string
  color: string
  shell?: string
  status: 'online' | 'offline'
  startupCommand?: string
  adminMode?: boolean
}

export interface KagoraSettings {
  adminName: string
  defaultShell: string
  terminalFontSize: number
  uiFontSize: number
  language: string
  theme: 'dark' | 'light'
  clearChatOnExit: boolean
}

const DEFAULT_SETTINGS: KagoraSettings = {
  adminName: 'Admin',
  defaultShell: '',
  terminalFontSize: 14,
  uiFontSize: 14,
  language: 'en',
  theme: 'dark',
  clearChatOnExit: false
}

export interface Automation {
  id: string
  name: string
  description?: string
  script: string
  target: string
  schedule: string
  method: 'chat' | 'inject'
  enabled: boolean
}

export class ChatStore {
  private dataDir: string
  private messages: ChatMessage[] = []
  private agents: Agent[] = []
  private settings: KagoraSettings = { ...DEFAULT_SETTINGS }
  private automations: Automation[] = []

  constructor(basePath: string) {
    this.dataDir = join(basePath, 'kagora-data')
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true })
    this.load()
  }

  private load() {
    const msgFile = join(this.dataDir, 'messages.json')
    const agentFile = join(this.dataDir, 'agents.json')
    const settingsFile = join(this.dataDir, 'settings.json')

    if (existsSync(msgFile)) {
      try {
        this.messages = JSON.parse(readFileSync(msgFile, 'utf-8'))
      } catch { /* start fresh */ }
    }
    if (existsSync(agentFile)) {
      try {
        this.agents = JSON.parse(readFileSync(agentFile, 'utf-8'))
      } catch { /* start fresh */ }
    }
    if (existsSync(settingsFile)) {
      try {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(settingsFile, 'utf-8')) }
      } catch { /* use defaults */ }
    }

    const autoFile = join(this.dataDir, 'automations.json')
    if (existsSync(autoFile)) {
      try {
        this.automations = JSON.parse(readFileSync(autoFile, 'utf-8'))
      } catch { /* start fresh */ }
    }
  }

  private save() {
    writeFileSync(
      join(this.dataDir, 'messages.json'),
      JSON.stringify(this.messages, null, 2),
      'utf-8'
    )
    writeFileSync(
      join(this.dataDir, 'agents.json'),
      JSON.stringify(this.agents, null, 2),
      'utf-8'
    )
  }

  private saveSettings() {
    writeFileSync(
      join(this.dataDir, 'settings.json'),
      JSON.stringify(this.settings, null, 2),
      'utf-8'
    )
  }

  getSettings(): KagoraSettings {
    return { ...this.settings }
  }

  updateSettings(partial: Partial<KagoraSettings>) {
    this.settings = { ...this.settings, ...partial }
    this.saveSettings()
  }

  addMessage(from: string, to: string, text: string): ChatMessage {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      to,
      text,
      time: new Date().toISOString()
    }
    this.messages.push(msg)
    // Cap at 5000 messages, trim oldest 500 when exceeded
    if (this.messages.length > 5000) {
      this.messages = this.messages.slice(-4500)
    }
    this.save()
    return msg
  }

  getMessages(channel: string): ChatMessage[] {
    if (channel === 'group') {
      return this.messages.filter(m => m.to === 'group')
    }
    if (channel === 'dm-log') {
      return this.messages.filter(m => m.to !== 'group')
    }
    return this.messages.filter(m =>
      (m.from === channel || m.to === channel) && m.to !== 'group'
    )
  }

  getAgents(): Agent[] {
    return this.agents
  }

  addAgent(agent: Agent) {
    this.agents.push(agent)
    this.save()
  }

  updateAgent(id: string, partial: Partial<Agent>) {
    const idx = this.agents.findIndex(a => a.id === id)
    if (idx >= 0) {
      this.agents[idx] = { ...this.agents[idx], ...partial }
      this.save()
    }
  }

  removeAgent(id: string) {
    this.agents = this.agents.filter(a => a.id !== id)
    this.save()
  }

  clearMessages() {
    this.messages = []
    this.save()
  }

  shouldClearOnExit(): boolean {
    return this.settings.clearChatOnExit
  }

  // Automations
  private saveAutomations() {
    writeFileSync(
      join(this.dataDir, 'automations.json'),
      JSON.stringify(this.automations, null, 2),
      'utf-8'
    )
  }

  getAutomations(): Automation[] {
    return [...this.automations]
  }

  addAutomation(auto: Omit<Automation, 'id'>): Automation {
    const item: Automation = {
      ...auto,
      id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    }
    this.automations.push(item)
    this.saveAutomations()
    return item
  }

  updateAutomation(id: string, partial: Partial<Automation>) {
    const idx = this.automations.findIndex(a => a.id === id)
    if (idx >= 0) {
      this.automations[idx] = { ...this.automations[idx], ...partial }
      this.saveAutomations()
    }
  }

  removeAutomation(id: string) {
    this.automations = this.automations.filter(a => a.id !== id)
    this.saveAutomations()
  }
}
