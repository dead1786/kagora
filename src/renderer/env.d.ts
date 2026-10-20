interface KagoraAPI {
  createTerminal: (agentId: string, shell?: string, adminMode?: boolean) => Promise<boolean>
  sendTerminalInput: (agentId: string, data: string) => void
  notifyTyping: (agentId: string) => void
  onTerminalData: (callback: (agentId: string, data: string) => void) => () => void
  resizeTerminal: (agentId: string, cols: number, rows: number) => void
  destroyTerminal: (agentId: string) => Promise<boolean>
  onTerminalExit: (callback: (agentId: string, code: number) => void) => () => void
  getAvailableShells: () => Promise<{ name: string; path: string }[]>
  getGuidePath: () => Promise<string>
  sendChat: (from: string, to: string, text: string) => Promise<any>
  onChatMessage: (callback: (msg: any) => void) => () => void
  getChatHistory: (channel: string) => Promise<any[]>
  getAgents: () => Promise<any[]>
  addAgent: (agent: any) => Promise<boolean>
  updateAgent: (id: string, partial: any) => Promise<any[]>
  removeAgent: (id: string) => Promise<boolean>
  getSettings: () => Promise<any>
  updateSettings: (partial: any) => Promise<any>
  getAutomations: () => Promise<any[]>
  addAutomation: (auto: any) => Promise<any>
  updateAutomation: (id: string, partial: any) => Promise<any[]>
  removeAutomation: (id: string) => Promise<boolean>
}

interface Window {
  kagora: KagoraAPI
}
