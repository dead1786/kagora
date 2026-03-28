import { useState, useEffect, useRef, useContext } from 'react'
import { useT, LanguageContext, type Language } from '../i18n'

const LOCALE_MAP: Record<Language, string> = {
  'en': 'en-US',
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
}

interface ChatMessage {
  id: string
  from: string
  to: string
  text: string
  time: string
}

const SENDER_COLORS: Record<string, string> = {}
const COLOR_POOL = ['#58a6ff', '#f78166', '#7ee787', '#d2a8ff', '#ff7b72', '#79c0ff', '#ffa657', '#56d364']
let colorIndex = 0

function getSenderColor(name: string): string {
  if (!SENDER_COLORS[name]) {
    SENDER_COLORS[name] = COLOR_POOL[colorIndex % COLOR_POOL.length]
    colorIndex++
  }
  return SENDER_COLORS[name]
}

function getConversationKey(msg: ChatMessage): string {
  return [msg.from, msg.to].sort().join(' <> ')
}

export default function DMLogPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [filter, setFilter] = useState<string>('all')
  const messagesRef = useRef<HTMLDivElement>(null)
  const t = useT()
  const language = useContext(LanguageContext)
  const locale = LOCALE_MAP[language] || 'en-US'

  useEffect(() => {
    window.kagora.getChatHistory('dm-log').then(setMessages)

    return window.kagora.onChatMessage((msg: ChatMessage) => {
      if (msg.to !== 'group') {
        setMessages(prev => [...prev, msg])
      }
    })
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = messagesRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, filter])

  const conversations = [...new Set(messages.map(getConversationKey))].sort()

  const filtered = filter === 'all'
    ? messages
    : messages.filter(m => getConversationKey(m) === filter)

  return (
    <div className="chat-panel">
      <div className="chat-header dm-log-header">
        <span>{t('dm.title')}</span>
        <select
          className="dm-filter"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="all">{t('dm.allConversations')}</option>
          {conversations.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="chat-messages" ref={messagesRef}>
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
            {t('dm.noMessages')}
          </div>
        )}
        {filtered.map(msg => (
          <div key={msg.id} className="chat-message">
            <div
              className="chat-avatar"
              style={{ background: getSenderColor(msg.from) }}
            >
              {msg.from[0].toUpperCase()}
            </div>
            <div className="chat-body">
              <div className="chat-sender">
                {msg.from}
                <span className="dm-direction">{'>'}</span>
                <span style={{ color: getSenderColor(msg.to) }}>{msg.to}</span>
                <span className="chat-time">
                  {new Date(msg.time).toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div className="chat-text">{msg.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
