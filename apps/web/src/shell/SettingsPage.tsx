/**
 * 设置面板：M0 只做两件有实际价值的事。
 *
 * 1. **如实展示平台能力**——让用户知道"哪些现在就能用、哪些要等原生 App"，
 *    避免对"闹钟"产生 Web 端无法兑现的预期（docs/ALARM-STUDY.md 结论 2）。
 * 2. **存储状态与持久化申请**——本地优先方案下，这是防数据丢失的第一道提示（ADR-002）。
 */
import { useEffect, useState } from 'react'
import { describeCapabilities } from '@jiwei/platform'
import type { Semester } from '@jiwei/core'
import { useJiwei } from '../JiweiContext'
import { ScheduleSettings } from './ScheduleSettings'
import { BackupSettings } from './BackupSettings'

interface Props {
  onClose: () => void
}

export function SettingsPage({ onClose }: Props) {
  const { platform, repos } = useJiwei()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [semester, setSemester] = useState<Semester | null>(null)

  useEffect(() => {
    void (async () => {
      setPersisted(await platform.storage.persisted())
      setEstimate(await platform.storage.estimate())
      setSemester(await repos.semesters.active())
    })()
  }, [platform, repos])

  const caps = describeCapabilities(platform.capabilities)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface px-4 pt-4 shadow-xl sm:max-w-md sm:rounded-2xl"
        // 底部叠加安全区，避开 iPhone 的 Home Indicator（之前漏了这一处）
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">设置</h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-alt"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        {semester ? <ScheduleSettings semester={semester} /> : null}

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
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium text-muted">关于</h3>
          <p className="text-[11px] leading-relaxed text-muted">
            几微 · jiwei —— 面向大学生的课程表应用。当前为 M0 版本，只包含课程表模块，
            数据全部存在本机，不做任何上传。建议定期到上方「备份与恢复」导出备份。
          </p>
        </section>
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
