/**
 * 课表（学期）的创建与管理。
 *
 * 为什么要单独一个模块：这件事**必须一次做对**——
 * 它同时动 `semesters`、`periods`、`scheduleConfig` 三处数据，
 * 散落在界面里迟早会出现"建了课表但没有作息"或者"两张课表共用一套作息"。
 *
 * 术语：界面上叫「课表」，数据层里就是 `Semester`（一个学期 = 一张课表）。
 */
import {
  buildPeriodsFromConfig,
  defaultScheduleConfig,
  mondayOf,
  today,
  type Semester,
} from '@jiwei/core'
import type { Repos } from './types'
import { loadScheduleConfig, saveScheduleConfig } from './schedule'
import { defaultSemesterName } from './seed'
import { ID_PREFIX, newId, nowIso } from './ids'

export interface CreateSemesterInput {
  name?: string
  /** 第 1 周周一 */
  startDate?: string
  totalWeeks?: number
  /**
   * 从哪个学期的作息复制一份过来。
   * 不传则用 `fallbackSemesterId`，再不行用默认作息。
   * 复制作息是刚需：新学期多半和上学期作息一样，不该让用户重填一遍。
   */
  copyScheduleFrom?: string | null
}

/**
 * 新建一张课表，并把它设为当前查看的课表。
 *
 * 新学期的作息表是**独立生成**的 —— 之后改这张课表的作息，
 * 不会影响其他课表（每学期一份 `scheduleConfig:<id>`）。
 */
export async function createSemester(
  repos: Repos,
  input: CreateSemesterInput = {},
): Promise<Semester> {
  const at = nowIso()
  const startDate = input.startDate ?? mondayOf(today())
  const totalWeeks = input.totalWeeks ?? 20
  const id = newId(ID_PREFIX.semester)

  // 作息配方：优先"指定的那个学期"，其次当前活跃学期，最后默认
  const sourceId = input.copyScheduleFrom ?? (await repos.semesters.active())?.id ?? null
  const config = sourceId
    ? await loadScheduleConfig(repos, sourceId)
    : defaultScheduleConfig()

  const semester: Semester = {
    id,
    name: input.name?.trim() || defaultSemesterName(startDate),
    startDate,
    totalWeeks,
    timezone: 'Asia/Shanghai',
    isActive: true,
    createdAt: at,
    updatedAt: at,
  }

  await repos.semesters.put(semester)
  await repos.periods.replaceAll(id, buildPeriodsFromConfig(id, config))
  await saveScheduleConfig(repos, id, config)
  // 只有一个学期能是"活跃"的，否则切换课表会出现两张都亮的怪状态
  await activateSemester(repos, id)
  return semester
}

/** 把某张课表设为当前查看的课表（同时取消其他课表的活跃标记） */
export async function activateSemester(repos: Repos, id: string): Promise<void> {
  const all = await repos.semesters.list()
  await Promise.all(
    all.map((s) => {
      const shouldBeActive = s.id === id
      if (s.isActive === shouldBeActive) return Promise.resolve()
      return repos.semesters.put({ ...s, isActive: shouldBeActive, updatedAt: nowIso() })
    }),
  )
}

export interface UpdateSemesterInput {
  name?: string
  startDate?: string
  totalWeeks?: number
}

/**
 * 改课表的基本信息。
 *
 * 起始日或总周数变化会影响**每一个场次的日期**，所以必须重建 Occurrence。
 * 重建是幂等的，且场次 id 确定性不变，因此挂在场次上的数据不会失联（ADR-004）。
 */
export async function updateSemester(
  repos: Repos,
  id: string,
  patch: UpdateSemesterInput,
): Promise<Semester> {
  const current = await repos.semesters.get(id)
  if (!current) throw new Error('课表不存在，可能已被删除')

  const next: Semester = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name.trim() || current.name } : {}),
    ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
    ...(patch.totalWeeks !== undefined ? { totalWeeks: patch.totalWeeks } : {}),
    updatedAt: nowIso(),
  }

  const datesChanged =
    next.startDate !== current.startDate || next.totalWeeks !== current.totalWeeks
  await repos.semesters.put(next)
  if (datesChanged) await repos.rebuildOccurrences(id)
  return next
}

/**
 * 删除一张课表及其全部下属数据。
 *
 * 关键点：**删完必须保证还剩一张活跃课表**，否则用户会卡在
 * "没有任何学期"的空界面上，而且他不知道要重新建一张。
 * 所以删的是当前活跃课表时，自动把最新的一张设为活跃。
 *
 * @returns 删除后剩下课表里被设为活跃的那一个；一张都不剩时返回 null
 */
export async function deleteSemester(repos: Repos, id: string): Promise<Semester | null> {
  const all = await repos.semesters.list()
  const target = all.find((s) => s.id === id)
  if (!target) return repos.semesters.active()

  // 顺手清掉这张课表的作息配方，避免 meta 里堆积孤儿键
  await repos.meta.remove(`scheduleConfig:${id}`)
  await repos.semesters.remove(id)

  const rest = await repos.semesters.list()
  if (rest.length === 0) return null

  if (target.isActive) {
    const next = rest[0]
    if (next) await activateSemester(repos, next.id)
  }
  return repos.semesters.active()
}

/** 一张课表的概览（管理界面用：不需要把课程全读进内存） */
export interface SemesterSummary {
  semester: Semester
  courseCount: number
  /** 学期里实际的课次（不含停课） */
  occurrenceCount: number
  periodCount: number
}

export async function summarizeSemesters(repos: Repos): Promise<SemesterSummary[]> {
  const all = await repos.semesters.list()
  return Promise.all(
    all.map(async (semester) => {
      const [blocks, occurrences, periods] = await Promise.all([
        repos.blocks.listBySemester(semester.id),
        repos.occurrences.listBySemester(semester.id),
        repos.periods.listBySemester(semester.id),
      ])
      return {
        semester,
        courseCount: blocks.length,
        occurrenceCount: occurrences.filter((o) => o.status !== 'cancelled').length,
        periodCount: periods.length,
      }
    }),
  )
}
