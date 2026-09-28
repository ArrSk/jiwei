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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SettingsIcon,
  type TimeGridColumn,
  type TimeGridRow,
} from '@jiwei/ui'
import { useJiwei } from '../../JiweiContext'
import { useUiStore } from '../../store'
import { buildDemoCourses } from '../../lib/demoCourses'
import { allWeeks } from '@jiwei/data'
import { TimetableGrid, type PositionedBlock } from './components/TimetableGrid'
import { CourseForm, emptyCourseForm, type CourseFormValue } from './components/CourseForm'
import { CourseList } from './components/CourseList'
import { SettingsPage } from '../../shell/SettingsPage'

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

/** 某一周的日期范围，形如 `9/22-9/28` */
export function weekRangeLabel(semester: Semester, week: number): string {
  const from = dateForWeek(semester, week, 1).slice(5).replace('-', '/')
  const to = dateForWeek(semester, week, 7).slice(5).replace('-', '/')
  return `${from}-${to}`
}

/** 星期几的中文单字：`2026-09-28` → `一` */
export function weekdayLabel(date: string): string {
  const idx = weekdayOf(date) - 1
  return WEEKDAY_LABELS[idx] ?? ''
}

/**
 * 生成某一周的 7 个列头。
 *
 * 主标题只写**单个汉字**（一/二/…/日）而不是"周一"—— 手机上每列只有约 45px，
 * 与示例一致；副标题是日期 `9/23`。
 */
export function buildColumns(semester: Semester, week: number, todayStr: string): TimeGridColumn[] {
  return Array.from({ length: 7 }, (_, i) => {
    const weekday = i + 1
    const date = dateForWeek(semester, week, weekday)
    const [, month, day] = date.split('-')
    return {
      weekday,
      title: WEEKDAY_LABELS[i] ?? '',
      sub: `${Number(month)}/${Number(day)}`,
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
  const { semester, setSemester, week, setWeek, toast, view, setView } = useUiStore()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  /** 一学期实际要上多少次课（排除被停课的场次），用于顶部统计 */
  const totalOccurrences = occurrences.filter((o) => o.status !== 'cancelled').length

  return (
    /*
      整页骨架（对齐参考示例）：
        顶部控制栏（固定）
        星期/日期条（固定）
        内容区 ← **唯一可滚动的部分**（课表 / 课程总览）
        底部页签（固定、始终可见）
      用 h-full + flex 而不是让整页滚动 —— 这样底部页签才会**锁定**在屏幕底部。
    */
    <div className="flex h-full flex-col bg-canvas">
      {/* ── 顶部控制栏 ───────────────────────────────────── */}
      <header className="shrink-0 bg-surface px-2 pb-1.5 pt-2">
        {/*
          三栏布局：左右各占 1fr、中间 auto。
          这样「‹ 第 4 周 ›」**始终居中**，而右侧的工具按钮贴在最右边；
          用 justify-between 做不到真正的居中（会被两侧宽度差带偏）。
        */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          {/* 左：占位，保持中栏绝对居中 */}
          <div />

          {/* 中：上一周 / 第 N 周 / 下一周 */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="上一周"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-alt disabled:opacity-30"
              disabled={viewWeek <= 1}
              onClick={() => setWeek(viewWeek - 1)}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="min-w-[4.5rem] text-center text-[17px] font-semibold leading-tight"
              title={week !== null ? '点一下回到本周' : '当前显示本周'}
              onClick={() => setWeek(null)}
            >
              第 {viewWeek} 周
            </button>
            <button
              type="button"
              aria-label="下一周"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-alt disabled:opacity-30"
              disabled={viewWeek >= semester.totalWeeks}
              onClick={() => setWeek(viewWeek + 1)}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>

          {/* 右：加课 / 设置 */}
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              aria-label="添加课程"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-alt"
              onClick={() => setSheetOpen(true)}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="设置"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-alt"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 统计：居中一行，信息密度高但不抢戏 */}
        <div className="mb-1.5 text-center text-[11px] leading-tight text-muted">
          {semester.name} · 共 {semester.totalWeeks} 周 · {blocks.length} 门课 / {totalOccurrences} 次
        </div>
      </header>

      {/* ── 内容区：唯一可滚动的部分 ─────────────────────── */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {view === 'timetable' ? (
          <>
            {blocks.length === 0 ? (
              <div className="p-3">
                <EmptyState onLoadDemo={handleLoadDemo} onAdd={() => setSheetOpen(true)} />
              </div>
            ) : (
              <TimetableGrid
                rows={buildRows(periods)}
                columns={buildColumns(semester, viewWeek, todayStr)}
                blocks={gridBlocks}
                /* 表头左上角（节次轴那一列）放月份，于是整条表头与网格天然对齐 */
                corner={
                  <div className="flex flex-col items-center justify-center leading-tight">
                    <span className="text-[15px] font-semibold">
                      {Number(dateForWeek(semester, viewWeek, 1).slice(5, 7))}
                    </span>
                    <span className="text-[11px] text-muted">月</span>
                  </div>
                }
                onCellClick={(weekday, periodIndex) => {
                  setForm(emptyCourseForm(weekday, periodIndex))
                  setSheetOpen(true)
                }}
              />
            )}
            {/* 课程总览紧接在表格下方（与表格同处一个滚动区），不单独占页签 */}
            {blocks.length > 0 ? (
              <CourseList courses={blocks} onDelete={handleDelete} onLoadDemo={handleLoadDemo} />
            ) : null}
          </>
        ) : (
          <CalendarPlaceholder />
        )}
      </main>

      {/* ── 底部页签：锁定，始终可见 ─────────────────────── */}
      <nav
        className="shrink-0 border-t border-border bg-surface"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-2xl">
          {(
            [
              ['timetable', '课程表'],
              ['calendar', '日程'],
            ] as const
          ).map(([key, label]) => {
            const active = view === key
            return (
              <button
                key={key}
                type="button"
                className={
                  'min-h-[52px] flex-1 text-[13px] transition-colors ' +
                  (active ? 'font-semibold text-brand' : 'text-muted')
                }
                onClick={() => setView(key)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </nav>

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

      {settingsOpen ? <SettingsPage onClose={() => setSettingsOpen(false)} /> : null}
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

/**
 * 日程页签的**占位**。
 *
 * 日程表排在 M4，这里先把入口与版式占住。之所以不留白屏而是给一段说明：
 * 用户点到空白页会以为"坏了"，写清楚"还没做、什么时候做"才不误导。
 */
function CalendarPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium text-muted">日程表还没做</p>
      <p className="max-w-xs text-[11px] leading-relaxed text-muted">
        这一块留给日程表与重要事件提醒，排在 M4。
        课程表本身已经预留了扩展位——日程和课程共用同一套时间模型，加进来不需要改动现有功能。
      </p>
    </div>
  )
}
