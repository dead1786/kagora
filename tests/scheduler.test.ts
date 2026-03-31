import { describe, it, expect } from 'vitest'
import { parseSchedule, shouldRun } from '../src/main/scheduler'
import type { ParsedSchedule } from '../src/main/scheduler'

describe('Scheduler', () => {
  describe('parseSchedule', () => {
    it('should parse interval format', () => {
      expect(parseSchedule('interval:60')).toEqual({ type: 'interval', minutes: 60 })
      expect(parseSchedule('interval:1')).toEqual({ type: 'interval', minutes: 1 })
      expect(parseSchedule('interval:180')).toEqual({ type: 'interval', minutes: 180 })
    })

    it('should parse interval case-insensitively', () => {
      expect(parseSchedule('Interval:30')).toEqual({ type: 'interval', minutes: 30 })
      expect(parseSchedule('INTERVAL:10')).toEqual({ type: 'interval', minutes: 10 })
    })

    it('should parse daily format', () => {
      expect(parseSchedule('daily:08:00')).toEqual({ type: 'daily', hour: 8, minute: 0 })
      expect(parseSchedule('daily:23:59')).toEqual({ type: 'daily', hour: 23, minute: 59 })
      expect(parseSchedule('daily:0:00')).toEqual({ type: 'daily', hour: 0, minute: 0 })
    })

    it('should reject invalid daily times', () => {
      expect(parseSchedule('daily:24:00')).toBeNull()
      expect(parseSchedule('daily:12:60')).toBeNull()
    })

    it('should parse weekly format', () => {
      expect(parseSchedule('weekly:MON:09:00')).toEqual({ type: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 })
      expect(parseSchedule('weekly:fri:17:30')).toEqual({ type: 'weekly', dayOfWeek: 5, hour: 17, minute: 30 })
      expect(parseSchedule('weekly:SUN:00:00')).toEqual({ type: 'weekly', dayOfWeek: 0, hour: 0, minute: 0 })
      expect(parseSchedule('weekly:sat:23:59')).toEqual({ type: 'weekly', dayOfWeek: 6, hour: 23, minute: 59 })
    })

    it('should parse all day names', () => {
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
      for (let i = 0; i < days.length; i++) {
        const result = parseSchedule(`weekly:${days[i]}:12:00`)
        expect(result).toEqual({ type: 'weekly', dayOfWeek: i, hour: 12, minute: 0 })
      }
    })

    it('should reject invalid day names', () => {
      expect(parseSchedule('weekly:ABC:09:00')).toBeNull()
      expect(parseSchedule('weekly:monday:09:00')).toBeNull() // must be 3-letter
    })

    it('should reject invalid weekly times', () => {
      expect(parseSchedule('weekly:MON:25:00')).toBeNull()
      expect(parseSchedule('weekly:MON:12:61')).toBeNull()
    })

    it('should parse simplified cron format', () => {
      const result = parseSchedule('cron:30 8 * * *')
      expect(result).toEqual({ type: 'daily', hour: 8, minute: 30 })
    })

    it('should return null for unknown formats', () => {
      expect(parseSchedule('')).toBeNull()
      expect(parseSchedule('every:5min')).toBeNull()
      expect(parseSchedule('garbage')).toBeNull()
      expect(parseSchedule('interval:')).toBeNull()
      expect(parseSchedule('daily:abc')).toBeNull()
    })
  })

  describe('shouldRun', () => {
    describe('interval schedules', () => {
      const every60: ParsedSchedule = { type: 'interval', minutes: 60 }

      it('should trigger when enough time has elapsed', () => {
        expect(shouldRun(every60, 60 * 60_000, Date.now())).toBe(true)
        expect(shouldRun(every60, 120 * 60_000, Date.now())).toBe(true)
      })

      it('should not trigger before interval elapses', () => {
        expect(shouldRun(every60, 59 * 60_000, Date.now())).toBe(false)
        expect(shouldRun(every60, 0, Date.now())).toBe(false)
      })

      it('should trigger on exact boundary', () => {
        expect(shouldRun(every60, 60 * 60_000, Date.now())).toBe(true)
      })

      it('should handle 1-minute interval', () => {
        const every1: ParsedSchedule = { type: 'interval', minutes: 1 }
        expect(shouldRun(every1, 60_000, Date.now())).toBe(true)
        expect(shouldRun(every1, 59_999, Date.now())).toBe(false)
      })
    })

    describe('daily schedules', () => {
      it('should trigger at matching hour and minute', () => {
        const daily8am: ParsedSchedule = { type: 'daily', hour: 8, minute: 0 }
        // Create a Date at exactly 08:00
        const at8am = new Date()
        at8am.setHours(8, 0, 15, 0) // 08:00:15
        const elapsed = 120_000 // last ran 2 minutes ago

        expect(shouldRun(daily8am, elapsed, at8am.getTime())).toBe(true)
      })

      it('should not trigger at wrong time', () => {
        const daily8am: ParsedSchedule = { type: 'daily', hour: 8, minute: 0 }
        const at9am = new Date()
        at9am.setHours(9, 0, 0, 0)

        expect(shouldRun(daily8am, 120_000, at9am.getTime())).toBe(false)
      })

      it('should not re-trigger within 60s window', () => {
        const daily8am: ParsedSchedule = { type: 'daily', hour: 8, minute: 0 }
        const at8am = new Date()
        at8am.setHours(8, 0, 20, 0)

        // Only 30s since last run
        expect(shouldRun(daily8am, 30_000, at8am.getTime())).toBe(false)
      })

      it('should handle midnight schedule', () => {
        const midnight: ParsedSchedule = { type: 'daily', hour: 0, minute: 0 }
        const at0000 = new Date()
        at0000.setHours(0, 0, 10, 0)

        expect(shouldRun(midnight, 120_000, at0000.getTime())).toBe(true)
      })
    })

    describe('weekly schedules', () => {
      it('should trigger on matching day, hour, and minute', () => {
        const monAt9: ParsedSchedule = { type: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 }
        // Find a Monday
        const monday = new Date()
        // Set to next Monday
        const day = monday.getDay()
        const daysUntilMon = (1 - day + 7) % 7 || 7
        monday.setDate(monday.getDate() + daysUntilMon)
        monday.setHours(9, 0, 15, 0)

        expect(shouldRun(monAt9, 120_000, monday.getTime())).toBe(true)
      })

      it('should not trigger on wrong day', () => {
        const monAt9: ParsedSchedule = { type: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 }
        // Find a Tuesday
        const tuesday = new Date()
        const day = tuesday.getDay()
        const daysUntilTue = (2 - day + 7) % 7 || 7
        tuesday.setDate(tuesday.getDate() + daysUntilTue)
        tuesday.setHours(9, 0, 15, 0)

        expect(shouldRun(monAt9, 120_000, tuesday.getTime())).toBe(false)
      })

      it('should not trigger on right day but wrong time', () => {
        const monAt9: ParsedSchedule = { type: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 }
        const monday = new Date()
        const day = monday.getDay()
        const daysUntilMon = (1 - day + 7) % 7 || 7
        monday.setDate(monday.getDate() + daysUntilMon)
        monday.setHours(10, 0, 0, 0) // wrong hour

        expect(shouldRun(monAt9, 120_000, monday.getTime())).toBe(false)
      })

      it('should not re-trigger within 60s window', () => {
        const friAt17: ParsedSchedule = { type: 'weekly', dayOfWeek: 5, hour: 17, minute: 30 }
        const friday = new Date()
        const day = friday.getDay()
        const daysUntilFri = (5 - day + 7) % 7 || 7
        friday.setDate(friday.getDate() + daysUntilFri)
        friday.setHours(17, 30, 20, 0)

        // Only 30s since last run
        expect(shouldRun(friAt17, 30_000, friday.getTime())).toBe(false)
      })
    })
  })
})
