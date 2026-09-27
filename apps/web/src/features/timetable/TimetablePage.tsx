/**
 * 课程表模块（M0 唯一的 FeatureModule）。
 *
 * 它只做三件事：读仓储 → 交给通用 `TimeGrid` 渲染 → 提供增删入口。
 * 所有时间计算都调用 `@jiwei/core`，本模块内不出现任何日期算法（见 docs/ARCHITECTURE.md 5.1）。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  currentWeek as coreCurrentWeek,
  dateForWeek,
  today,
  weekdayOf,
  WEEKDAY_LABELS,
  type Block,
  type Occurrence,
  type Period,
  type Semester,
} from '@jiwei/core'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, type TimeGridColumn, type TimeGridRow } from '@jiwei/ui'
import { useJiwei } from '../../JiweiContext'
import { useUiStore } from '../../store'
import { buildDemoCourses } from '../../lib/demoCourses'
import { allWeeks } from '@jiwei/data'
import { TimetableGrid, type PositionedBlock } from './components/TimetableGrid'
import { CourseForm, emptyCourseForm, type CourseFormValue } from './components/CourseForm'
import { CourseList } from './components/CourseList'

/** 从确定性 Occurrence ID 里取回节次：`occ_<blockId>#<date>#<periodStart>` */
function periodStartOf(occId: string): number {
  const last = occId.split('#').pop()
  const n = Number(last)
  return Number.isFinite(n) ? n : 0
}

/**
 * 把作息表转成网格行。
 *
 * 副标题传 `08:00-08:45` 形式，由 `TimeGrid` 拆成两行显示（轴列很窄）。
 * 时刻来自作息表本身，而作息表可在「设置 → 作息时间」里逐节编辑。
 */
export function buildRows(periods: Period[]): TimeGridRow[] {
  return [...periods]
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      index: p.index,
      label: String(p.index),
      sub: `${p.start}-${p.end}`,
    }))
}

/** 生成某一周的 7 个列头 */
export function buildColumns(semester: Semester, week: number, todayStr: string): TimeGridColumn[] {
  return Array.from({ length: 7 }, (_, i) => {
    const weekday = i + 1
    const date = dateForWeek(semester, week, weekday)
    return {
      weekday,
      title: `周${WEEKDAY_LABELS[i]}`,
      sub: date.slice(5),
      isToday: date === todayStr,
    }
  })
}

/**
 * 把 `1-16` / `1,3,5` / `1-16单` / `1-16双` 解析成周次数组。
 * 这是**界面输入的解析**，不是时间计算，所以放在模块内；结果仍交给 core 校验。
 */
export function parseWeeks(text: string, totalWeeks: number): number[] {
  const raw = text.trim()
  if (!raw) return []
  const oddOnly = raw.includes('单')
  const evenOnly = raw.includes('双')
  const cleaned = raw.replace(/[单双周\s]/g, '')
  const weeks = new Set<number>()

  for (const part of cleaned.split(/[,，]/)) {
    if (!part) continue
    const range = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      for (let w = Math.min(from, to); w <= Math.max(from, to); w += 1) weeks.add(w)
      continue
    }
    if (/^\d+$/.test(part)) weeks.add(Number(part))
  }

  return [...weeks]
    .filter((w) => w >= 1 && w <= totalWeeks)
    .filter((w) => (oddOnly ? w % 2 === 1 : true))
    .filter((w) => (evenOnly ? w % 2 === 0 : true))
    .sort((a, b) => a - b)
}

export function TimetablePage() {
  const { repos, refresh, dataVersion } = useJiwei()
  const { semester, setSemester, week, setWeek, toast } = useUiStore()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [form, setForm] = useState<CourseFormValue>(() => emptyCourseForm())

  // ── 读取数据（dataVersion 变化即重新查询）──────────────────
  useEffect(() => {
    let alive = true
    void (async () => {
      const list = await repos.semesters.list()
      const active = semester ?? (await repos.semesters.active()) ?? list[0] ?? null
      if (!alive) return
      if (!semester && active) setSemester(active)

      if (!active) {
        setBlocks([])
        setOccurrences([])
        setPeriods([])
        setLoading(false)
        return
      }

      const [courseBlocks, occ, per] = await Promise.all([
        repos.blocks.listCourses(),
        repos.occurrences.listBySemester(active.id),
        repos.periods.listBySemester(active.id),
      ])
      if (!alive) return
      setBlocks(courseBlocks)
      setOccurrences(occ)
      setPeriods(per)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [repos, semester, setSemester, dataVersion])

  // ── 派生 ────────────────────────────────────────────────────
  const todayStr = today()
  const currentWeek = semester
    ? Math.min(semester.totalWeeks, Math.max(1, coreCurrentWeek(semester, todayStr)))
    : 1
  const viewWeek = week ?? currentWeek

  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks])

  const gridBlocks = useMemo<PositionedBlock[]>(() => {
    if (!semester) return []
    const from = dateForWeek(semester, viewWeek, 1)
    const to = dateForWeek(semester, viewWeek, 7)
    const out: PositionedBlock[] = []
    for (const occ of occurrences) {
      if (occ.date < from || occ.date > to) continue
      const block = blockById.get(occ.blockId)
      if (!block) continue
      const periodStart = periodStartOf(occ.id)
      out.push({
        block,
        occ,
        weekday: weekdayOf(occ.date),
        periodStart,
        periodEnd: block.anchor.type === 'curriculum' ? block.anchor.periods[1] : periodStart,
      })
    }
    return out
  }, [occurrences, blockById, semester, viewWeek])

  // ── 操作 ────────────────────────────────────────────────────
  async function persistAndReload(successText: string): Promise<void> {
    if (!semester) return
    await repos.rebuildOccurrences(semester.id)
    await refresh()
    toast(successText, 'success')
  }

  async function handleSubmit(value: CourseFormValue): Promise<void> {
    if (!semester) return
    // 周次留空 = 每周（表单里的「全周」快选也是这个语义）
    const weeks =
      value.weeksText.trim() === ''
        ? allWeeks(semester.totalWeeks)
        : parseWeeks(value.weeksText, semester.totalWeeks)
    if (weeks.length === 0) {
      toast('周次解析为空，请检查输入（例如 1-16 或 1-16单）', 'error')
      return
    }
    const at = new Date().toISOString()
    const block: Block = {
      id: `blk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      kind: 'course',
      title: value.title.trim(),
      anchor: {
        type: 'curriculum',
        semesterId: semester.id,
        weekday: value.weekday,
        periods: [value.periodStart, value.periodEnd],
        weeks,
      },
      repeat: { mode: 'curriculum', semesterId: semester.id, weeks },
      detail: {
        ...(value.teacher.trim() ? { teacher: value.teacher.trim() } : {}),
        ...(value.location.trim() ? { location: value.location.trim() } : {}),
      },
      // 颜色：用户在表单里选了就存下来；留空则由 paletteForTitle(课程名) 派生
      ...(value.color ? { color: value.color } : {}),
      createdAt: at,
      updatedAt: at,
    }
    await repos.blocks.put(block)
    setSheetOpen(false)
    setForm(emptyCourseForm(value.weekday, value.periodStart))
    await persistAndReload(`已添加「${block.title}」，共 ${weeks.length} 周`)
  }

  async function handleDelete(block: Block): Promise<void> {
    await repos.blocks.remove(block.id)
    await persistAndReload(`已删除「${block.title}」`)
  }

  async function handleLoadDemo(): Promise<void> {
    if (!semester) return
    const demo = buildDemoCourses(semester)
    for (const b of demo) await repos.blocks.put(b)
    await persistAndReload(`已载入 ${demo.length} 门示例课程`)
  }

  if (loading) return <div className="p-6 text-sm text-muted">正在读取课表…</div>

  if (!semester) {
    return <div className="p-6 text-sm text-muted">还没有学期数据，请重新打开应用以完成初始化。</div>
  }

  const activeCount = occurrences.filter((o) => o.status !== 'cancelled').length

  return (
    <div className="mx-auto max-w-6xl px-3 pb-28 pt-3 sm:px-4">
      {/*
        周次标题 + 左右切换 + 统计：**整体居中**（PC 与手机一致）。
        用纵向排列而不是 justify-between —— 后者会把统计挤到最右侧，
        视觉上并不居中，之前就是这样被反馈的。
      */}
      <div className="mb-3 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="上一周"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-alt disabled:opacity-40"
            disabled={viewWeek <= 1}
            onClick={() => setWeek(viewWeek - 1)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>

          <div className="min-w-[8.5rem] text-center">
            <div className="text-sm font-semibold">
              第 {viewWeek} 周
              {viewWeek === currentWeek ? (
                <span className="ml-1 rounded bg-brand-soft px-1 py-0.5 text-[10px] text-brand">
                  本周
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-muted">
              {dateForWeek(semester, viewWeek, 1).slice(5)} ~{' '}
              {dateForWeek(semester, viewWeek, 7).slice(5)}
            </div>
          </div>

          <button
            type="button"
            aria-label="下一周"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-alt disabled:opacity-40"
            disabled={viewWeek >= semester.totalWeeks}
            onClick={() => setWeek(viewWeek + 1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>

          {week !== null ? (
            <button
              type="button"
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs hover:bg-surface-alt"
              onClick={() => setWeek(null)}
            >
              回到本周
            </button>
          ) : null}
        </div>

        <div className="text-center text-[11px] text-muted">
          {semester.name} · 共 {semester.totalWeeks} 周 · {blocks.length} 门课 / {activeCount} 次
        </div>
      </div>

      {blocks.length === 0 ? (
        <EmptyState onLoadDemo={handleLoadDemo} onAdd={() => setSheetOpen(true)} />
      ) : (
        <TimetableGrid
          rows={buildRows(periods)}
          columns={buildColumns(semester, viewWeek, todayStr)}
          blocks={gridBlocks}
          onCellClick={(weekday, periodIndex) => {
            setForm(emptyCourseForm(weekday, periodIndex))
            setSheetOpen(true)
          }}
        />
      )}

      {blocks.length > 0 ? (
        <CourseList courses={blocks} onDelete={handleDelete} onLoadDemo={handleLoadDemo} />
      ) : null}

      <button
        type="button"
        className="fixed bottom-6 right-5 z-40 flex items-center gap-1.5 rounded-full bg-brand px-4 py-3 text-sm font-medium text-white shadow-lg active:scale-95"
        onClick={() => setSheetOpen(true)}
      >
        <PlusIcon className="h-4 w-4" />
        添加课程
      </button>

      {sheetOpen ? (
        <CourseForm
          value={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onClose={() => setSheetOpen(false)}
          maxPeriod={periods.length || 12}
          totalWeeks={semester.totalWeeks}
        />
      ) : null}
    </div>
  )
}

function EmptyState({ onLoadDemo, onAdd }: { onLoadDemo: () => void; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
      <h2 className="mb-1 text-sm font-semibold">课表还是空的</h2>
      <p className="mb-4 text-xs text-muted">
        点击网格空白处添加课程，或先载入一份示例课表看看效果（可随时删除）。
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white"
          onClick={onAdd}
        >
          添加第一门课
        </button>
        <button
          type="button"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:bg-surface-alt"
          onClick={onLoadDemo}
        >
          载入示例课表
        </button>
      </div>
    </div>
  )
}
