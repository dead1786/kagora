import { useState, useEffect, useRef } from 'react'
import { useT } from '../i18n'

interface ChatMessage {
  id: string
  from: string
  to: string
  text: string
  time: string
}

interface ChatPanelProps {
  channel: string
  adminName?: string
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

export default function ChatPanel({ channel, adminName }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const t = useT()

  useEffect(() => {
    window.kagora.getChatHistory(channel).then(setMessages)

    return window.kagora.onChatMessage((msg: ChatMessage) => {
      if (channel === 'group' && msg.to === 'group') {
        setMessages(prev => [...prev, msg])
      } else if (msg.from === channel || msg.to === channel) {
        setMessages(prev => [...prev, msg])
      }
    })
  }, [channel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    await window.kagora.sendChat(adminName || 'Admin', channel, input.trim())
    setInput('')
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        {channel === 'group' ? t('chat.group') : `${t('chat.dmPrefix')} ${channel}`}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
            {t('chat.noMessages')}
          </div>
        )}
        {messages.filter(msg => msg && msg.from).map(msg => (
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
                <span className="chat-time">
                  {new Date(msg.time).toLocaleTimeString('zh-TW', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div className="chat-text">{msg.text}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          autoFocus
          rows={1}
          placeholder={channel === 'group' ? t('chat.groupPlaceholder') : `${t('chat.dmPlaceholder')} ${channel}...`}
          value={input}
          onChange={e => {
            setInput(e.target.value)
            // Auto-resize
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
              ;(e.target as HTMLTextAreaElement).style.height = 'auto'
            }
          }}
        />
      </div>
    </div>
  )
}
