import { useEffect, useState } from 'react'
import type { AppConfig, BackupInfo, Settings } from '@shared/types'
import Modal from './Modal'

interface Props {
  config: AppConfig
  onChangeSettings(s: Settings): void
  onRestore(cfg: AppConfig): void
  onLog(summary: string, ok: boolean): void
  onClose(): void
}

export default function SettingsDialog({ config, onChangeSettings, onRestore, onLog, onClose }: Props) {
  const [backups, setBackups] = useState<BackupInfo[]>([])

  const refresh = (): void => {
    void window.api.listBackups().then(setBackups)
  }
  useEffect(refresh, [])

  const doBackup = async (): Promise<void> => {
    try {
      await window.api.backupConfig()
      onLog('配置已备份', true)
    } catch (e) {
      onLog(`配置备份失败: ${e instanceof Error ? e.message : String(e)}`, false)
    }
    refresh()
  }

  const doRestore = async (b: BackupInfo): Promise<void> => {
    if (!confirm(`确定恢复配置 ${b.file}？当前配置将被覆盖。`)) return
    const cfg = await window.api.restoreConfig(b.path)
    onRestore(cfg)
    onLog(`配置已恢复: ${b.file}`, true)
    onClose()
  }

  return (
    <Modal
      title="设置"
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>关闭</button>
        </>
      }
    >
      <label className="check-item">
        <input
          type="checkbox"
          checked={config.settings.backupBeforeImport}
          onChange={e => onChangeSettings({ ...config.settings, backupBeforeImport: e.target.checked })}
        />
        <span>导入前备份目标目录（关闭则直接删除重建）</span>
      </label>

      <div className="section-title">
        配置备份
        <button className="btn" onClick={() => void doBackup()}>立即备份</button>
      </div>
      <div className="backup-list">
        {backups.length === 0 && <div className="empty">暂无备份</div>}
        {backups.map(b => (
          <div key={b.path} className="backup-item">
            <span className="name">{b.file}</span>
            <span className="dim">{new Date(b.mtime).toLocaleString()}</span>
            <button className="btn" onClick={() => void doRestore(b)}>恢复</button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
