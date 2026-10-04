import { useEffect, useState } from 'react'
import type { Semester } from '@jiwei/core'
import { useJiwei } from '../JiweiContext'
import { CourseImportSettings } from './CourseImportSettings'
import { ScheduleSettings } from './ScheduleSettings'

/** 只放课表专属配置；入口位于课程表顶部的小日历按钮。 */
export function TimetableSettingsPage({ onClose, onManageSemesters }: {
  onClose: () => void
  onManageSemesters: () => void
}) {
  const { repos } = useJiwei()
  const [semester, setSemester] = useState<Semester | null>(null)

  useEffect(() => {
    let alive = true
    void repos.semesters.active().then((active) => { if (alive) setSemester(active) })
    return () => { alive = false }
  }, [repos])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface px-4 pt-4 shadow-xl sm:max-w-md sm:rounded-2xl"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">课表设置</h2>
          <button type="button" className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-alt" onClick={onClose}>关闭</button>
        </div>

        <section className="mb-4">
          <h3 className="mb-2 text-xs font-medium text-muted">当前课表</h3>
          <div className="rounded-lg border border-border px-3 py-2 text-xs">
            <div className="flex justify-between py-0.5"><span className="text-muted">名称</span><span>{semester?.name ?? '—'}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-muted">开学日 / 总周数</span><span>{semester ? `${semester.startDate} / ${semester.totalWeeks} 周` : '—'}</span></div>
          </div>
          <button type="button" className="mt-2 w-full rounded-lg border border-border bg-surface py-2 text-xs hover:bg-surface-alt" onClick={onManageSemesters}>新建 / 切换 / 删除课表</button>
        </section>

        <CourseImportSettings semester={semester} />
        {semester ? <ScheduleSettings semester={semester} /> : null}
        <p className="mb-2 text-[11px] leading-relaxed text-muted">这里的选项只影响课程表，不会改变今天首页的显示、安装和备份设置。</p>
      </div>
    </div>
  )
}
