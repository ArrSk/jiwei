import { useEffect, useRef, useState } from 'react'
import type { Semester } from '@jiwei/core'
import {
  courseImportRowToBlock,
  courseImportTemplate,
  exportCourseCsv,
  exportCourseIcs,
  newId,
  nowIso,
  parseCourseCsv,
  type CourseImportRow,
} from '@jiwei/data'
import { useJiwei } from '../JiweiContext'
import { useUiStore } from '../store'

export function CourseImportSettings({ semester }: { semester: Semester | null }) {
  const { repos, platform, refresh } = useJiwei()
  const toast = useUiStore((s) => s.toast)
  const input = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<CourseImportRow[] | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  async function pick(file: File): Promise<void> {
    if (!semester) return
    try {
      const text = await file.text()
      const periods = await repos.periods.listBySemester(semester.id)
      const rows = parseCourseCsv(text, {
        semesterId: semester.id,
        totalWeeks: semester.totalWeeks,
        maxPeriod: Math.max(1, ...periods.map((period) => period.index)),
      })
      setPending(rows)
    } catch (err) {
      toast(`无法读取课程文件：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function exportCurrent(): Promise<void> {
    if (!semester) return
    try {
      const blocks = await repos.blocks.listBySemester(semester.id)
      const name = semester.name.replace(/[\\/:*?"<>|]/g, '-').trim() || '课程表'
      platform.files.download(`jiwei-${name}.csv`, exportCourseCsv(blocks), 'text/csv;charset=utf-8')
      toast(`已导出 ${blocks.length} 门课程`, 'success')
    } catch (err) {
      toast(`导出失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  async function exportCalendar(): Promise<void> {
    if (!semester) return
    try {
      const [blocks, occurrences] = await Promise.all([
        repos.blocks.listBySemester(semester.id),
        repos.occurrences.listBySemester(semester.id),
      ])
      const name = semester.name.replace(/[\\/:*?"<>|]/g, '-').trim() || '课程表'
      platform.files.download(`jiwei-${name}.ics`, exportCourseIcs(blocks, occurrences, semester.name), 'text/calendar;charset=utf-8')
      toast('已导出日历文件，可导入系统日历', 'success')
    } catch (err) {
      toast(`日历导出失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  function pickImage(file: File): void {
    setImagePreview(URL.createObjectURL(file))
    if (imageInput.current) imageInput.current.value = ''
  }

  async function confirm(): Promise<void> {
    if (!semester || !pending) return
    const valid = pending.filter((row) => row.errors.length === 0)
    if (!valid.length) {
      toast('没有可导入的正确课程，请先修改文件', 'error')
      return
    }
    setBusy(true)
    const snapshot = await repos.dumpAll()
    try {
      const now = nowIso()
      for (const row of valid) {
        await repos.blocks.put(courseImportRowToBlock(row, semester.id, newId('blk'), now))
      }
      await repos.rebuildOccurrences(semester.id)
      await refresh()
      setPending(null)
      toast(`已导入 ${valid.length} 门课程`, 'success')
    } catch (err) {
      try { await repos.restoreAll(snapshot) } catch { /* 保留原错误，恢复失败由下次备份兜底 */ }
      toast(`导入失败，未保留部分结果：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-medium text-muted">课程表导入</h3>
      <div className="rounded-lg border border-border px-3 py-2.5 text-xs">
        <p className="mb-2 leading-relaxed text-muted">
          先用 CSV 文件导入课程，确认预览无误后才会添加到当前课表。课程表图片识别会沿用同一套预览流程，后续再加入。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-[38px] flex-1 rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt"
            onClick={() => platform.files.download('jiwei-course-template.csv', courseImportTemplate(), 'text/csv;charset=utf-8')}
          >
            下载模板
          </button>
          <button type="button" disabled={!semester || busy} className="min-h-[38px] rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt disabled:opacity-50" onClick={() => void exportCurrent()}>导出当前</button>
          <button type="button" disabled={!semester || busy} className="min-h-[38px] rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt disabled:opacity-50" onClick={() => void exportCalendar()}>导出到日历</button>
          <button
            type="button"
            disabled={!semester || busy}
            className="min-h-[38px] flex-1 rounded-lg bg-brand text-xs text-white disabled:opacity-50"
            onClick={() => input.current?.click()}
          >
            选择文件
          </button>
        </div>
        <input ref={input} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void pick(file)
        }} />
        {pending ? <ImportPreview rows={pending} busy={busy} onCancel={() => setPending(null)} onConfirm={() => void confirm()} /> : null}
        <div className="mt-3 rounded-lg border border-dashed border-border p-2.5">
          <p className="font-medium">课程表图片导入</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">现在先支持本地选择和预览图片，不会自动写入课程。AI 识别结果接入后，也会先经过同样的预览确认。</p>
          <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) pickImage(file)
          }} />
          <button type="button" className="mt-2 min-h-[38px] w-full rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt" onClick={() => imageInput.current?.click()}>选择课程表图片</button>
          {imagePreview ? (
            <div className="mt-2 rounded-lg bg-surface-alt p-2">
              <img src={imagePreview} alt="课程表图片预览" className="max-h-48 w-full rounded object-contain" />
              <button type="button" className="mt-2 min-h-[36px] w-full rounded-lg border border-border bg-surface text-xs" onClick={() => setImagePreview(null)}>清除图片</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ImportPreview({ rows, busy, onCancel, onConfirm }: {
  rows: CourseImportRow[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const valid = rows.filter((row) => row.errors.length === 0).length
  return (
    <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 p-2.5">
      <p className="mb-2 font-medium">导入预览：{valid}/{rows.length} 行可以导入</p>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {rows.map((row) => (
          <div key={row.line} className="rounded-md bg-surface px-2 py-1.5">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate">第 {row.line} 行 · {row.title || '未填写课程名'}</span>
              <span className={row.errors.length ? 'shrink-0 text-danger' : 'shrink-0 text-brand'}>{row.errors.length ? '有问题' : '可导入'}</span>
            </div>
            {row.errors.length ? <p className="mt-0.5 text-[11px] text-danger">{row.errors.join('；')}</p> : <p className="text-[11px] text-muted">周{row.weekday} · 第 {row.periodStart}-{row.periodEnd} 节 · {row.weeks.length} 周</p>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">导入会新增课程，不会覆盖当前已有课程。</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="min-h-[36px] flex-1 rounded-lg bg-surface-alt text-xs" onClick={onCancel}>取消</button>
        <button type="button" disabled={!valid || busy} className="min-h-[36px] flex-1 rounded-lg bg-brand text-xs text-white disabled:opacity-50" onClick={onConfirm}>{busy ? '导入中…' : `确认导入 ${valid} 门`}</button>
      </div>
    </div>
  )
}
