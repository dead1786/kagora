import { useState, useEffect } from 'react'
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
}

interface Settings {
  adminName: string
  defaultShell: string
  terminalFontSize: number
  uiFontSize: number
  language: string
  clearChatOnExit: boolean
}

const AGENT_COLORS = [
  '#58a6ff', '#f78166', '#7ee787', '#d2a8ff',
  '#ff7b72', '#79c0ff', '#ffa657', '#56d364'
]

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeView, setActiveView] = useState<string>('group')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    window.kagora.getAgents().then(setAgents)
    window.kagora.getSettings().then(setSettings)
  }, [])

  // Apply UI font size as CSS variable
  useEffect(() => {
    if (settings?.uiFontSize) {
      document.documentElement.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`)
    }
  }, [settings?.uiFontSize])

  const handleAddAgent = async (name: string, shell?: string) => {
    const agent: Agent = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      color: AGENT_COLORS[agents.length % AGENT_COLORS.length],
      shell,
      status: 'offline'
    }
    await window.kagora.addAgent(agent)
    setAgents(prev => [...prev, agent])
    setActiveView(agent.id)
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
                  onStartupCommandChange={handleStartupCommandChange}
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
            background: '#0d1117', border: '1px solid #30363d',
            color: '#e6edf3', fontSize: 14, width: '100%',
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
