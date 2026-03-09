import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('kagora', {
  // Terminal
  createTerminal: (agentId: string, shell?: string, adminMode?: boolean) =>
    ipcRenderer.invoke('terminal:create', agentId, shell, adminMode),
  sendTerminalInput: (agentId: string, data: string) =>
    ipcRenderer.send('terminal:input', agentId, data),
  onTerminalData: (callback: (agentId: string, data: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, agentId: string, data: string) =>
      callback(agentId, data)
    ipcRenderer.on('terminal:data', handler)
    return () => { ipcRenderer.removeListener('terminal:data', handler) }
  },
  resizeTerminal: (agentId: string, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', agentId, cols, rows),
  destroyTerminal: (agentId: string) =>
    ipcRenderer.invoke('terminal:destroy', agentId),
  onTerminalExit: (callback: (agentId: string, code: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, agentId: string, code: number) =>
      callback(agentId, code)
    ipcRenderer.on('terminal:exit', handler)
    return () => { ipcRenderer.removeListener('terminal:exit', handler) }
  },

  // Shell detection
  getAvailableShells: () => ipcRenderer.invoke('shell:list'),

  // Guide path
  getGuidePath: () => ipcRenderer.invoke('app:guidePath') as Promise<string>,

  // Chat
  sendChat: (from: string, to: string, text: string) =>
    ipcRenderer.invoke('chat:send', from, to, text),
  onChatMessage: (callback: (msg: any) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: any) => callback(msg)
    ipcRenderer.on('chat:message', handler)
    return () => { ipcRenderer.removeListener('chat:message', handler) }
  },
  getChatHistory: (channel: string) =>
    ipcRenderer.invoke('chat:history', channel),

  // Agents
  getAgents: () => ipcRenderer.invoke('agent:list'),
  addAgent: (agent: any) => ipcRenderer.invoke('agent:add', agent),
  updateAgent: (id: string, partial: any) => ipcRenderer.invoke('agent:update', id, partial),
  removeAgent: (id: string) => ipcRenderer.invoke('agent:remove', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial: any) => ipcRenderer.invoke('settings:update', partial),

  // Automations
  getAutomations: () => ipcRenderer.invoke('automations:list'),
  addAutomation: (auto: any) => ipcRenderer.invoke('automations:add', auto),
  updateAutomation: (id: string, partial: any) => ipcRenderer.invoke('automations:update', id, partial),
  removeAutomation: (id: string) => ipcRenderer.invoke('automations:remove', id)
})
