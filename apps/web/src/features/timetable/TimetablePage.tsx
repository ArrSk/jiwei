/**
 * 课程表模块（M0 唯一的 FeatureModule）。
 *
 * 它只做三件事：读仓储 → 交给通用 `TimeGrid` 渲染 → 提供增删入口。
 * 所有时间计算都调用 `@jiwei/core`，本模块内不出现任何日期算法（见 docs/ARCHITECTURE.md 5.1）。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  allOccurrencesOnDate,
  currentWeek as coreCurrentWeek,
  dateForWeek,
  describeAdjustment,
  findAdjustmentForOccurrence,
  isOccurrenceActive,
  nextOccurrence,
  nowIso,
  ongoingOccurrences,
  today,
  weekdayOf,
  WEEKDAY_LABELS,
  type Adjustment,
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
import { TodayCard } from './components/TodayCard'
import { TodayOverview } from './components/TodayOverview'
import { DayView } from './components/DayView'
import { AdjustSheet } from './components/AdjustSheet'
import { BatchEditSheet } from './components/BatchEditSheet'
import { SettingsPage } from '../../shell/SettingsPage'
import { InstallHelpSheet } from '../../shell/InstallGuide'
import { SemesterSheet } from '../../shell/SemesterSheet'
import { weeksToFormText, periodStartOf, parseWeeks } from '../../lib/weeks'

/** 从确定性 Occurrence ID 里取回节次：`occ_<blockId>#<date>#<periodStart>` */

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
 * 实现已移到 `lib/weeks.ts`（批量编辑也要用，留在页面里会形成循环依赖）；
 * 这里重新导出，保持 `lib/weeks.test.ts` 等既有引用可用。
 */
export { parseWeeks } from '../../lib/weeks'

/** 把一门已有课程还原成表单值，供编辑时预填 */
export function blockToFormValue(block: Block): CourseFormValue {
  const anchor = block.anchor
  if (anchor.type !== 'curriculum') {
    // 非教学周锚点（将来的日程/任务）暂不支持编辑，退回一个可用的空表单
    return emptyCourseForm()
  }
  return {
    title: block.title,
    teacher: block.detail?.teacher ?? '',
    location: block.detail?.location ?? '',
    weekday: anchor.weekday,
    periodStart: anchor.periods[0],
    periodEnd: anchor.periods[1],
    weeksText: anchor.weeks.length > 0 ? weeksToFormText(anchor.weeks) : '',
    color: block.color ?? '',
  }
}

export function TimetablePage() {
  const { repos, platform, refresh, dataVersion } = useJiwei()
  const { semester, setSemester, week, setWeek, toast, view, setView, dayViewWeekday, setDayViewWeekday } =
    useUiStore()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)

  const [sheetOpen, setSheetOpen] = useState(false)
  /** 正在编辑的课程 id；null 表示"新增" */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [installHelpOpen, setInstallHelpOpen] = useState(false)
  const [semesterSheetOpen, setSemesterSheetOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  /** 正在调课/停课的那一次课（block + 具体场次） */
  const [adjusting, setAdjusting] = useState<{ block: Block; occ: Occurrence } | null>(null)
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [form, setForm] = useState<CourseFormValue>(() => emptyCourseForm())
  const [clockTick, setClockTick] = useState(0)

  // “今天 / 下一节”必须随时间推进，也要在从后台回到前台时立即重算。
  useEffect(() => {
    const tick = () => setClockTick((value) => value + 1)
    const timer = window.setInterval(tick, 30_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  /** 打开"新增"表单 */
  function openAdd(weekday?: number, periodIndex?: number): void {
    setEditingId(null)
    setForm(
      weekday != null && periodIndex != null
        ? emptyCourseForm(weekday, periodIndex)
        : emptyCourseForm(),
    )
    setSheetOpen(true)
  }

  /** 打开"编辑"表单，用已有课程预填 */
  function openEdit(block: Block): void {
    setEditingId(block.id)
    setForm(blockToFormValue(block))
    setSheetOpen(true)
  }

  function closeSheet(): void {
    setSheetOpen(false)
    setEditingId(null)
    setForm(emptyCourseForm())
  }

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
        setAdjustments([])
        setLoading(false)
        return
      }

      const [courseBlocks, occ, per, adjs] = await Promise.all([
        // 必须按学期取课：用 listCourses() 会把别的课表的课也带进来（切换课表就串课）
        repos.blocks.listBySemester(active.id),
        repos.occurrences.listBySemester(active.id),
        repos.periods.listBySemester(active.id),
        repos.adjustments.listBySemester(active.id),
      ])
      if (!alive) return
      setBlocks(courseBlocks)
      setOccurrences(occ)
      setPeriods(per)
      setAdjustments(adjs)
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
      const adjustment = findAdjustmentForOccurrence(adjustments, block.id, occ.date)
      const periodEnd =
        adjustment?.newDate === occ.date && adjustment.newPeriods
          ? adjustment.newPeriods[1]
          : block.anchor.type === 'curriculum'
            ? block.anchor.periods[1]
            : periodStart
      out.push({
        block,
        occ,
        weekday: weekdayOf(occ.date),
        periodStart,
        periodEnd,
      })
    }
    return out
  }, [occurrences, adjustments, blockById, semester, viewWeek])

  /**
   * 「今天 / 下一节」卡片的数据。
   *
   * 只在**正在看本周**时显示 —— 翻到第 8 周却提示"下一节是高数"会让人误以为
   * 说的是本周的安排。时钟信号每 30 秒、回到前台和获得焦点时触发重算。
   */
  const todayCard = useMemo(() => {
    if (viewWeek !== currentWeek) return null
    const now = nowIso()
    return {
      ongoing: ongoingOccurrences(occurrences, now),
      next: nextOccurrence(occurrences, now),
    }
  }, [occurrences, viewWeek, currentWeek, clockTick])

  /**
   * 日视图那一天的日期与场次（`dayViewWeekday` 为 null 时不用）。
   *
   * 用 `allOccurrencesOnDate` 而不是 `occurrencesOnDate`：**要显示已停课的场次**。
   * 停课的那一次必须留在界面上（灰掉、划线），否则用户看不到自己停过课，
   * 也就没有办法把它恢复回来。
   */
  const dayView = useMemo(() => {
    if (dayViewWeekday === null || !semester) return null
    const date = dateForWeek(semester, viewWeek, dayViewWeekday)
    return { weekday: dayViewWeekday, date, list: allOccurrencesOnDate(occurrences, date) }
  }, [dayViewWeekday, occurrences, semester, viewWeek])

  /**
   * 当前正在调整的那次课已有的调整记录。
   *
   * 用 `findAdjustmentForOccurrence`（原时间与新时间都认）：调课之后这节课在
   * 界面上出现两次，从任意一端点进去都应该看到同一个状态、都能恢复原样。
   */
  const adjustingAdjustment = useMemo(
    () =>
      adjusting
        ? findAdjustmentForOccurrence(adjustments, adjusting.block.id, adjusting.occ.date)
        : undefined,
    [adjusting, adjustments],
  )

  // ── 操作 ────────────────────────────────────────────────────
  async function persistAndReload(successText: string): Promise<void> {
    if (!semester) return
    await repos.rebuildOccurrences(semester.id)
    await refresh()
    toast(successText, 'success')
  }

  /**
   * 保存表单。
   *
   * 同一个入口服务"新增"与"编辑"：靠 `editingId` 区分。
   * 编辑时**保留原 id 与 createdAt** —— 场次是按 blockId 派生 id 的，
   * 换了 id 就等于换了一门课，挂在场次上的提醒与笔记会全部失联。
   */
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

    const existing = editingId ? blocks.find((b) => b.id === editingId) : undefined
    const at = new Date().toISOString()

    const block: Block = {
      id: existing?.id ?? `blk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
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
      ...(value.color ? { color: value.color } : {}),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    }

    await repos.blocks.put(block)
    closeSheet()
    await persistAndReload(
      existing
        ? `已更新「${block.title}」`
        : `已添加「${block.title}」，共 ${weeks.length} 周`,
    )
  }

  /** 从编辑表单里删除当前课程 */
  async function handleDeleteEditing(): Promise<void> {
    const existing = editingId ? blocks.find((b) => b.id === editingId) : undefined
    if (!existing) return
    await repos.blocks.remove(existing.id)
    closeSheet()
    await persistAndReload(`已删除「${existing.title}」`)
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

  /**
   * 批量编辑保存：写改动过的课，再统一重建场次。
   *
   * 一次性写完再重建（而不是每门课重建一次）—— 重建整学期场次是重活，
   * 改 10 门课就重建 10 次会让手机明显卡顿。
   */
  async function handleBatchSave(updated: Block[], summary: string): Promise<void> {
    for (const block of updated) await repos.blocks.put(block)
    setBatchOpen(false)
    await persistAndReload(summary)
  }

  if (loading) return <div className="p-6 text-sm text-muted">正在读取课表…</div>

  /*
    一张课表都没有（用户把最后一张删掉了）。
    这里**不能只说"请重新打开应用"** —— 那是个死胡同，用户不知道该干什么。
    直接给一个"新建课表"的出口，并且把管理面板就渲染在这里。
  */
  if (!semester) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas p-8 text-center">
        <p className="text-sm text-muted">你还没有课表。</p>
        <button
          type="button"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          onClick={() => setSemesterSheetOpen(true)}
        >
          新建一张课表
        </button>
        {semesterSheetOpen ? (
          <SemesterSheet onClose={() => setSemesterSheetOpen(false)} active={null} />
        ) : null}
      </div>
    )
  }

  /**
   * 一学期实际要上多少次课，用于顶部统计。
   * 用 `isOccurrenceActive` 而不是只滤 `cancelled`：被调走的那一次也不算
   * —— 否则统计数会虚高（调课一次，数字反而加一）。
   */
  const totalOccurrences = occurrences.filter(isOccurrenceActive).length

  return (
    /*
      整页骨架（对齐参考示例）：
        顶部控制栏（固定，**仅课程表页签**）
        星期/日期条（固定在网格里）
        内容区 ← **唯一可滚动的部分**（课表 / 课程总览 / 日程）
        底部页签（固定、始终可见）
      用 h-full + flex 而不是让整页滚动 —— 这样底部页签才会**锁定**在屏幕底部。
    */
    <div className="reading-view flex h-full flex-col bg-canvas">
      {/* “今天”跟随真实日期，课程表保留周次与编辑控件。 */}
      {view === 'today' ? (
        <header className="shrink-0 border-b border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between">
            <button type="button" className="max-w-[10rem] truncate rounded-lg px-1.5 py-1 text-left text-[12px] text-muted hover:bg-surface-alt" onClick={() => setSemesterSheetOpen(true)}>
              {semester?.name ?? '我的课表'} <span className="text-[9px]">▾</span>
            </button>
            <h1 className="text-[15px] font-semibold">今天</h1>
            <button type="button" aria-label="设置" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-alt" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
      ) : (
        <header className="shrink-0 bg-surface px-2 pb-1.5 pt-2">
          {/*
            三栏布局：左右各占 1fr、中间 auto。
            这样「‹ 第 4 周 ›」**始终居中**，而右侧的工具按钮贴在最右边；
            用 justify-between 做不到真正的居中（会被两侧宽度差带偏）。
          */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
            {/*
              左：当前课表的名字（点开管理面板）。
              这块原来是空占位，用来让「第 N 周」绝对居中 —— 现在把课表名放这里：
              多张课表并存时，用户需要一眼看出"我现在看的是哪一张"，也需要一个入口去切换。
            */}
            <div className="flex min-w-0 items-center">
              <button
                type="button"
                className="flex min-w-0 items-center gap-0.5 rounded-lg px-1.5 py-1 text-[12px] text-muted hover:bg-surface-alt"
                title="管理我的课表"
                onClick={() => setSemesterSheetOpen(true)}
              >
                <span className="truncate max-w-[5.5rem]">{semester.name}</span>
                <span className="shrink-0 text-[9px]">▾</span>
              </button>
            </div>

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
            {semester.name} · 共 {semester.totalWeeks} 周 · {blocks.length} 门课 /{' '}
            {totalOccurrences} 次
          </div>
        </header>
      )}

      {/* ── 内容区：唯一可滚动的部分 ─────────────────────── */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {view === 'today' ? (
          <TodayOverview
            semester={semester}
            occurrences={occurrences}
            blocks={blocks}
            app={platform.app}
            onOpen={openEdit}
            onAdjust={(block, occ) => setAdjusting({ block, occ })}
            onGoTimetable={() => setView('timetable')}
            onInstall={() => setInstallHelpOpen(true)}
          />
        ) : (
          dayView ? (
            /*
              日视图：一列铺满屏宽。
              顶部那行「周几 · 日期 · 返回整周」是唯一的出口 —— 手机上很容易
              点进某一天却不知道怎么退回，返回入口必须在第一屏、不用滚动。
            */
            <>
              <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-[12px] text-muted hover:bg-surface-alt"
                  onClick={() => setDayViewWeekday(null)}
                >
                  ← 整周
                </button>
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                  第 {viewWeek} 周 · 只看这一天
                </span>
              </div>
              <DayView
                occurrences={dayView.list}
                blockById={blockById}
                date={dayView.date}
                isToday={dayView.date === todayStr}
                onOpen={openEdit}
                onAddAt={(periodIndex) => openAdd(dayView.weekday, periodIndex)}
                /* 每一行都能单独调课/停课 —— 这是"某一次课有变动"的唯一入口 */
                onAdjust={(block, occ) => setAdjusting({ block, occ })}
              />
            </>
          ) : (
            <>
              {todayCard ? (
                <TodayCard
                  ongoing={todayCard.ongoing}
                  next={todayCard.next}
                  blockById={blockById}
                  onOpen={openEdit}
                />
              ) : null}

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
                  onCellClick={(weekday, periodIndex) => openAdd(weekday, periodIndex)}
                  onBlockClick={openEdit}
                  /* 点星期头进入日视图：手机上这是看清一节课细节的主要入口 */
                  onColumnClick={setDayViewWeekday}
                />
              )}
              {/* 课程总览紧接在表格下方（与表格同处一个滚动区），不单独占页签 */}
              {blocks.length > 0 ? (
                <CourseList
                  courses={blocks}
                  onDelete={handleDelete}
                  onLoadDemo={handleLoadDemo}
                  onBatchEdit={() => setBatchOpen(true)}
                />
              ) : null}
            </>
          )
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
              ['today', '今天'],
              ['timetable', '课程表'],
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
          onClose={closeSheet}
          maxPeriod={periods.length || 12}
          totalWeeks={semester.totalWeeks}
          isEditing={editingId !== null}
          {...(editingId !== null ? { onDelete: handleDeleteEditing } : {})}
        />
      ) : null}

      {adjusting ? (
        <AdjustSheet
          block={adjusting.block}
          occ={adjusting.occ}
          /* 一律以"调整记录的原日期"为操作对象：
             从调课后的新时间点进来时，动的仍然是原来那一次，语义才不会漂 */
          adjustDate={adjustingAdjustment?.date ?? adjusting.occ.date}
          maxPeriod={periods.length || 12}
          existingId={adjustingAdjustment?.id ?? null}
          existingLabel={adjustingAdjustment ? describeAdjustment(adjustingAdjustment) : null}
          onClose={() => setAdjusting(null)}
          onSaved={persistAndReload}
        />
      ) : null}

      {batchOpen ? (
        <BatchEditSheet
          courses={blocks}
          maxPeriod={periods.length || 12}
          totalWeeks={semester.totalWeeks}
          onClose={() => setBatchOpen(false)}
          onSave={handleBatchSave}
        />
      ) : null}

      {semesterSheetOpen ? (
        <SemesterSheet onClose={() => setSemesterSheetOpen(false)} active={semester} />
      ) : null}

      {installHelpOpen ? <InstallHelpSheet onClose={() => setInstallHelpOpen(false)} /> : null}
      {settingsOpen ? (
        <SettingsPage
          onClose={() => setSettingsOpen(false)}
          onManageSemesters={() => {
            setSettingsOpen(false)
            setSemesterSheetOpen(true)
          }}
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
