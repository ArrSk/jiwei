/**
 * 设置面板：M0 只做两件有实际价值的事。
 *
 * 1. **如实展示平台能力**——让用户知道"哪些现在就能用、哪些要等原生 App"，
 *    避免对"闹钟"产生 Web 端无法兑现的预期（docs/research/ALARM-STUDY.md 结论 2）。
 * 2. **存储状态与持久化申请**——本地优先方案下，这是防数据丢失的第一道提示（ADR-002）。
 */
import { useEffect, useState } from 'react'
import { describeCapabilities } from '@jiwei/platform'
import { useJiwei } from '../JiweiContext'
import { BackupSettings } from './BackupSettings'
import { ReadingSettings } from './ReadingSettings'
import { InstallGuide } from './InstallGuide'
import { useModules } from '../ModuleContext'
import { CloseButton } from './CloseButton'
import { DemoImportButton } from './DemoImportButton'

interface Props {
  onClose: () => void
  onOpenTimetableSettings: () => void
  mode?: 'sheet' | 'page'
}

export function SettingsPage({ onClose, onOpenTimetableSettings, mode = 'sheet' }: Props) {
  const { platform } = useJiwei()
  const { preferences, setEnabled } = useModules()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)

  useEffect(() => {
    void (async () => {
      setPersisted(await platform.storage.persisted())
      setEstimate(await platform.storage.estimate())
    })()
  }, [platform])

  const caps = describeCapabilities(platform.capabilities)

  return (
    <div className={mode === 'page' ? 'h-full overflow-y-auto bg-canvas' : 'fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center'}>
      <div
        className={mode === 'page' ? 'mx-auto min-h-full w-full max-w-md bg-surface px-4 pt-4' : 'max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface px-4 pt-4 shadow-xl sm:max-w-md sm:rounded-2xl'}
        // 底部叠加安全区，避开 iPhone 的 Home Indicator（之前漏了这一处）
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="sheet-scroll-header -mx-4 mb-3 flex items-center justify-between px-4 pb-3">
          <h2 className="text-sm font-semibold">设置</h2>
          <CloseButton onClose={onClose} />
        </div>

        <ReadingSettings />
        <InstallGuide />

        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium text-muted">功能模块</h3>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            <ModuleToggle label="今天" note="当天课程和计划摘要" enabled={preferences.today} onChange={(value) => void setEnabled('today', value)} />
            <ModuleToggle label="课程表" note="周视图、日视图和课程编辑" enabled={preferences.timetable} onChange={(value) => void setEnabled('timetable', value)} />
            <ModuleToggle label="计划" note="截止、长期、区间和每周事项" enabled={preferences.agenda} onChange={(value) => void setEnabled('agenda', value)} />
            <ModuleToggle label="待办" note="已开放：截止日、完成和长期事项" enabled={preferences.tasks} onChange={(value) => void setEnabled('tasks', value)} />
            <ModuleToggle label="记账" note="M5 下一步开放" enabled={preferences.ledger} onChange={(value) => void setEnabled('ledger', value)} />
            <ModuleToggle label="笔记" note="M7 逐步开放" enabled={preferences.notes} onChange={(value) => void setEnabled('notes', value)} />
            <ModuleToggle label="AI 助手" note="M8 逐步开放" enabled={preferences.assistant} onChange={(value) => void setEnabled('assistant', value)} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">关闭模块只会隐藏入口，不会删除已保存的数据。</p>
        </section>

        <section className="mb-4 rounded-lg border border-brand/20 bg-brand/5 px-3 py-3">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-xs font-medium">体验示例数据</h3><p className="mt-1 text-[11px] leading-relaxed text-muted">一次导入课程、计划和待办示例；重复点击跳过已存在的内容。示例可编辑或删除。</p></div><DemoImportButton scope="all" /></div>
        </section>

        <BackupSettings />

        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium text-muted">当前平台能力</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {caps.map((c) => (
              <li key={c.label} className="flex items-start gap-2 px-3 py-2 text-xs">
                <span className={c.ok ? 'text-brand' : 'text-muted'}>{c.ok ? '✓' : '—'}</span>
                <span className="flex-1">
                  <span className="font-medium">{c.label}</span>
                  <span className="ml-1 text-muted">{c.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            闹钟（锁屏响铃）在浏览器里做不到：浏览器会冻结后台定时器，Web 推送也无权响铃。
            计划在 M5 用 Capacitor 打包成原生 App 来解决。
          </p>
          <p className="mt-1 text-[11px] text-muted">
            上表只给已经能用的能力打勾；模块开关里的预留入口会明确标注开放阶段
            （见 docs/ROADMAP.md）。
          </p>
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted">后续功能</h3>
            <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] text-muted">开发中</span>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            <PlannedFeature name="记账" stage="M5" note="下一步加入收入、支出和今日汇总" />
            <PlannedFeature name="提醒 / 原生通知" stage="M6" note="浏览器目前不能保证锁屏提醒" />
            <PlannedFeature name="文字 / 手写笔记" stage="M7" note="会加入课程关联和搜索" />
            <PlannedFeature name="AI 助手 / 图片识别" stage="M8" note="默认关闭，只生成待确认草稿" />
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">列表只展示尚未开放的功能；已开放模块请在上面的开关中管理。</p>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium text-muted">本地数据</h3>
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <div className="flex justify-between py-0.5">
              <span className="text-muted">存储引擎</span>
              <span>IndexedDB（Dexie）</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted">持久化已授予</span>
              <span>{persisted === null ? '检测中…' : persisted ? '是' : '否'}</span>
            </div>
            {estimate ? (
              <div className="flex justify-between py-0.5">
                <span className="text-muted">已用 / 配额</span>
                <span>
                  {formatBytes(estimate.usage)} / {formatBytes(estimate.quota)}
                </span>
              </div>
            ) : null}
          </div>
          {persisted === false ? (
            <button
              type="button"
              className="mt-2 w-full rounded-lg border border-border bg-surface py-2 text-xs hover:bg-surface-alt"
              onClick={() => {
                void platform.storage.requestPersistence().then(setPersisted)
              }}
            >
              申请持久化存储（避免浏览器自动清理数据）
            </button>
          ) : null}
          {platform.capabilities.canPersistStorage === false ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">当前浏览器不支持持久化申请，请定期导出备份，避免浏览器清理本地数据。</p>
          ) : null}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium text-muted">课表功能设置</h3>
          <div className="mb-4 rounded-lg border border-border px-3 py-2.5 text-xs">
            <p className="leading-relaxed text-muted">学期、作息和课程导入只在课程表页面使用，已集中到课程表顶部的小日历按钮。</p>
            <button type="button" className="mt-2 w-full rounded-lg border border-border bg-surface py-2 text-xs hover:bg-surface-alt" onClick={onOpenTimetableSettings}>打开课表设置</button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium text-muted">关于</h3>
          <p className="text-[11px] leading-relaxed text-muted">
            几微 · jiwei —— 面向大学生的课程表应用。目前提供今天、课程表和计划，
            数据全部存在本机，不做任何上传。建议定期到上方「备份与恢复」导出备份。
          </p>
        </section>
      </div>
    </div>
  )
}

function ModuleToggle({ label, note, enabled, onChange, disabled = false, locked = false }: { label: string; note: string; enabled: boolean; onChange?: (value: boolean) => void; disabled?: boolean; locked?: boolean }) {
  return (
    <label className={'flex items-center gap-3 px-3 py-2.5 text-xs ' + (disabled ? 'opacity-60' : 'cursor-pointer')}>
      <span className="min-w-0 flex-1"><span className="font-medium">{label}</span><span className="ml-1 text-muted">{note}</span></span>
      <input type="checkbox" checked={enabled} disabled={disabled || locked} onChange={(event) => onChange?.(event.target.checked)} />
      {locked ? <span className="text-[10px] text-muted">必选</span> : null}
    </label>
  )
}

function PlannedFeature({ name, stage, note }: { name: string; stage: string; note: string }) {
  return (
    <li className="flex items-start gap-2 px-3 py-2 text-xs">
      <span className="mt-0.5 shrink-0 rounded bg-surface-alt px-1.5 py-0.5 text-[10px] text-muted">{stage}</span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{name}</span>
        <span className="ml-1 text-muted">{note}</span>
      </span>
    </li>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
