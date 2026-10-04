/**
 * 备份与恢复。
 *
 * 为什么放在设置里显眼位置：本项目按 ADR-002 是**本地优先、无服务器**，
 * 而调研确认 iOS 上 IndexedDB 可能静默丢失数据（WebKit #277615，
 * Dexie 作者本人确认无法绕过）。**除了自己导出，没有别的兜底**。
 */
import { useRef, useState } from 'react'
import {
  backupFileName,
  describeBackup,
  exportBackup,
  importBackup,
  parseBackup,
  type BackupFile,
} from '@jiwei/data'
import { useJiwei } from '../JiweiContext'
import { useUiStore } from '../store'

export function BackupSettings() {
  const { repos, platform, refresh } = useJiwei()
  const toast = useUiStore((s) => s.toast)
  const setSemester = useUiStore((s) => s.setSemester)
  const setWeek = useUiStore((s) => s.setWeek)
  const setDayViewWeekday = useUiStore((s) => s.setDayViewWeekday)
  const setView = useUiStore((s) => s.setView)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  /** 待确认的导入文件（先给用户看清楚要覆盖成什么，再动手） */
  const [pending, setPending] = useState<{ text: string; file: BackupFile } | null>(null)

  async function handleExport(): Promise<void> {
    setBusy(true)
    try {
      const text = await exportBackup(repos)
      platform.files.download(backupFileName(), text, 'application/json')
      toast('备份已导出到下载目录', 'success')
    } catch (err) {
      toast(`导出失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handlePickFile(file: File): Promise<void> {
    try {
      const text = await file.text()
      // 先校验再让用户确认：坏文件不该走到"确认覆盖"这一步
      setPending({ text, file: parseBackup(text) })
    } catch (err) {
      toast(`无法读取该备份：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleConfirmImport(): Promise<void> {
    if (!pending) return
    setBusy(true)
    try {
      const result = await importBackup(repos, pending.text)
      const active = await repos.semesters.active()
      // 恢复可能来自另一台设备：旧的学期快照、周次和日视图都不能继续沿用。
      setSemester(active)
      setWeek(null)
      setDayViewWeekday(null)
      setView('timetable')
      await refresh()
      setPending(null)
      toast(`已恢复 ${result.semesters} 个学期、${result.blocks} 门课程`, 'success')
    } catch (err) {
      toast(`恢复失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-medium text-muted">备份与恢复</h3>

      <div className="rounded-lg border border-border px-3 py-2.5 text-xs">
        <p className="mb-2 leading-relaxed text-muted">
          课表只存在这台设备的浏览器里。iOS 上浏览器可能清理本地数据，
          <strong className="text-ink">建议每学期导出一次备份</strong>。
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            className="min-h-[38px] flex-1 rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt disabled:opacity-50"
            onClick={() => void handleExport()}
          >
            导出备份
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-[38px] flex-1 rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt disabled:opacity-50"
            onClick={() => fileInput.current?.click()}
          >
            从备份恢复
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handlePickFile(file)
          }}
        />

        {/* 二次确认：先把"将被覆盖成什么"讲清楚 */}
        {pending ? (
          <div className="mt-2.5 rounded-md border border-danger/40 bg-danger/5 p-2.5">
            <p className="mb-1 font-medium text-danger">恢复会覆盖当前全部数据</p>
            <p className="mb-2 leading-relaxed text-muted">{describeBackup(pending.file)}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-[36px] flex-1 rounded-lg bg-surface-alt text-xs"
                onClick={() => setPending(null)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy}
                className="min-h-[36px] flex-1 rounded-lg bg-danger text-xs text-white disabled:opacity-60"
                onClick={() => void handleConfirmImport()}
              >
                {busy ? '恢复中…' : '确认覆盖'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
