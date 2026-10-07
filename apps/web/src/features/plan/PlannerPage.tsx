import { useEffect, useMemo, useState } from 'react'
import { addDaysStr, describePlan, isPlanComplete, isPlanOverdue, planSortKey, planTypeOf, PLAN_TYPE_LABELS, today, type Block, type PlanType } from '@jiwei/core'
import { newId, nowIso } from '@jiwei/data'
import { ListIcon, PlusIcon, TrashIcon } from '@jiwei/ui'
import { useJiwei } from '../../JiweiContext'
import { useUiStore } from '../../store'
import { CloseButton } from '../../shell/CloseButton'
import { DemoImportButton } from '../../shell/DemoImportButton'

type FormValue = {
  type: PlanType
  title: string
  date: string
  endDate: string
  start: string
  end: string
  weekdays: number[]
  until: string
  location: string
  note: string
}

const emptyForm = (): FormValue => ({ type: 'deadline', title: '', date: today(), endDate: today(), start: '09:00', end: '10:00', weekdays: [1], until: '', location: '', note: '' })
const typeLabels: Record<PlanType, string> = { ...PLAN_TYPE_LABELS }

export function PlannerPage() {
  const { repos, refresh, dataVersion } = useJiwei()
  const { toast } = useUiStore()
  const [items, setItems] = useState<Block[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Block | null>(null)
  const [form, setForm] = useState<FormValue>(emptyForm)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void Promise.all([
      repos.blocks.listByKind('event'),
      repos.blocks.listByKind('exam'),
      repos.blocks.listByKind('task'),
    ]).then(([events, exams, tasks]) => {
      if (!alive) return
      setItems([...events, ...exams, ...tasks].filter((item) => item.anchor.type !== 'curriculum').sort(compareBlocks))
      setLoading(false)
    })
    return () => { alive = false }
  }, [repos, refresh, dataVersion])

  const visible = useMemo(() => {
    const from = today(); const to = addDaysStr(from, 45)
    return items.filter((item) => intersectsWindow(item, from, to))
  }, [items])

  async function save(): Promise<void> {
    const title = form.title.trim()
    if (!title) { toast('请填写计划名称', 'error'); return }
    if (form.type === 'range' && form.endDate < form.date) { toast('结束日期不能早于开始日期', 'error'); return }
    if (form.type === 'weekly' && form.weekdays.length === 0) { toast('至少选择一天', 'error'); return }
    if ((form.type === 'event' || form.type === 'weekly') && form.end <= form.start) { toast('结束时间要晚于开始时间', 'error'); return }
    const at = nowIso(); const existing = editing
    const block: Block = {
      id: existing?.id ?? newId('blk'),
      kind: form.type === 'deadline' || form.type === 'event' ? 'event' : 'task',
      title,
      planType: form.type,
      anchor: form.type === 'longterm'
        ? { type: 'floating' }
        : form.type === 'range'
          ? { type: 'range', start: form.date, end: form.endDate }
          : form.type === 'weekly'
            ? { type: 'weekly', weekdays: form.weekdays, startDate: form.date, ...(form.until ? { until: form.until } : {}), startTime: form.start, endTime: form.end }
            : form.type === 'event'
              ? { type: 'absolute', start: `${form.date}T${form.start}:00+08:00`, end: `${form.date}T${form.end}:00+08:00` }
              : { type: 'deadline', date: form.date, time: form.start },
      repeat: { mode: 'once' },
      ...(form.location.trim() ? { detail: { location: form.location.trim() } } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    }
    await repos.savePlan(block)
    const activeSemester = await repos.semesters.active()
    if (activeSemester) await repos.rebuildOccurrences(activeSemester.id)
    await refresh()
    setItems((old) => [...old.filter((item) => item.id !== block.id), block].sort(compareBlocks))
    setFormOpen(false); setEditing(null)
    toast(existing ? '计划已更新' : '计划已添加', 'success')
  }

  async function remove(block: Block): Promise<void> {
    await repos.blocks.remove(block.id)
    const activeSemester = await repos.semesters.active()
    if (activeSemester) await repos.rebuildOccurrences(activeSemester.id)
    await refresh(); setItems((old) => old.filter((item) => item.id !== block.id)); toast(`已删除「${block.title}」`, 'success')
  }

  function openAdd(): void { setEditing(null); setForm(emptyForm()); setFormOpen(true) }
  function openEdit(block: Block): void { setEditing(block); setForm(toForm(block)); setFormOpen(true) }

  async function toggleComplete(block: Block): Promise<void> {
    const date = today()
    const next: Block = block.anchor.type === 'weekly'
      ? { ...block, completedDates: isPlanComplete(block, date) ? (block.completedDates ?? []).filter((item) => item !== date) : [...(block.completedDates ?? []), date], updatedAt: nowIso() }
      : { ...block, done: !block.done, updatedAt: nowIso() }
    await repos.savePlan(next)
    await refresh()
    setItems((old) => old.map((item) => item.id === next.id ? next : item))
    toast(next.done || (next.completedDates ?? []).includes(date) ? '已标记完成' : '已恢复未完成', 'success')
  }

  return <div className="reading-view flex h-full flex-col bg-canvas">
    <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 py-2.5"><div className="flex items-center gap-2"><ListIcon className="h-5 w-5 text-brand" /><h1 className="text-[15px] font-semibold">计划</h1></div><div className="flex items-center gap-1.5"><DemoImportButton scope="agenda" /><button type="button" aria-label="添加计划" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-alt" onClick={openAdd}><PlusIcon className="h-5 w-5" /></button></div></header>
    <main className="min-h-0 flex-1 overflow-y-auto p-3"><div className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">这里集中放截止事项、长期计划、区间任务和每周重复事项。</div>{loading ? <p className="p-6 text-center text-sm text-muted">正在读取计划…</p> : visible.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center"><p className="text-sm font-medium">还没有计划</p><p className="mt-1 text-xs text-muted">把考试、报名、长期目标和每周任务放在这里。</p><button type="button" className="mt-3 rounded-lg bg-brand px-3 py-2 text-xs text-white" onClick={openAdd}>添加第一条</button></div> : <div className="space-y-2">{visible.map((item) => <PlanItem key={item.id} block={item} onEdit={() => openEdit(item)} onDelete={() => void remove(item)} onToggle={() => void toggleComplete(item)} />)}</div>}</main>
    {formOpen ? <PlanForm value={form} editing={editing !== null} onChange={setForm} onClose={() => { setFormOpen(false); setEditing(null) }} onSubmit={() => void save()} onDelete={editing ? () => void remove(editing).then(() => { setFormOpen(false); setEditing(null) }) : undefined} /> : null}
  </div>
}

function PlanItem({ block, onEdit, onDelete, onToggle }: { block: Block; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const type = planTypeOf(block)
  const complete = isPlanComplete(block, today())
  const overdue = isPlanOverdue(block, nowIso())
  return <article className={'flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3 ' + (complete ? 'opacity-60' : '')}><button type="button" aria-label={complete ? `恢复${block.title}` : `完成${block.title}`} className={'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ' + (complete ? 'border-brand bg-brand text-white' : 'border-border')} onClick={onToggle}>{complete ? '✓' : ''}</button><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className={'rounded px-1.5 py-0.5 text-[10px] ' + (overdue ? 'bg-danger/10 text-danger' : 'bg-brand/10 text-brand')}>{overdue ? '已逾期' : typeLabels[type]}</span><h2 className="truncate text-sm font-medium">{block.title}</h2></div><p className="mt-1 text-xs text-muted">{describePlan(block)}</p>{block.detail?.location ? <p className="mt-1 text-xs text-muted">地点：{block.detail.location}</p> : null}{block.note ? <p className="mt-1 truncate text-xs text-muted">{block.note}</p> : null}</div><div className="flex shrink-0 gap-1"><button type="button" className="rounded px-2 py-1 text-xs text-brand" onClick={onEdit}>编辑</button><button type="button" aria-label={`删除${block.title}`} className="rounded p-1 text-muted" onClick={onDelete}><TrashIcon className="h-4 w-4" /></button></div></article>
}

function PlanForm({ value, editing, onChange, onClose, onSubmit, onDelete }: { value: FormValue; editing: boolean; onChange: (value: FormValue) => void; onClose: () => void; onSubmit: () => void; onDelete?: () => void }) {
  const set = (key: keyof FormValue, next: string | number[]) => onChange({ ...value, [key]: next })
  const toggleDay = (day: number) => set('weekdays', value.weekdays.includes(day) ? value.weekdays.filter((item) => item !== day) : [...value.weekdays, day].sort())
  const timed = value.type === 'event' || value.type === 'weekly'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl sm:max-w-md sm:rounded-2xl" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <div className="sheet-scroll-header -mx-4 mb-3 flex items-center justify-between px-4 pb-3"><h2 className="text-sm font-semibold">{editing ? '编辑计划' : '添加计划'}</h2><CloseButton onClose={onClose} /></div>
        <div className="space-y-3 text-xs">
          <label className="block">计划类型<select className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.type} onChange={(e) => set('type', e.target.value as PlanType)}>{(['deadline', 'longterm', 'range', 'weekly', 'event'] as PlanType[]).map((key) => <option key={key} value={key}>{typeLabels[key]}</option>)}</select></label>
          <label className="block">名称<input autoFocus className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="例如：报名英语考试" /></label>
          {value.type === 'longterm' ? null : <label className="block">{value.type === 'range' || value.type === 'weekly' ? '开始日期' : value.type === 'event' ? '日期' : '截止日期'}<input type="date" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.date} onChange={(e) => set('date', e.target.value)} /></label>}
          {value.type === 'range' ? <label className="block">结束日期<input type="date" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.endDate} onChange={(e) => set('endDate', e.target.value)} /></label> : null}
          {value.type === 'deadline' ? <label className="block">截止时间（可留空）<input type="time" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.start} onChange={(e) => set('start', e.target.value)} /></label> : null}
          {timed ? <div className="grid grid-cols-2 gap-2"><label>开始时间<input type="time" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.start} onChange={(e) => set('start', e.target.value)} /></label><label>结束时间<input type="time" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.end} onChange={(e) => set('end', e.target.value)} /></label></div> : null}
          {value.type === 'weekly' ? <><div><span>每周几</span><div className="mt-1 grid grid-cols-7 gap-1">{['一','二','三','四','五','六','日'].map((label, index) => <label key={label} className="rounded border border-border px-1 py-2 text-center"><input type="checkbox" checked={value.weekdays.includes(index + 1)} onChange={() => toggleDay(index + 1)} /><span className="ml-1">{label}</span></label>)}</div></div><label className="block">重复到（可留空）<input type="date" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.until} onChange={(e) => set('until', e.target.value)} /></label></> : null}
          <label className="block">地点<input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.location} onChange={(e) => set('location', e.target.value)} placeholder="可选" /></label>
          <label className="block">备注<textarea className="mt-1 min-h-20 w-full rounded-lg border border-border bg-surface px-3 py-2" value={value.note} onChange={(e) => set('note', e.target.value)} placeholder="可选" /></label>
        </div>
        <div className="mt-4 flex gap-2"><button type="button" className="flex-1 rounded-lg bg-brand py-2.5 text-xs font-medium text-white" onClick={onSubmit}>保存</button>{onDelete ? <button type="button" className="rounded-lg border border-danger/30 px-3 py-2.5 text-xs text-danger" onClick={onDelete}>删除</button> : null}</div>
      </div>
    </div>
  )
}
function blockStart(block: Block): string | null { const anchor = block.anchor; if (anchor.type === 'floating' || anchor.type === 'curriculum') return null; if (anchor.type === 'range') return anchor.start; if (anchor.type === 'weekly') return anchor.startDate; if (anchor.type === 'allDay' || anchor.type === 'deadline') return anchor.date; return anchor.start.slice(0, 10) }
function blockEnd(block: Block): string | null { if (block.anchor.type === 'floating') return null; if (block.anchor.type === 'range') return block.anchor.end; if (block.anchor.type === 'weekly') return block.anchor.until ?? '9999-12-31'; if (block.anchor.type === 'deadline') return block.anchor.date; return blockStart(block) }
function intersectsWindow(block: Block, from: string, to: string): boolean { const start = blockStart(block); const end = blockEnd(block); return start === null || (start <= to && (end ?? start) >= from) }
function compareBlocks(a: Block, b: Block): number { return planSortKey(a).localeCompare(planSortKey(b)) || a.title.localeCompare(b.title, 'zh-CN') }
function toForm(block: Block): FormValue { const type = planTypeOf(block); const base = emptyForm(); if (block.anchor.type === 'floating' || block.anchor.type === 'curriculum') return { ...base, type, title: block.title, location: block.detail?.location ?? '', note: block.note ?? '' }; if (block.anchor.type === 'range') return { ...base, type, title: block.title, date: block.anchor.start, endDate: block.anchor.end, location: block.detail?.location ?? '', note: block.note ?? '' }; if (block.anchor.type === 'weekly') return { ...base, type, title: block.title, date: block.anchor.startDate, until: block.anchor.until ?? '', start: block.anchor.startTime ?? '09:00', end: block.anchor.endTime ?? '10:00', weekdays: block.anchor.weekdays, location: block.detail?.location ?? '', note: block.note ?? '' }; if (block.anchor.type === 'deadline') return { ...base, type, title: block.title, date: block.anchor.date, start: block.anchor.time ?? '23:59', location: block.detail?.location ?? '', note: block.note ?? '' }; return { ...base, type: 'event', title: block.title, date: block.anchor.type === 'allDay' ? block.anchor.date : block.anchor.start.slice(0, 10), start: block.anchor.type === 'absolute' ? block.anchor.start.slice(11, 16) : '09:00', end: block.anchor.type === 'absolute' ? block.anchor.end.slice(11, 16) : '10:00', location: block.detail?.location ?? '', note: block.note ?? '' } }
