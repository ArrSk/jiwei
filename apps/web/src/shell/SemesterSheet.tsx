/**
 * 课表管理：新建 / 切换 / 改名 / 删除。
 *
 * 概念对齐：界面上叫「课表」，数据层里就是 `Semester`（一个学期 = 一张课表）。
 * 之所以要能建多张：一个人可能同时有主修、辅修、考研班三套时间表，
 * 而且下个学期要另起一张 —— 不能把上学期的课全删了重新录。
 *
 * 手机优先的三条：
 * - 切换课表 = 点一行，不做下拉菜单（下拉在手机上又小又难点）
 * - 删除必须**两步确认**，且说清会删掉多少门课（不可恢复的操作不能一键完成）
 * - 新建表单默认值全部预填好，多数人直接点「创建」即可
 */
import { useEffect, useState } from 'react'
import { today, mondayOf, type Semester } from '@jiwei/core'
import {
  activateSemester,
  createSemester,
  deleteSemester,
  summarizeSemesters,
  updateSemester,
  type SemesterSummary,
} from '@jiwei/data'
import { useJiwei } from '../JiweiContext'
import { useUiStore } from '../store'
import { Sheet, Row, inputClass } from './Sheet'

interface Props {
  onClose: () => void
  /** 当前正在查看的课表；切换后由外层重新加载数据。null = 一张都还没有 */
  active: Semester | null
}

type Mode = 'list' | 'create' | 'edit'

export function SemesterSheet({ onClose, active }: Props) {
  const { repos, refresh, dataVersion } = useJiwei()
  const { setSemester, setWeek, toast } = useUiStore()

  const [mode, setMode] = useState<Mode>('list')
  const [summaries, setSummaries] = useState<SemesterSummary[]>([])
  const [busy, setBusy] = useState(false)
  /** 二次确认删除的目标（非 null 时显示确认条） */
  const [confirmDelete, setConfirmDelete] = useState<SemesterSummary | null>(null)

  // 表单状态（新建 / 编辑共用一份字段）
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(mondayOf(today()))
  const [totalWeeks, setTotalWeeks] = useState(20)
  const [editing, setEditing] = useState<Semester | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const list = await summarizeSemesters(repos)
      if (alive) setSummaries(list)
    })()
    return () => {
      alive = false
    }
  }, [repos, dataVersion])

  async function reload(): Promise<void> {
    setSummaries(await summarizeSemesters(repos))
  }

  function openCreate(): void {
    setEditing(null)
    setName('')
    setStartDate(mondayOf(today()))
    setTotalWeeks(20)
    setMode('create')
  }

  function openEdit(s: Semester): void {
    setEditing(s)
    setName(s.name)
    setStartDate(s.startDate)
    setTotalWeeks(s.totalWeeks)
    setMode('edit')
  }

  /** 切换到这个课表：store 里的学期一变，整页数据会跟着重新查 */
  async function switchTo(s: Semester): Promise<void> {
    if (active && s.id === active.id) return
    setBusy(true)
    // 走数据层的 activateSemester：它保证"最多一张活跃"，界面上不会出现两张都亮
    await activateSemester(repos, s.id)
    setSemester({ ...s, isActive: true })
    setWeek(null)
    await refresh()
    setBusy(false)
    toast(`已切换到「${s.name}」`, 'success')
    onClose()
  }

  async function handleCreate(): Promise<void> {
    if (totalWeeks < 1 || totalWeeks > 60) {
      toast('总周数请填 1~60 之间', 'error')
      return
    }
    setBusy(true)
    const created = await createSemester(repos, {
      name,
      startDate,
      totalWeeks,
      // 沿用当前课表的作息；一张都没有时走数据层默认作息
      copyScheduleFrom: active?.id ?? null,
    })
    setSemester(created)
    setWeek(null)
    await refresh()
    await reload()
    setBusy(false)
    setMode('list')
    toast(`已新建课表「${created.name}」，作息沿用当前课表`, 'success')
  }

  async function handleEdit(): Promise<void> {
    if (!editing) return
    if (totalWeeks < 1 || totalWeeks > 60) {
      toast('总周数请填 1~60 之间', 'error')
      return
    }
    setBusy(true)
    try {
      const updated = await updateSemester(repos, editing.id, { name, startDate, totalWeeks })
      if (updated.id === active?.id) setSemester(updated)
      await refresh()
      await reload()
      setMode('list')
      toast(`已更新「${updated.name}」`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : '更新失败', 'error')
    }
    setBusy(false)
  }

  async function handleDelete(target: SemesterSummary): Promise<void> {
    setBusy(true)
    try {
      const next = await deleteSemester(repos, target.semester.id)
      setConfirmDelete(null)
      await refresh()
      await reload()
      // 删的是当前这张（或本来就没有当前）→ 切到剩下的那张；否则当前课表不动
      if (!next) setSemester(null)
      else if (!active || active.id === target.semester.id) setSemester(next)
      toast(next ? `已删除「${target.semester.name}」` : '已删除最后一张课表，请新建一张', 'success')
      // 一张都不剩时直接进"新建"，否则用户会停在一个空列表上没有出路
      if (!next) setMode('create')
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error')
    }
    setBusy(false)
  }

  // ── 新建 / 编辑表单 ───────────────────────────────────────
  if (mode !== 'list') {
    const isCreate = mode === 'create'
    return (
      <Sheet
        title={isCreate ? '新建课表' : '课表设置'}
        onClose={() => setMode('list')}
        footer={
          <>
            <button
              type="button"
              className="min-h-[46px] flex-1 rounded-xl bg-surface-alt text-[15px] text-ink"
              onClick={() => setMode('list')}
            >
              返回
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-[46px] flex-1 rounded-xl bg-brand text-[15px] font-medium text-white disabled:opacity-60"
              onClick={() => void (isCreate ? handleCreate() : handleEdit())}
            >
              {busy ? '处理中…' : isCreate ? '创建' : '保存'}
            </button>
          </>
        }
      >
        <Row label="名称">
          <input
            className={inputClass}
            placeholder="如：2026 春"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Row>
        <Row label="开学日">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Row>
        <Row label="总周数">
          <input
            type="number"
            min={1}
            max={60}
            className={inputClass}
            value={totalWeeks}
            onChange={(e) => setTotalWeeks(Number(e.target.value))}
          />
        </Row>
        <p className="text-[11px] leading-relaxed text-muted">
          「开学日」填第 1 周的周一，课表按它推算每一周的日期。
          {isCreate
            ? '新课表的作息时间沿用当前课表，之后可以单独改。'
            : '改开学日或总周数会让所有课的日期重新推算。'}
        </p>
      </Sheet>
    )
  }

  // ── 列表 ─────────────────────────────────────────────────
  return (
    <Sheet
      title="我的课表"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="min-h-[46px] flex-1 rounded-xl bg-brand text-[15px] font-medium text-white"
          onClick={openCreate}
        >
          ＋ 新建课表
        </button>
      }
    >
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {summaries.map((item) => {
          const isActive = item.semester.id === active?.id
          return (
            <li key={item.semester.id}>
              <div className="flex items-stretch">
                {/* 整行可点 = 切换课表（手机上比下拉菜单好点得多） */}
                <button
                  type="button"
                  disabled={busy}
                  className={
                    'min-w-0 flex-1 px-3 py-2.5 text-left ' +
                    (isActive ? 'bg-brand/5' : 'active:bg-surface-alt')
                  }
                  onClick={() => void switchTo(item.semester)}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium">{item.semester.name}</span>
                    {isActive ? (
                      <span className="shrink-0 rounded bg-brand px-1.5 py-px text-[10px] text-white">
                        当前
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {item.semester.startDate} 起 · 共 {item.semester.totalWeeks} 周 ·{' '}
                    {item.courseCount} 门课 / {item.occurrenceCount} 次
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 px-3 text-[12px] text-muted active:bg-surface-alt"
                  onClick={() => openEdit(item.semester)}
                >
                  设置
                </button>
              </div>

              {confirmDelete?.semester.id === item.semester.id ? (
                <div className="flex items-center gap-2 border-t border-border bg-red-50 px-3 py-2">
                  <span className="min-w-0 flex-1 text-[11px] text-red-700">
                    删除「{item.semester.name}」会一并删掉它的 {item.courseCount} 门课与全部课次，
                    不能撤销。
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-[11px]"
                    onClick={() => setConfirmDelete(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-[11px] text-white disabled:opacity-60"
                    onClick={() => void handleDelete(item)}
                  >
                    确认删除
                  </button>
                </div>
              ) : (
                <div className="flex justify-end border-t border-border/60 px-3 py-1">
                  <button
                    type="button"
                    className="text-[11px] text-muted hover:text-red-600"
                    onClick={() => setConfirmDelete(item)}
                  >
                    删除这张课表
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        每张课表的课程与作息各自独立，切换后只看当前这张。任何时刻只会有一张课表是「当前」。
      </p>
    </Sheet>
  )
}
