import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import TerminalPanel from './components/TerminalPanel'
import ChatPanel from './components/ChatPanel'
import SettingsPanel from './components/SettingsPanel'
import DMLogPanel from './components/DMLogPanel'
import AutomationsPanel from './components/AutomationsPanel'
import { LanguageContext, type Language } from './i18n'

interface Agent {
  id: string
  name: string
  color: string
  shell?: string
  status: 'online' | 'offline'
  startupCommand?: string
  adminMode?: boolean
}

interface Settings {
  adminName: string
  defaultShell: string
  terminalFontSize: number
  uiFontSize: number
  language: string
  theme: 'dark' | 'light'
  clearChatOnExit: boolean
}

type AgentActivity = 'offline' | 'idle' | 'active'

const AGENT_COLORS = [
  '#58a6ff', '#f78166', '#7ee787', '#d2a8ff',
  '#ff7b72', '#79c0ff', '#ffa657', '#56d364'
]

const ACTIVE_TIMEOUT = 8000 // 8 seconds of no substantial output = idle
const ACTIVE_THRESHOLD = 50 // bytes of data needed within window to count as "active"
const ACTIVE_WINDOW = 2000  // 2-second sliding window for data accumulation

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeView, setActiveView] = useState<string>('group')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentActivity>>({})
  const lastDataTime = useRef<Record<string, number>>({})
  const terminalAlive = useRef<Record<string, boolean>>({})
  const dataAccum = useRef<Record<string, number>>({})

  useEffect(() => {
    window.kagora.getAgents().then(setAgents)
    window.kagora.getSettings().then(setSettings)
  }, [])

  // Track terminal activity for status indicators
  useEffect(() => {
    const removeData = window.kagora.onTerminalData((agentId: string, data: string) => {
      const now = Date.now()
      const lastTime = lastDataTime.current[agentId] || 0
      terminalAlive.current[agentId] = true

      // Reset accumulator if last data was too long ago
      if (now - lastTime > ACTIVE_WINDOW) {
        dataAccum.current[agentId] = 0
      }
      dataAccum.current[agentId] = (dataAccum.current[agentId] || 0) + data.length
      lastDataTime.current[agentId] = now

      // Only mark active if substantial output (not just cursor blinks)
      if (dataAccum.current[agentId] >= ACTIVE_THRESHOLD) {
        setAgentStatuses(prev => ({ ...prev, [agentId]: 'active' }))
      }
    })

    const removeExit = window.kagora.onTerminalExit((agentId: string) => {
      terminalAlive.current[agentId] = false
      setAgentStatuses(prev => ({ ...prev, [agentId]: 'offline' }))
    })

    // Periodically check for idle transition
    const interval = setInterval(() => {
      const now = Date.now()
      setAgentStatuses(prev => {
        const next = { ...prev }
        for (const [id, time] of Object.entries(lastDataTime.current)) {
          if (terminalAlive.current[id] && now - time > ACTIVE_TIMEOUT) {
            next[id] = 'idle'
          }
        }
        return next
      })
    }, 1000)

    return () => {
      removeData()
      removeExit()
      clearInterval(interval)
    }
  }, [])

  // Apply UI font size as CSS variable
  useEffect(() => {
    if (settings?.uiFontSize) {
      document.documentElement.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`)
    }
  }, [settings?.uiFontSize])

  // Apply theme
  useEffect(() => {
    const theme = settings?.theme || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  }, [settings?.theme])

  const handleAddAgent = async (name: string, shell?: string) => {
    const agent: Agent = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      color: AGENT_COLORS[agents.length % AGENT_COLORS.length],
      shell,
      status: 'offline'
    }
    const ok = await window.kagora.addAgent(agent)
    if (ok !== false) {
      setAgents(prev => [...prev, agent])
      setActiveView(agent.id)
    }
    setShowAddDialog(false)
  }

  const handleRemoveAgent = async (id: string) => {
    await window.kagora.removeAgent(id)
    setAgents(prev => prev.filter(a => a.id !== id))
    if (activeView === id) setActiveView('group')
  }

  const handleStartupCommandChange = async (agentId: string, cmd: string | null) => {
    const updated = await window.kagora.updateAgent(agentId, { startupCommand: cmd })
    setAgents(updated)
  }

  const handleColorChange = async (agentId: string, color: string) => {
    const updated = await window.kagora.updateAgent(agentId, { color })
    setAgents(updated)
  }

  const handleAdminModeChange = async (agentId: string, adminMode: boolean) => {
    const updated = await window.kagora.updateAgent(agentId, { adminMode })
    setAgents(updated)
  }

  const language = (settings?.language || 'en') as Language

  return (
    <LanguageContext.Provider value={language}>
      <div className="app">
        <div className="titlebar" />
        <div className="app-body">
          <Sidebar
            agents={agents}
            activeView={activeView}
            onSelect={setActiveView}
            onAdd={() => setShowAddDialog(true)}
            onRemove={handleRemoveAgent}
            onColorChange={handleColorChange}
            agentStatuses={agentStatuses}
            adminName={settings?.adminName}
          />
          <div className="main-content" style={{ fontSize: 'var(--ui-font-size, 14px)' }}>
            {activeView === 'group' && (
              <ChatPanel channel="group" adminName={settings?.adminName} />
            )}
            {activeView === 'dm-log' && <DMLogPanel />}
            {activeView === 'automations' && <AutomationsPanel />}
            {activeView === 'settings' && (
              <SettingsPanel onSettingsChange={setSettings} />
            )}

            {agents.map(agent => (
              <div
                key={agent.id}
                className="terminal-wrapper"
                style={{ display: activeView === agent.id ? 'flex' : 'none' }}
              >
                <TerminalPanel
                  agentId={agent.id}
                  isActive={activeView === agent.id}
                  shell={agent.shell || settings?.defaultShell}
                  fontSize={settings?.terminalFontSize}
                  startupCommand={agent.startupCommand}
                  adminMode={agent.adminMode}
                  onStartupCommandChange={handleStartupCommandChange}
                  onAdminModeChange={handleAdminModeChange}
                />
              </div>
            ))}

            {!['group', 'dm-log', 'automations', 'settings'].includes(activeView) && !agents.find(a => a.id === activeView) && (
              <div className="welcome">
                <h2>Kagora</h2>
                <p>Multi-AI Terminal Platform</p>
                <button className="add-btn" onClick={() => setShowAddDialog(true)}>
                  + New Agent
                </button>
              </div>
            )}
          </div>
        </div>

        {showAddDialog && (
          <AddAgentDialog
            onAdd={handleAddAgent}
            onClose={() => setShowAddDialog(false)}
          />
        )}
      </div>
    </LanguageContext.Provider>
  )
}

function AddAgentDialog({ onAdd, onClose }: {
  onAdd: (name: string, shell?: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [shell, setShell] = useState('')
  const [shells, setShells] = useState<{ name: string; path: string }[]>([])

  useEffect(() => {
    window.kagora.getAvailableShells().then(setShells)
  }, [])

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h3>New Agent</h3>
        <input
          placeholder="Name (e.g. shrimp)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name && onAdd(name, shell || undefined)}
          autoFocus
        />
        <select
          value={shell}
          onChange={e => setShell(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 14, width: '100%',
            cursor: 'pointer',
          }}
        >
          <option value="">Default Shell</option>
          {shells.map(s => (
            <option key={s.path} value={s.path}>{s.name}</option>
          ))}
        </select>
        <div className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() => name && onAdd(name, shell || undefined)}
            disabled={!name}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
