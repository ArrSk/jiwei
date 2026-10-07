import { useEffect, useMemo, useState } from 'react'
import { describePlan, isPlanComplete, isPlanOverdue, planTypeOf, today, type Block } from '@jiwei/core'
import { newId, nowIso } from '@jiwei/data'
import { ListIcon, PlusIcon, TrashIcon } from '@jiwei/ui'
import { useJiwei } from '../../JiweiContext'
import { useUiStore } from '../../store'
import { DemoImportButton } from '../../shell/DemoImportButton'

type TaskForm = { title: string; dueDate: string; note: string }
const emptyForm = (): TaskForm => ({ title: '', dueDate: today(), note: '' })

export function TasksPage() {
  const { repos, refresh, dataVersion } = useJiwei()
  const { toast } = useUiStore()
  const [tasks, setTasks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [editing, setEditing] = useState<Block | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void repos.blocks.listByKind('task').then((items) => {
      if (!alive) return
      // 周期/区间事项仍由“计划”模块管理，避免在这个简化表单里被误改成普通截止事项。
      setTasks(items.filter((item) => {
        const type = planTypeOf(item)
        return type === 'deadline' || type === 'longterm'
      }).sort(compareTasks))
      setLoading(false)
    })
    return () => { alive = false }
  }, [repos, dataVersion])

  const active = useMemo(() => tasks.filter((task) => !isPlanComplete(task, today())), [tasks])
  const completed = useMemo(() => tasks.filter((task) => isPlanComplete(task, today())), [tasks])

  function openAdd(): void {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  function openEdit(task: Block): void {
    setEditing(task)
    setForm({ title: task.title, dueDate: task.anchor.type === 'deadline' ? task.anchor.date : '', note: task.note ?? '' })
    setFormOpen(true)
  }

  async function save(): Promise<void> {
    const title = form.title.trim()
    if (!title) { toast('请填写待办内容', 'error'); return }
    const stamp = nowIso()
    const block: Block = {
      id: editing?.id ?? newId('blk'),
      kind: 'task',
      title,
      planType: form.dueDate ? 'deadline' : 'longterm',
      anchor: form.dueDate ? { type: 'deadline', date: form.dueDate } : { type: 'floating' },
      repeat: { mode: 'once' },
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      ...(editing?.done ? { done: true } : {}),
      createdAt: editing?.createdAt ?? stamp,
      updatedAt: stamp,
    }
    await repos.savePlan(block)
    await refresh()
    setTasks((old) => [...old.filter((item) => item.id !== block.id), block].sort(compareTasks))
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(false)
    toast(editing ? '待办已更新' : '待办已添加', 'success')
  }

  async function toggle(task: Block): Promise<void> {
    const next = { ...task, done: !isPlanComplete(task, today()), updatedAt: nowIso() }
    await repos.savePlan(next)
    await refresh()
    setTasks((old) => old.map((item) => item.id === next.id ? next : item).sort(compareTasks))
  }

  async function remove(task: Block): Promise<void> {
    await repos.blocks.remove(task.id)
    await refresh()
    setTasks((old) => old.filter((item) => item.id !== task.id))
    toast('待办已删除', 'success')
  }

  return (
    <div className="reading-view flex h-full flex-col bg-canvas">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2"><ListIcon className="h-5 w-5 text-brand" /><h1 className="text-[15px] font-semibold">待办</h1></div>
        <div className="flex items-center gap-1.5"><DemoImportButton scope="tasks" /><button type="button" aria-label="添加待办" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-alt" onClick={openAdd}><PlusIcon className="h-5 w-5" /></button></div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">先记录要做的事，再按截止日期处理；没有日期的事项会长期保留。</div>
        {formOpen ? <TaskForm value={form} editing={editing !== null} onChange={setForm} onSubmit={() => void save()} onCancel={() => { setEditing(null); setForm(emptyForm()); setFormOpen(false) }} /> : null}
        {loading ? <p className="p-6 text-center text-sm text-muted">正在读取待办…</p> : tasks.length === 0 ? <EmptyTasks onAdd={openAdd} /> : <div className="space-y-4"><TaskGroup title="未完成" items={active} onEdit={openEdit} onToggle={(task) => void toggle(task)} onDelete={(task) => void remove(task)} /><TaskGroup title="已完成" items={completed} onEdit={openEdit} onToggle={(task) => void toggle(task)} onDelete={(task) => void remove(task)} /></div>}
      </main>
    </div>
  )
}

function TaskGroup({ title, items, onEdit, onToggle, onDelete }: { title: string; items: Block[]; onEdit: (task: Block) => void; onToggle: (task: Block) => void; onDelete: (task: Block) => void }) {
  if (items.length === 0) return null
  return <section><h2 className="mb-2 px-1 text-xs font-semibold text-muted">{title} · {items.length}</h2><div className="space-y-2">{items.map((task) => <TaskItem key={task.id} task={task} onEdit={() => onEdit(task)} onToggle={() => onToggle(task)} onDelete={() => onDelete(task)} />)}</div></section>
}

function TaskItem({ task, onEdit, onToggle, onDelete }: { task: Block; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const complete = isPlanComplete(task, today())
  const overdue = isPlanOverdue(task, nowIso())
  return <article className={'flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3 ' + (complete ? 'opacity-60' : '')}><button type="button" aria-label={complete ? `恢复${task.title}` : `完成${task.title}`} className={'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ' + (complete ? 'border-brand bg-brand text-white' : 'border-border')} onClick={onToggle}>{complete ? '✓' : ''}</button><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h3 className="truncate text-sm font-medium">{task.title}</h3>{overdue && !complete ? <span className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">已逾期</span> : null}</div><p className="mt-1 text-xs text-muted">{describePlan(task)}</p>{task.note ? <p className="mt-1 truncate text-xs text-muted">{task.note}</p> : null}</div><div className="flex shrink-0 gap-1"><button type="button" className="rounded px-2 py-1 text-xs text-brand" onClick={onEdit}>编辑</button><button type="button" aria-label={`删除${task.title}`} className="rounded p-1 text-muted" onClick={onDelete}><TrashIcon className="h-4 w-4" /></button></div></article>
}

function TaskForm({ value, editing, onChange, onSubmit, onCancel }: { value: TaskForm; editing: boolean; onChange: (value: TaskForm) => void; onSubmit: () => void; onCancel: () => void }) {
  return <div className="mb-3 rounded-xl border border-brand/30 bg-surface p-3"><h2 className="mb-3 text-sm font-semibold">{editing ? '编辑待办' : '添加待办'}</h2><div className="space-y-3 text-xs"><label className="block">内容<input autoFocus className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm" value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="例如：提交课程作业" /></label><label className="block">截止日期（可留空）<input type="date" className="mt-1 min-h-[44px] w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm" value={value.dueDate} onChange={(event) => onChange({ ...value, dueDate: event.target.value })} /></label><label className="block">备注<textarea className="mt-1 min-h-20 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm" value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} /></label></div><div className="mt-3 flex gap-2"><button type="button" className="flex-1 rounded-lg bg-brand py-2.5 text-xs font-medium text-white" onClick={onSubmit}>保存</button><button type="button" className="rounded-lg border border-border px-3 py-2.5 text-xs text-muted" onClick={onCancel}>取消</button></div></div>
}

function EmptyTasks({ onAdd }: { onAdd: () => void }) { return <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center"><p className="text-sm font-medium">还没有待办</p><p className="mt-1 text-xs text-muted">把作业、报名、缴费和生活小事先记下来。</p><button type="button" className="mt-3 rounded-lg bg-brand px-3 py-2 text-xs text-white" onClick={onAdd}>添加第一条</button></div> }
function compareTasks(a: Block, b: Block): number { return taskDate(a).localeCompare(taskDate(b)) || (isPlanComplete(a, today()) ? 1 : -1) || a.title.localeCompare(b.title, 'zh-CN') }
function taskDate(task: Block): string { return task.anchor.type === 'deadline' ? task.anchor.date : '9999-12-31' }
