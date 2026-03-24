import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ChatStore, Automation } from './chat-store'
import type { TerminalManager } from './terminal-manager'
import type { BrowserWindow } from 'electron'

interface ScheduleState {
  lastRun: number // timestamp ms
}

export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null
  private state = new Map<string, ScheduleState>()
  private chatStore: ChatStore
  private terminalManager: TerminalManager
  private getWindow: () => BrowserWindow | null
  private stateFile: string

  constructor(
    chatStore: ChatStore,
    terminalManager: TerminalManager,
    getWindow: () => BrowserWindow | null,
    dataDir: string
  ) {
    this.chatStore = chatStore
    this.terminalManager = terminalManager
    this.getWindow = getWindow
    this.stateFile = join(dataDir, 'scheduler-state.json')
    this.loadState()
  }

  private loadState() {
    try {
      if (existsSync(this.stateFile)) {
        const data = JSON.parse(readFileSync(this.stateFile, 'utf-8'))
        for (const [key, val] of Object.entries(data)) {
          this.state.set(key, val as ScheduleState)
        }
        console.log(`[kagora-scheduler] Loaded ${this.state.size} state entries`)
      }
    } catch { /* fresh start */ }
  }

  private saveState() {
    const obj: Record<string, ScheduleState> = {}
    for (const [key, val] of this.state) {
      obj[key] = val
    }
    try {
      writeFileSync(this.stateFile, JSON.stringify(obj), 'utf-8')
    } catch { /* ignore write errors */ }
  }

  start() {
    // Check every 30 seconds
    this.interval = setInterval(() => this.tick(), 30_000)
    // Also run immediately
    this.tick()
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  private tick() {
    const now = Date.now()
    const automations = this.chatStore.getAutomations()

    for (const auto of automations) {
      if (!auto.enabled) continue

      const parsed = this.parseSchedule(auto.schedule)
      if (!parsed) continue

      const state = this.state.get(auto.id) || { lastRun: 0 }
      const elapsed = now - state.lastRun

      if (this.shouldRun(parsed, elapsed, now)) {
        this.execute(auto)
        this.state.set(auto.id, { lastRun: now })
        this.saveState()
      }
    }
  }

  private parseSchedule(schedule: string): ParsedSchedule | null {
    // Format: "interval:MINUTES" e.g. "interval:180" = every 3 hours
    const intervalMatch = schedule.match(/^interval:(\d+)$/i)
    if (intervalMatch) {
      return { type: 'interval', minutes: parseInt(intervalMatch[1]) }
    }

    // Format: "daily:HH:MM" e.g. "daily:08:00"
    const dailyMatch = schedule.match(/^daily:(\d{1,2}):(\d{2})$/i)
    if (dailyMatch) {
      return { type: 'daily', hour: parseInt(dailyMatch[1]), minute: parseInt(dailyMatch[2]) }
    }

    // Format: "cron:MIN HOUR * * *" (simplified: only min + hour)
    const cronMatch = schedule.match(/^cron:(\d+)\s+(\d+)\s/)
    if (cronMatch) {
      return { type: 'daily', hour: parseInt(cronMatch[2]), minute: parseInt(cronMatch[1]) }
    }

    return null
  }

  private shouldRun(parsed: ParsedSchedule, elapsedMs: number, nowMs: number): boolean {
    if (parsed.type === 'interval') {
      return elapsedMs >= parsed.minutes * 60_000
    }

    if (parsed.type === 'daily') {
      const now = new Date(nowMs)
      const h = now.getHours()
      const m = now.getMinutes()

      // Check if current time matches (within 1-minute window)
      if (h === parsed.hour && m === parsed.minute) {
        // Only run once per window (don't re-trigger within 60s)
        return elapsedMs >= 60_000
      }
    }

    return false
  }

  private execute(auto: Automation) {
    const text = auto.script
    const win = this.getWindow()

    if (auto.method === 'chat') {
      // Send as chat message from "scheduler"
      const msg = this.chatStore.addMessage('scheduler', auto.target, text)
      if (win && !win.isDestroyed()) {
        win.webContents.send('chat:message', msg)
      }
      this.terminalManager.inject(auto.target, `[Kagora] scheduler: ${text}\r`)
    } else {
      // Direct terminal inject
      this.terminalManager.inject(auto.target, `${text}\r`)
    }

    console.log(`[kagora-scheduler] Triggered "${auto.name}" -> ${auto.target}`)
  }
}

interface IntervalSchedule {
  type: 'interval'
  minutes: number
}

interface DailySchedule {
  type: 'daily'
  hour: number
  minute: number
}

type ParsedSchedule = IntervalSchedule | DailySchedule
