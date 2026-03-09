import { useState, useEffect } from 'react'
import { useT, LANGUAGE_OPTIONS, type Language } from '../i18n'

interface Settings {
  adminName: string
  defaultShell: string
  terminalFontSize: number
  uiFontSize: number
  language: string
  clearChatOnExit: boolean
}

interface SettingsPanelProps {
  onSettingsChange?: (settings: Settings) => void
}

export default function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)
  const t = useT()

  useEffect(() => {
    window.kagora.getSettings().then(setSettings)
  }, [])

  const handleSave = async () => {
    if (!settings) return
    const updated = await window.kagora.updateSettings(settings)
    setSettings(updated)
    onSettingsChange?.(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return null

  return (
    <div className="settings-panel">
      <div className="settings-header">{t('settings.title')}</div>
      <div className="settings-body">
        <div className="settings-section">
          <h4>{t('settings.general')}</h4>
          <label className="settings-field">
            <span>{t('settings.adminName')}</span>
            <input
              value={settings.adminName}
              onChange={e => setSettings({ ...settings, adminName: e.target.value })}
              placeholder={t('settings.adminNamePlaceholder')}
            />
          </label>
          <label className="settings-field">
            <span>{t('settings.defaultShell')}</span>
            <input
              value={settings.defaultShell}
              onChange={e => setSettings({ ...settings, defaultShell: e.target.value })}
              placeholder={t('settings.shellPlaceholder')}
            />
          </label>
        </div>

        <div className="settings-section">
          <h4>{t('settings.ui')}</h4>
          <label className="settings-field">
            <span>{t('settings.uiFontSize')}</span>
            <div className="settings-range-row">
              <input
                type="range"
                min={10}
                max={24}
                value={settings.uiFontSize}
                onChange={e => setSettings({ ...settings, uiFontSize: Number(e.target.value) })}
              />
              <span className="settings-range-value">{settings.uiFontSize}px</span>
            </div>
          </label>
          <label className="settings-field">
            <span>{t('settings.language')}</span>
            <select
              value={settings.language}
              onChange={e => setSettings({ ...settings, language: e.target.value })}
              style={{
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 14,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {LANGUAGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="settings-section">
          <h4>{t('settings.terminal')}</h4>
          <label className="settings-field">
            <span>{t('settings.fontSize')}</span>
            <div className="settings-range-row">
              <input
                type="range"
                min={10}
                max={24}
                value={settings.terminalFontSize}
                onChange={e => setSettings({ ...settings, terminalFontSize: Number(e.target.value) })}
              />
              <span className="settings-range-value">{settings.terminalFontSize}px</span>
            </div>
          </label>
        </div>

        <div className="settings-section">
          <h4>{t('settings.chat')}</h4>
          <label className="settings-field toggle">
            <span>{t('settings.clearOnExit')}</span>
            <button
              className={`toggle-btn ${settings.clearChatOnExit ? 'on' : ''}`}
              onClick={() => setSettings({ ...settings, clearChatOnExit: !settings.clearChatOnExit })}
            >
              <span className="toggle-knob" />
            </button>
          </label>
        </div>

        <div className="settings-actions">
          <button className="primary" onClick={handleSave}>
            {saved ? t('settings.saved') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
