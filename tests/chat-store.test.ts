import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ChatStore } from '../src/main/chat-store'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('ChatStore', () => {
  let store: ChatStore
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kagora-test-'))
    store = new ChatStore(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Messages', () => {
    it('should add and retrieve group messages', () => {
      store.addMessage('agent-1', 'group', 'Hello everyone')
      const msgs = store.getMessages('group')
      expect(msgs).toHaveLength(1)
      expect(msgs[0].from).toBe('agent-1')
      expect(msgs[0].to).toBe('group')
      expect(msgs[0].text).toBe('Hello everyone')
    })

    it('should add and retrieve DM messages', () => {
      store.addMessage('agent-1', 'agent-2', 'Private msg')
      const msgs = store.getMessages('agent-1')
      expect(msgs).toHaveLength(1)
      expect(msgs[0].text).toBe('Private msg')
    })

    it('should filter group vs DM correctly', () => {
      store.addMessage('a1', 'group', 'public')
      store.addMessage('a1', 'a2', 'private')

      expect(store.getMessages('group')).toHaveLength(1)
      expect(store.getMessages('dm-log')).toHaveLength(1)
    })

    it('should generate unique message IDs', () => {
      const m1 = store.addMessage('a', 'group', 'first')
      const m2 = store.addMessage('a', 'group', 'second')
      expect(m1.id).not.toBe(m2.id)
    })

    it('should include ISO timestamp', () => {
      const msg = store.addMessage('a', 'group', 'test')
      expect(msg.time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should cap messages at 5000', { timeout: 30000 }, () => {
      for (let i = 0; i < 5010; i++) {
        store.addMessage('bot', 'group', `msg-${i}`)
      }
      const msgs = store.getMessages('group')
      expect(msgs.length).toBeLessThan(5010)
      expect(msgs.length).toBeLessThanOrEqual(4510)
    })

    it('should clear all messages', () => {
      store.addMessage('a', 'group', 'hello')
      store.addMessage('a', 'b', 'dm')
      store.clearMessages()
      expect(store.getMessages('group')).toHaveLength(0)
      expect(store.getMessages('dm-log')).toHaveLength(0)
    })
  })

  describe('Agents', () => {
    it('should add and list agents', () => {
      store.addAgent({ id: 'bot-1', name: 'Bot One', color: '#ff0000', status: 'online' })
      const agents = store.getAgents()
      expect(agents).toHaveLength(1)
      expect(agents[0].name).toBe('Bot One')
    })

    it('should update agent properties', () => {
      store.addAgent({ id: 'bot-1', name: 'Bot', color: '#000', status: 'online' })
      store.updateAgent('bot-1', { status: 'offline' })
      expect(store.getAgents()[0].status).toBe('offline')
    })

    it('should remove agent by id', () => {
      store.addAgent({ id: 'bot-1', name: 'Bot', color: '#000', status: 'online' })
      store.removeAgent('bot-1')
      expect(store.getAgents()).toHaveLength(0)
    })

    it('should ignore update for non-existent agent', () => {
      store.updateAgent('ghost', { name: 'Ghost' })
      expect(store.getAgents()).toHaveLength(0)
    })
  })

  describe('Settings', () => {
    it('should return default settings', () => {
      const settings = store.getSettings()
      expect(settings.adminName).toBe('Admin')
      expect(settings.terminalFontSize).toBe(14)
      expect(settings.language).toBe('en')
    })

    it('should update partial settings', () => {
      store.updateSettings({ language: 'zh-TW', uiFontSize: 16 })
      const settings = store.getSettings()
      expect(settings.language).toBe('zh-TW')
      expect(settings.uiFontSize).toBe(16)
      expect(settings.adminName).toBe('Admin') // unchanged
    })

    it('should return a copy, not a reference', () => {
      const s1 = store.getSettings()
      s1.adminName = 'Hacked'
      expect(store.getSettings().adminName).toBe('Admin')
    })
  })

  describe('Automations', () => {
    it('should add automation with generated id', () => {
      const auto = store.addAutomation({
        name: 'Heartbeat',
        script: 'echo alive',
        target: 'bot-1',
        schedule: '*/5 * * * *',
        method: 'inject',
        enabled: true,
      })
      expect(auto.id).toMatch(/^auto-/)
      expect(store.getAutomations()).toHaveLength(1)
    })

    it('should update automation', () => {
      const auto = store.addAutomation({
        name: 'Test',
        script: 'echo 1',
        target: 'bot-1',
        schedule: '* * * * *',
        method: 'chat',
        enabled: true,
      })
      store.updateAutomation(auto.id, { enabled: false })
      expect(store.getAutomations()[0].enabled).toBe(false)
    })

    it('should remove automation', () => {
      const auto = store.addAutomation({
        name: 'Temp',
        script: 'echo x',
        target: 'bot-1',
        schedule: '* * * * *',
        method: 'chat',
        enabled: true,
      })
      store.removeAutomation(auto.id)
      expect(store.getAutomations()).toHaveLength(0)
    })

    it('should return a copy of automations list', () => {
      store.addAutomation({
        name: 'A',
        script: 'echo',
        target: 'b',
        schedule: '*',
        method: 'chat',
        enabled: true,
      })
      const list = store.getAutomations()
      list.pop()
      expect(store.getAutomations()).toHaveLength(1)
    })
  })

  describe('Persistence', () => {
    it('should persist and reload messages', () => {
      store.addMessage('a', 'group', 'persisted')
      const store2 = new ChatStore(tempDir)
      expect(store2.getMessages('group')).toHaveLength(1)
      expect(store2.getMessages('group')[0].text).toBe('persisted')
    })

    it('should persist and reload agents', () => {
      store.addAgent({ id: 'x', name: 'X', color: '#fff', status: 'online' })
      const store2 = new ChatStore(tempDir)
      expect(store2.getAgents()).toHaveLength(1)
    })

    it('should persist and reload settings', () => {
      store.updateSettings({ language: 'ja' })
      const store2 = new ChatStore(tempDir)
      expect(store2.getSettings().language).toBe('ja')
    })
  })
})
