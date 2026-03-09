import { useState, useEffect } from 'react'
import { useT } from '../i18n'

interface Automation {
  id: string
  name: string
  description?: string
  script: string
  target: string
  schedule: string
  method: 'chat' | 'inject'
  enabled: boolean
}

export default function AutomationsPanel() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const t = useT()

  useEffect(() => {
    window.kagora.getAutomations().then(setAutomations)
  }, [])

  const handleAdd = async (auto: Omit<Automation, 'id'>) => {
    const created = await window.kagora.addAutomation(auto)
    setAutomations(prev => [...prev, created])
    setShowAdd(false)
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    const updated = await window.kagora.updateAutomation(id, { enabled })
    setAutomations(updated)
  }

  const handleRemove = async (id: string) => {
    await window.kagora.removeAutomation(id)
    setAutomations(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="settings-panel">
      <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{t('auto.title')}</span>
        <button className="auto-add-btn" onClick={() => setShowAdd(true)}>{t('auto.add')}</button>
      </div>
      <div className="settings-body" style={{ overflowY: 'auto' }}>
        {automations.length === 0 && !showAdd && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
            {t('auto.empty')}
          </div>
        )}

        {showAdd && (
          <AddForm
            onAdd={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        )}

        <div className="auto-list">
          {automations.map(auto => (
            <div key={auto.id} className={`auto-card ${auto.enabled ? '' : 'disabled'}`}>
              <div className="auto-card-header">
                <div className="auto-card-title">
                  <span className={`auto-status ${auto.enabled ? 'on' : 'off'}`} />
                  <strong>{auto.name}</strong>
                </div>
                <div className="auto-card-actions">
                  <button
                    className="auto-toggle"
                    onClick={() => handleToggle(auto.id, !auto.enabled)}
                    title={auto.enabled ? 'Disable' : 'Enable'}
                  >
                    {auto.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    className="auto-remove"
                    onClick={() => handleRemove(auto.id)}
                    title="Remove"
                  >
                    x
                  </button>
                </div>
              </div>
              {auto.description && (
                <div style={{
                  fontSize: 12, color: 'var(--text-secondary)',
                  marginBottom: 8, lineHeight: 1.5,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'var(--bg-tertiary)',
                }}>
                  {auto.description}
                </div>
              )}
              <div className="auto-card-body">
                <div className="auto-field">
                  <span className="auto-label">{t('auto.script')}</span>
                  <span className="auto-value mono">{auto.script}</span>
                </div>
                <div className="auto-field">
                  <span className="auto-label">{t('auto.target')}</span>
                  <span className="auto-value">{auto.target}</span>
                </div>
                <div className="auto-field">
                  <span className="auto-label">{t('auto.schedule')}</span>
                  <span className="auto-value">{auto.schedule}</span>
                </div>
                <div className="auto-field">
                  <span className="auto-label">{t('auto.method')}</span>
                  <span className="auto-value">
                    {auto.method === 'chat' ? t('auto.methodChat') : t('auto.methodInject')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AddForm({ onAdd, onCancel }: {
  onAdd: (auto: Omit<Automation, 'id'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [script, setScript] = useState('')
  const [target, setTarget] = useState('')
  const [schedule, setSchedule] = useState('')
  const [method, setMethod] = useState<'chat' | 'inject'>('inject')
  const t = useT()

  const canSubmit = name && script && target && schedule

  return (
    <div className="auto-add-form">
      <h4>{t('auto.newTitle')}</h4>
      <input placeholder={t('auto.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} autoFocus />
      <input
        placeholder={t('auto.descPlaceholder')}
        value={description}
        onChange={e => setDescription(e.target.value)}
        style={{ color: 'var(--text-secondary)' }}
      />
      <input placeholder={t('auto.scriptPlaceholder')} value={script} onChange={e => setScript(e.target.value)} />
      <input placeholder={t('auto.targetPlaceholder')} value={target} onChange={e => setTarget(e.target.value)} />
      <input placeholder={t('auto.schedulePlaceholder')} value={schedule} onChange={e => setSchedule(e.target.value)} />
      <div className="auto-method-row">
        <label>
          <input type="radio" name="method" checked={method === 'inject'} onChange={() => setMethod('inject')} />
          {t('auto.methodInject')}
        </label>
        <label>
          <input type="radio" name="method" checked={method === 'chat'} onChange={() => setMethod('chat')} />
          {t('auto.methodChat')}
        </label>
      </div>
      <div className="dialog-actions">
        <button onClick={onCancel}>{t('auto.cancel')}</button>
        <button
          className="primary"
          disabled={!canSubmit}
          onClick={() => onAdd({
            name, script, target, schedule, method, enabled: true,
            description: description.trim() || undefined
          })}
        >
          {t('auto.addBtn')}
        </button>
      </div>
    </div>
  )
}
