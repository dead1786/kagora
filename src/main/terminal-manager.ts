import * as pty from 'node-pty'
import os from 'os'
import { existsSync } from 'fs'
import { join } from 'path'

interface ManagedTerminal {
  agentId: string
  process: pty.IPty
}

export interface ShellOption {
  name: string
  path: string
}

const SHELL_PATH_RE = /^[a-zA-Z0-9_\-\\/.:\s()]+$/

function getDefaultShell(): string {
  if (os.platform() !== 'win32') return process.env.SHELL || '/bin/bash'
  const candidates = [
    join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return 'powershell.exe'
}

export function detectAvailableShells(): ShellOption[] {
  const shells: ShellOption[] = []

  if (os.platform() === 'win32') {
    // Git Bash
    const gitBashPaths = [
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
      join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
    ]
    for (const p of gitBashPaths) {
      if (p && existsSync(p)) {
        shells.push({ name: 'Git Bash', path: p })
        break
      }
    }

    // PowerShell 5.x
    shells.push({ name: 'PowerShell', path: 'powershell.exe' })

    // PowerShell 7+
    const pwshPaths = [
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '7-preview', 'pwsh.exe'),
    ]
    for (const p of pwshPaths) {
      if (existsSync(p)) {
        shells.push({ name: 'PowerShell 7', path: p })
        break
      }
    }

    // CMD
    shells.push({ name: 'CMD', path: 'cmd.exe' })

    // WSL
    const wslPath = join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'wsl.exe')
    if (existsSync(wslPath)) {
      shells.push({ name: 'WSL', path: wslPath })
    }
  } else {
    const unixShells = [
      { name: 'Bash', path: '/bin/bash' },
      { name: 'Zsh', path: '/bin/zsh' },
      { name: 'Fish', path: '/usr/bin/fish' },
    ]
    for (const s of unixShells) {
      if (existsSync(s.path)) shells.push(s)
    }
  }

  return shells
}

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>()
  private dataHandler: ((agentId: string, data: string) => void) | null = null
  private exitHandler: ((agentId: string, code: number) => void) | null = null

  onData(handler: (agentId: string, data: string) => void) {
    this.dataHandler = handler
  }

  onExit(handler: (agentId: string, code: number) => void) {
    this.exitHandler = handler
  }

  create(agentId: string, shell?: string): void {
    if (this.terminals.has(agentId)) {
      this.destroy(agentId)
    }

    const shellPath = shell || getDefaultShell()
    if (!SHELL_PATH_RE.test(shellPath) || shellPath.includes('..')) {
      console.error(`[terminal] rejected invalid shell path: ${shellPath}`)
      return
    }

    let proc: pty.IPty
    try {
      proc = pty.spawn(shellPath, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: os.homedir(),
        env: process.env as Record<string, string>,
      })
      console.log(`[terminal] PTY spawned for ${agentId}, pid: ${proc.pid}, shell: ${shellPath}`)
    } catch (err) {
      console.error(`[terminal] Failed to spawn PTY for ${agentId}:`, err)
      return
    }

    proc.onData((data) => {
      this.dataHandler?.(agentId, data)
    })

    proc.onExit(({ exitCode }) => {
      this.terminals.delete(agentId)
      this.exitHandler?.(agentId, exitCode)
    })

    this.terminals.set(agentId, { agentId, process: proc })
  }

  write(agentId: string, data: string) {
    this.terminals.get(agentId)?.process.write(data)
  }

  resize(agentId: string, cols: number, rows: number) {
    const term = this.terminals.get(agentId)
    if (term) {
      try {
        term.process.resize(Math.max(1, cols), Math.max(1, rows))
      } catch {
        // ignore resize errors (e.g., process already exited)
      }
    }
  }

  destroy(agentId: string) {
    const term = this.terminals.get(agentId)
    if (term) {
      term.process.kill()
      this.terminals.delete(agentId)
    }
  }

  destroyAll() {
    this.dataHandler = null
    this.exitHandler = null
    this.terminals.forEach((term) => {
      try { term.process.kill() } catch { /* ignore */ }
    })
    this.terminals.clear()
  }

  has(agentId: string): boolean {
    return this.terminals.has(agentId)
  }
}
