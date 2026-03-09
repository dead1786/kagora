import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  agentId: string
  isActive: boolean
  shell?: string
  fontSize?: number
  startupCommand?: string
  adminMode?: boolean
  onStartupCommandChange?: (agentId: string, cmd: string | null) => void
  onAdminModeChange?: (agentId: string, adminMode: boolean) => void
}

const THEME = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#58a6ff',
  cursorAccent: '#0d1117',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
}

export default function TerminalPanel({ agentId, isActive, shell, fontSize = 14, startupCommand, adminMode, onStartupCommandChange, onAdminModeChange }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [exited, setExited] = useState(false)
  const [restartCount, setRestartCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [editCmd, setEditCmd] = useState('')
  const startupSentRef = useRef(false)

  // Create terminal + PTY
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const terminal = new Terminal({
      fontSize,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      theme: THEME,
      cursorBlink: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(el)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Block native paste to prevent double-paste (we handle it manually)
    const handlePaste = (e: Event) => { e.preventDefault(); e.stopPropagation() }
    el.addEventListener('paste', handlePaste, true)

    // Clipboard handling
    terminal.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true

      // Ctrl+Enter: insert newline (multi-line input, replaces Alt+Enter)
      if (ev.ctrlKey && ev.key === 'Enter') {
        window.kagora.sendTerminalInput(agentId, '\n')
        return false
      }

      // Ctrl+C: copy if selection exists, otherwise let SIGINT through
      if (ev.ctrlKey && !ev.shiftKey && ev.key === 'c') {
        const sel = terminal.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
          terminal.clearSelection()
          return false
        }
        return true
      }

      // Ctrl+V: paste from clipboard
      if (ev.ctrlKey && !ev.shiftKey && ev.key === 'v') {
        navigator.clipboard.readText().then(text => {
          if (text) window.kagora.sendTerminalInput(agentId, text)
        })
        return false
      }

      // Ctrl+Shift+C: always copy
      if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyC') {
        const sel = terminal.getSelection()
        if (sel) navigator.clipboard.writeText(sel)
        return false
      }

      return true
    })

    // Right-click to paste
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      navigator.clipboard.readText().then(text => {
        if (text) window.kagora.sendTerminalInput(agentId, text)
      })
    }
    el.addEventListener('contextmenu', handleContextMenu)

    // Create PTY in main process
    window.kagora.createTerminal(agentId, shell, adminMode)

    // Receive PTY output
    const removeDataListener = window.kagora.onTerminalData((id, data) => {
      if (id === agentId) {
        terminal.write(data)
        // Auto-run startup command after first prompt appears
        if (!startupSentRef.current && startupCommand) {
          startupSentRef.current = true
          setTimeout(() => {
            window.kagora.sendTerminalInput(agentId, startupCommand + '\r')
          }, 500)
        }
      }
    })

    // Receive PTY exit
    const removeExitListener = window.kagora.onTerminalExit((id) => {
      if (id === agentId) {
        terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
        setExited(true)
      }
    })

    // Send keyboard input to PTY
    terminal.onData((data) => {
      window.kagora.sendTerminalInput(agentId, data)
    })

    // Send resize to PTY
    terminal.onResize(({ cols, rows }) => {
      window.kagora.resizeTerminal(agentId, cols, rows)
    })

    // Auto-fit on container resize
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) {
        try { fitAddon.fit() } catch { /* ignore */ }
      }
    })
    observer.observe(el)

    // Initial fit + focus
    const timer = setTimeout(() => {
      try { fitAddon.fit() } catch { /* ignore */ }
      terminal.focus()
    }, 100)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      el.removeEventListener('paste', handlePaste, true)
      el.removeEventListener('contextmenu', handleContextMenu)
      removeDataListener()
      removeExitListener()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      window.kagora.destroyTerminal(agentId)
    }
  }, [agentId, restartCount])

  // Reset startupSent on restart
  useEffect(() => {
    startupSentRef.current = false
  }, [restartCount])

  // Auto-focus + re-fit when tab becomes active
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => {
        try { fitAddonRef.current?.fit() } catch { /* ignore */ }
        terminalRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  const handleRestart = () => {
    setExited(false)
    setRestartCount(c => c + 1)
  }

  const handleCopyGuide = async () => {
    const guidePath = await window.kagora.getGuidePath()
    // Use forward slashes for cross-shell compatibility
    const normalized = guidePath.replace(/\\/g, '/')
    const command = `cat "${normalized}"`
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenSaveDialog = () => {
    setEditCmd(startupCommand || '')
    setShowSaveDialog(true)
  }

  const handleSaveStartup = () => {
    const cmd = editCmd.trim()
    onStartupCommandChange?.(agentId, cmd || null)
    setShowSaveDialog(false)
  }

  const handleClearStartup = () => {
    onStartupCommandChange?.(agentId, null)
    setShowSaveDialog(false)
  }

  const toolbarBtnStyle = (active?: boolean) => ({
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600 as const,
    background: active ? 'rgba(46, 160, 67, 0.3)' : 'rgba(33, 38, 45, 0.85)',
    border: '1px solid ' + (active ? '#3fb950' : '#30363d'),
    color: active ? '#3fb950' : '#8b949e',
    cursor: 'pointer' as const, transition: 'all 0.2s',
    backdropFilter: 'blur(4px)',
  })

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 8, right: 12, zIndex: 10,
        display: 'flex', gap: 6,
      }}>
        <button
          onClick={() => {
            const next = !adminMode
            onAdminModeChange?.(agentId, next)
            // Restart terminal with new privilege level
            setExited(false)
            setRestartCount(c => c + 1)
          }}
          title={adminMode ? 'Running as Administrator (click to disable)' : 'Run as Administrator'}
          style={{
            ...toolbarBtnStyle(adminMode),
            ...(adminMode ? { background: 'rgba(210, 120, 0, 0.3)', borderColor: '#ffa657', color: '#ffa657' } : {}),
          }}
        >
          {adminMode ? 'Admin' : 'Admin'}
        </button>
        <button
          onClick={handleOpenSaveDialog}
          title={startupCommand ? `Startup: ${startupCommand}` : 'Set startup command'}
          style={toolbarBtnStyle(!!startupCommand)}
        >
          {startupCommand ? 'Startup' : 'Startup'}
        </button>
        <button
          onClick={handleCopyGuide}
          title="Copy command to read AGENTS-GUIDE.md"
          style={toolbarBtnStyle(copied)}
        >
          {copied ? 'Copied!' : 'Guide'}
        </button>
      </div>

      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {exited && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '8px 16px', borderRadius: 8,
          background: 'rgba(33, 38, 45, 0.95)', border: '1px solid #30363d',
        }}>
          <span style={{ color: '#8b949e', fontSize: 13 }}>Process exited</span>
          <button
            onClick={handleRestart}
            style={{
              padding: '4px 12px', borderRadius: 6,
              background: '#238636', border: 'none',
              color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Restart
          </button>
        </div>
      )}

      {/* Save Startup Command Dialog */}
      {showSaveDialog && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowSaveDialog(false)}
        >
          <div
            style={{
              background: '#161b22', border: '1px solid #30363d',
              borderRadius: 12, padding: 24, width: 480,
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>Startup Command</h3>
            <p style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
              Terminal will auto-run this command on launch.
            </p>
            <textarea
              value={editCmd}
              onChange={e => setEditCmd(e.target.value)}
              placeholder='e.g. cd "C:\project" && claude --dangerously-skip-permissions'
              autoFocus
              rows={3}
              style={{
                width: '100%', padding: '10px 12px',
                background: '#0d1117', border: '1px solid #30363d',
                borderRadius: 8, color: '#e6edf3', fontSize: 13,
                fontFamily: "'Cascadia Mono', Consolas, monospace",
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSaveStartup()
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button
                onClick={handleClearStartup}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  background: 'transparent', border: '1px solid #30363d',
                  color: '#f85149', cursor: 'pointer', fontSize: 12,
                }}
              >
                Clear
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: '#21262d', border: '1px solid #30363d',
                    color: '#e6edf3', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveStartup}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: '#238636', border: 'none',
                    color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
