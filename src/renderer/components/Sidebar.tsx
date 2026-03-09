import { useT } from '../i18n'

interface Agent {
  id: string
  name: string
  color: string
  status: 'online' | 'offline'
}

interface SidebarProps {
  agents: Agent[]
  activeView: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  adminName?: string
}

export default function Sidebar({ agents, activeView, onSelect, onAdd, onRemove, adminName }: SidebarProps) {
  const t = useT()

  return (
    <div className="sidebar">
      <div className="sidebar-header">Kagora</div>

      <div
        className={`sidebar-item ${activeView === 'group' ? 'active' : ''}`}
        onClick={() => onSelect('group')}
      >
        <span className="chat-icon">#</span>
        <span className="agent-name">{t('sidebar.group')}</span>
      </div>

      <div
        className={`sidebar-item ${activeView === 'dm-log' ? 'active' : ''}`}
        onClick={() => onSelect('dm-log')}
      >
        <span className="chat-icon">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 1.75a.75.75 0 00-1.5 0v12.5c0 .414.336.75.75.75h14.5a.75.75 0 000-1.5H1.5V1.75zm14.28 2.53a.75.75 0 00-1.06-1.06L10 7.94 7.53 5.47a.75.75 0 00-1.06 0l-5 5a.75.75 0 101.06 1.06L7 7.06l2.47 2.47a.75.75 0 001.06 0l5.25-5.25z"/>
          </svg>
        </span>
        <span className="agent-name">{t('sidebar.dmLog')}</span>
      </div>

      <div className="sidebar-header" style={{ marginTop: 8 }}>{t('sidebar.agents')}</div>

      {agents.map(agent => (
        <div
          key={agent.id}
          className={`sidebar-item ${activeView === agent.id ? 'active' : ''}`}
          onClick={() => onSelect(agent.id)}
        >
          <span className="agent-dot" style={{ background: agent.color }} />
          <span className="agent-name">{agent.name}</span>
          <button
            className="remove-btn"
            onClick={e => { e.stopPropagation(); onRemove(agent.id) }}
          >
            x
          </button>
        </div>
      ))}

      <div className="sidebar-footer">
        <button
          className={`footer-btn ${activeView === 'automations' ? 'active' : ''}`}
          onClick={() => onSelect('automations')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.5 3.75a.75.75 0 00-1.5 0v8.5c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5H3.5V3.75z"/>
            <path d="M10 1a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5A.75.75 0 0110 1z"/>
            <path d="M6.75 8a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"/>
          </svg>
          {t('sidebar.automations')}
        </button>
        <button
          className={`footer-btn ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onSelect('settings')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"/>
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.902 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291a1.873 1.873 0 00-1.116-2.693l-.318-.094c-.835-.246-.835-1.428 0-1.674l.319-.094a1.873 1.873 0 001.115-2.692l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.116l.094-.318z"/>
          </svg>
          {t('sidebar.settings')}
        </button>
        <button className="footer-btn" onClick={onAdd}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
          </svg>
          {t('sidebar.newAgent')}
        </button>
      </div>
    </div>
  )
}
