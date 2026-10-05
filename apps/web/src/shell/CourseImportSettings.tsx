import { useEffect, useMemo, useRef, useState } from 'react'
import type { Block, Semester } from '@jiwei/core'
import {
  analyzeCourseImport,
  courseImportTemplate,
  exportCourseCsv,
  exportCourseIcs,
  parseCourseIcs,
  parseCourseCsv,
  validateCourseImportFields,
  type CourseImportAnalysis,
  type CourseImportFields,
  type CourseImportOptions,
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
  const [previewBlocks, setPreviewBlocks] = useState<Block[] | null>(null)
  const [previewOptions, setPreviewOptions] = useState<CourseImportOptions | null>(null)
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
      const options = {
        semesterId: semester.id,
        totalWeeks: semester.totalWeeks,
        maxPeriod: Math.max(1, ...periods.map((period) => period.index)),
        semesterStartDate: semester.startDate,
        periods: periods.map(({ index, start, end }) => ({ index, start, end })),
      }
      const rows = /\.ics?$/i.test(file.name) ? parseCourseIcs(text, options) : parseCourseCsv(text, options)
      setPreviewBlocks(await repos.blocks.listBySemester(semester.id))
      setPreviewOptions(options)
      setPending(rows)
    } catch (err) {
      toast(`无法读取课程文件：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const analysis = useMemo(() => {
    if (!pending || !previewBlocks || !semester) return []
    return analyzeCourseImport(pending, previewBlocks, semester.id)
  }, [pending, previewBlocks, semester])

  function updateRow(line: number, key: keyof CourseImportFields, value: string): void {
    if (!previewOptions) return
    setPending((current) => current?.map((row) => row.line === line
      ? validateCourseImportFields({ ...row.fields, [key]: value }, previewOptions, row.line)
      : row) ?? null)
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
    if (!analysis.some((item) => item.row.errors.length === 0 && !item.duplicate)) {
      toast('没有可导入的正确课程，请先修改文件', 'error')
      return
    }
    setBusy(true)
    try {
      const result = await repos.importCourses(semester.id, pending)
      await refresh()
      setPending(null)
      setPreviewBlocks(null)
      setPreviewOptions(null)
      toast(`已导入 ${result.imported} 门课程${result.skipped ? `，跳过 ${result.skipped} 门重复课程` : ''}`, 'success')
    } catch (err) {
      toast(`导入失败，未修改原课表：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-medium text-muted">课程表导入</h3>
      <div className="rounded-lg border border-border px-3 py-2.5 text-xs">
        <p className="mb-2 leading-relaxed text-muted">
          支持 CSV / ICS 文件导入课程，确认预览无误后才会添加到当前课表。课程表图片识别会沿用同一套预览流程，后续再加入。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-[38px] flex-1 rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt"
            onClick={() => platform.files.download('jiwei-course-template.csv', courseImportTemplate(), 'text/csv;charset=utf-8')}
          >
            下载模板
          </button>
          <button type="button" disabled={!semester || busy} title={!semester ? '请先创建一张课表' : busy ? '正在处理' : '导出当前课表为 CSV'} className="min-h-[38px] rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt disabled:opacity-50" onClick={() => void exportCurrent()}>导出当前</button>
          <button type="button" disabled={!semester || busy} title={!semester ? '请先创建一张课表' : busy ? '正在处理' : '导出当前课次为 ICS 日历文件'} className="min-h-[38px] rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt disabled:opacity-50" onClick={() => void exportCalendar()}>导出到日历</button>
          <button
            type="button"
            disabled={!semester || busy}
            className="min-h-[38px] flex-1 rounded-lg bg-brand text-xs text-white disabled:opacity-50"
            onClick={() => input.current?.click()}
          >
            选择文件
          </button>
        </div>
        <input ref={input} type="file" accept=".csv,.ics,text/csv,text/calendar,.txt" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void pick(file)
        }} />
        {pending ? <ImportPreview analyses={analysis} busy={busy} onChange={updateRow} onCancel={() => { setPending(null); setPreviewBlocks(null); setPreviewOptions(null) }} onConfirm={() => void confirm()} /> : null}
        {!semester ? <p className="mt-2 text-[11px] text-muted">当前还没有课表；请先新建课表后再导入或导出课程。</p> : null}
        <div className="mt-3 rounded-lg border border-dashed border-border p-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">课程表图片导入</p>
            <span className="shrink-0 rounded-full bg-surface-alt px-2 py-0.5 text-[10px] text-muted">仅预览</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">当前只能在本地选择和预览图片，不能自动识别或写入课程。AI 识别会在 M8 开放，并继续先显示草稿。</p>
          <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) pickImage(file)
          }} />
          <button type="button" title="当前只能预览图片，AI 识别尚未开放" className="mt-2 min-h-[38px] w-full rounded-lg border border-border bg-surface text-xs hover:bg-surface-alt" onClick={() => imageInput.current?.click()}>选择图片预览（识别未开放）</button>
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

function ImportPreview({ analyses, busy, onChange, onCancel, onConfirm }: {
  analyses: CourseImportAnalysis[]
  busy: boolean
  onChange: (line: number, key: keyof CourseImportFields, value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const valid = analyses.filter((item) => item.row.errors.length === 0 && !item.duplicate).length
  const duplicate = analyses.filter((item) => item.duplicate).length
  return (
    <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 p-2.5">
      <p className="mb-2 font-medium">导入预览：{valid}/{analyses.length} 行可以导入</p>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {analyses.map(({ row, duplicate: isDuplicate, conflicts }) => (
          <div key={row.line} className="rounded-md bg-surface px-2 py-1.5">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate">第 {row.line} 行 · {row.title || '未填写课程名'}</span>
              <span className={row.errors.length || isDuplicate ? 'shrink-0 text-danger' : 'shrink-0 text-brand'}>{row.errors.length ? '有问题' : isDuplicate ? '重复跳过' : '可导入'}</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <input aria-label={`第${row.line}行课程名`} value={row.fields.title} onChange={(event) => onChange(row.line, 'title', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="课程名" />
              <input aria-label={`第${row.line}行教师`} value={row.fields.teacher} onChange={(event) => onChange(row.line, 'teacher', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="教师" />
              <input aria-label={`第${row.line}行教室`} value={row.fields.location} onChange={(event) => onChange(row.line, 'location', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="教室" />
              <input aria-label={`第${row.line}行星期`} value={row.fields.weekday} onChange={(event) => onChange(row.line, 'weekday', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="星期" />
              <input aria-label={`第${row.line}行开始节`} value={row.fields.periodStart} onChange={(event) => onChange(row.line, 'periodStart', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="开始节" />
              <input aria-label={`第${row.line}行结束节`} value={row.fields.periodEnd} onChange={(event) => onChange(row.line, 'periodEnd', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="结束节" />
              <input aria-label={`第${row.line}行周次`} value={row.fields.weeks} onChange={(event) => onChange(row.line, 'weeks', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="周次" />
              <input aria-label={`第${row.line}行颜色`} value={row.fields.color} onChange={(event) => onChange(row.line, 'color', event.target.value)} className="min-h-[32px] rounded border border-border bg-surface-alt px-2 text-[11px]" placeholder="颜色" />
            </div>
            {row.errors.length ? <p className="mt-0.5 text-[11px] text-danger">{row.errors.join('；')}</p> : <p className="text-[11px] text-muted">周{row.weekday} · 第 {row.periodStart}-{row.periodEnd} 节 · {row.weeks.length} 周</p>}
            {isDuplicate ? <p className="text-[11px] text-danger">与当前课表已有课程完全相同，将跳过。</p> : null}
            {!isDuplicate && conflicts.length ? <p className="text-[11px] text-amber-700">与“{conflicts.join('、')}”在相同周次和节次重叠，请确认是否继续。</p> : null}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">重复课程会自动跳过；时间重叠只提醒，不会替你删除已有课程。{duplicate ? `本次将跳过 ${duplicate} 门重复课程。` : ''}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="min-h-[36px] flex-1 rounded-lg bg-surface-alt text-xs" onClick={onCancel}>取消</button>
        <button type="button" disabled={!valid || busy} className="min-h-[36px] flex-1 rounded-lg bg-brand text-xs text-white disabled:opacity-50" onClick={onConfirm}>{busy ? '导入中…' : `确认导入 ${valid} 门`}</button>
      </div>
    </div>
  )
}
