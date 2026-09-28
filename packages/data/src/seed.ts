/**
 * 首次启动的引导数据。
 *
 * 目标：用户打开应用就能看到一个**可用的空课表**（有学期、有作息），
 * 直接开始加课，而不是先面对一堆设置表单。
 */
import {
  buildPeriodsFromConfig,
  defaultScheduleConfig,
  mondayOf,
  today,
  type Block,
  type Semester,
} from '@jiwei/core'
import type { Repos } from './types'
import { ID_PREFIX, newId, nowIso } from './ids'
import { saveScheduleConfig } from './schedule'

export interface BootstrapOptions {
  /** 默认学期的起始日（第 1 周周一）。不传则取"本周周一"。 */
  startDate?: string
  name?: string
}

/**
 * 幂等引导：复制可安全重复调用（例如 React 严格模式下的双次挂载）。
 * 只在"一个学期都没有"时才创建。
 */
export async function bootstrap(repos: Repos, options: BootstrapOptions = {}): Promise<void> {
  const config = defaultScheduleConfig()
  const existing = await repos.semesters.list()
  if (existing.length > 0) {
    // 学期已存在：只补写作息配置（兼容"作息可配置"上线前建的库）
    const first = existing[0]
    const hasConfig = first ? await repos.meta.get(`scheduleConfig:${first.id}`) : null
    if (!hasConfig && first) await saveScheduleConfig(repos, first.id, config)
    return
  }

  const startedAt = nowIso()
  const semesterId = newId(ID_PREFIX.semester)
  const startDate = options.startDate ?? mondayOf(today())

  const semester: Semester = {
    id: semesterId,
    name: options.name ?? defaultSemesterName(startDate),
    startDate,
    totalWeeks: 20,
    timezone: 'Asia/Shanghai',
    isActive: true,
    createdAt: startedAt,
    updatedAt: startedAt,
  }

  await repos.semesters.put(semester)
  await repos.periods.replaceAll(semesterId, buildPeriodsFromConfig(semesterId, config))
  await saveScheduleConfig(repos, semesterId, config)
  await repos.meta.set('schemaVersion', '1')
  await repos.meta.set('storageEngine', 'dexie')
  await repos.meta.set('bootstrappedAt', startedAt)
}

/** 依据起始日推到学期名，例如 2025-09-22 → "2025 秋" */
export function defaultSemesterName(startDate: string): string {
  const [yearStr = '2025', monthStr = '1'] = startDate.split('-')
  const month = Number(monthStr)
  const term = month >= 2 && month <= 7 ? '春' : '秋'
  return `${yearStr} ${term}`
}

/** 造一门示例课（只有用户主动点"添加示例"才用，不做默认污染） */
export function makeCourse(input: {
  semesterId: string
  title: string
  weekday: number
  periods: [number, number]
  weeks: number[]
  teacher?: string
  location?: string
  color?: string
}): Block {
  const at = nowIso()
  return {
    id: newId(ID_PREFIX.block),
    kind: 'course',
    title: input.title,
    anchor: {
      type: 'curriculum',
      semesterId: input.semesterId,
      weekday: input.weekday,
      periods: input.periods,
      weeks: input.weeks,
    },
    repeat: { mode: 'curriculum', semesterId: input.semesterId, weeks: input.weeks },
    detail: {
      ...(input.teacher ? { teacher: input.teacher } : {}),
      ...(input.location ? { location: input.location } : {}),
    },
    ...(input.color ? { color: input.color } : {}),
    createdAt: at,
    updatedAt: at,
  }
}

/** 全部周次 1..totalWeeks */
export function allWeeks(totalWeeks: number): number[] {
  return Array.from({ length: totalWeeks }, (_, i) => i + 1)
}
