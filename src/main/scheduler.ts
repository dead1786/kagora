import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ChatStore, Automation } from './chat-store'
import type { TerminalManager } from './terminal-manager'
import type { BrowserWindow } from 'electron'

interface ScheduleState {
  lastRun: number // timestamp ms
}

// ---- Exported schedule types for testing ----

export interface IntervalSchedule {
  type: 'interval'
  minutes: number
}

export interface DailySchedule {
  type: 'daily'
  hour: number
  minute: number
}

export interface WeeklySchedule {
  type: 'weekly'
  dayOfWeek: number // 0=Sun, 1=Mon, ..., 6=Sat
  hour: number
  minute: number
}

export interface MonthlySchedule {
  type: 'monthly'
  dayOfMonth: number // 1-31
  hour: number
  minute: number
}

export type ParsedSchedule = IntervalSchedule | DailySchedule | WeeklySchedule | MonthlySchedule

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
}

/**
 * Parse a schedule string into a structured format.
 * Supported formats:
 *   - "interval:MINUTES"         e.g. "interval:180" = every 3 hours
 *   - "daily:HH:MM"             e.g. "daily:08:00"
 *   - "weekly:DAY:HH:MM"        e.g. "weekly:MON:09:00"
 *   - "cron:MIN HOUR * * *"     simplified cron (min + hour only)
 */
export function parseSchedule(schedule: string): ParsedSchedule | null {
  // Format: "interval:MINUTES" e.g. "interval:180" = every 3 hours
  const intervalMatch = schedule.match(/^interval:(\d+)$/i)
  if (intervalMatch) {
    return { type: 'interval', minutes: parseInt(intervalMatch[1]) }
  }

  // Format: "daily:HH:MM" e.g. "daily:08:00"
  const dailyMatch = schedule.match(/^daily:(\d{1,2}):(\d{2})$/i)
  if (dailyMatch) {
    const hour = parseInt(dailyMatch[1])
    const minute = parseInt(dailyMatch[2])
    if (hour > 23 || minute > 59) return null
    return { type: 'daily', hour, minute }
  }

  // Format: "weekly:DAY:HH:MM" e.g. "weekly:MON:09:00" or "weekly:mon:09:00"
  const weeklyMatch = schedule.match(/^weekly:([a-zA-Z]{3}):(\d{1,2}):(\d{2})$/i)
  if (weeklyMatch) {
    const dayName = weeklyMatch[1].toLowerCase()
    const dayOfWeek = DAY_NAMES[dayName]
    if (dayOfWeek === undefined) return null
    const hour = parseInt(weeklyMatch[2])
    const minute = parseInt(weeklyMatch[3])
    if (hour > 23 || minute > 59) return null
    return { type: 'weekly', dayOfWeek, hour, minute }
  }

  // Format: "monthly:DD:HH:MM" e.g. "monthly:01:08:00" = 1st of each month at 8am
  const monthlyMatch = schedule.match(/^monthly:(\d{1,2}):(\d{1,2}):(\d{2})$/i)
  if (monthlyMatch) {
    const day = parseInt(monthlyMatch[1])
    const hour = parseInt(monthlyMatch[2])
    const minute = parseInt(monthlyMatch[3])
    if (day < 1 || day > 31 || hour > 23 || minute > 59) return null
    return { type: 'monthly', dayOfMonth: day, hour, minute }
  }

  // Format: "cron:MIN HOUR * * *" (simplified: only min + hour)
  const cronMatch = schedule.match(/^cron:(\d+)\s+(\d+)\s/)
  if (cronMatch) {
    return { type: 'daily', hour: parseInt(cronMatch[2]), minute: parseInt(cronMatch[1]) }
  }

  return null
}

/**
 * Determine whether a scheduled task should run given the parsed schedule,
 * elapsed time since last run, and current timestamp.
 */
export function shouldRun(parsed: ParsedSchedule, elapsedMs: number, nowMs: number): boolean {
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

  if (parsed.type === 'weekly') {
    const now = new Date(nowMs)
    const day = now.getDay()
    const h = now.getHours()
    const m = now.getMinutes()

    // Check if current day+time matches
    if (day === parsed.dayOfWeek && h === parsed.hour && m === parsed.minute) {
      // Only run once per window (don't re-trigger within 60s)
      return elapsedMs >= 60_000
    }
  }

  if (parsed.type === 'monthly') {
    const now = new Date(nowMs)
    const d = now.getDate()
    const h = now.getHours()
    const m = now.getMinutes()

    // Check if current day-of-month + time matches
    if (d === parsed.dayOfMonth && h === parsed.hour && m === parsed.minute) {
      // Only run once per window (don't re-trigger within 60s)
      return elapsedMs >= 60_000
    }
  }

  return false
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
    let dirty = false

    for (const auto of automations) {
      if (!auto.enabled) continue

      const parsed = parseSchedule(auto.schedule)
      if (!parsed) continue

      const state = this.state.get(auto.id) || { lastRun: 0 }
      const elapsed = now - state.lastRun

      if (shouldRun(parsed, elapsed, now)) {
        this.execute(auto)
        this.state.set(auto.id, { lastRun: now })
        dirty = true
      }
    }

    if (dirty) this.saveState()
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
