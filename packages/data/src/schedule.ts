/**
 * 作息配置的读写。
 *
 * 作息表（`Period[]`）是**生成结果**，本配置是**生成配方**。
 * 两者都要存：前者用于渲染与时间展开，后者用于用户回到设置页时看到当前参数、
 * 并在修改后重建整张作息表。
 */
import { defaultScheduleConfig, ScheduleConfig } from '@jiwei/core'
import type { Repos } from './types'

const META_KEY = 'scheduleConfig'

/** 读取作息配置；没有则返回默认参数（兼容本功能上线前创建的数据库） */
export async function loadScheduleConfig(repos: Repos): Promise<ScheduleConfig> {
  const raw = await repos.meta.get(META_KEY)
  if (!raw) return defaultScheduleConfig()
  try {
    const parsed = ScheduleConfig.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : defaultScheduleConfig()
  } catch {
    return defaultScheduleConfig()
  }
}

export async function saveScheduleConfig(repos: Repos, config: ScheduleConfig): Promise<void> {
  const validated = ScheduleConfig.parse(config)
  await repos.meta.set(META_KEY, JSON.stringify(validated))
}

/**
 * 保存配置并重建该学期的整张作息表。
 *
 * 安全性：节次 id 是确定性的（`${semesterId}_p${index}`），
 * 因此重建后节次"身份"不变，`Occurrence` 的 id 也不变，
 * 挂在场次上的提醒与笔记不会失联（见 ADR-004）。
 *
 * 注意：写回 meta 的配置以**实际落库的作息**为准（回读后再反推 presetTimes），
 * 避免出现"界面显示的配置"与"数据库里的作息"两套真相。
 *
 * @returns 新的节次数量
 */
export async function applyScheduleConfig(
  repos: Repos,
  semesterId: string,
  config: ScheduleConfig,
): Promise<number> {
  const { buildPeriodsFromConfig, buildScheduleConfigFromPeriods, ScheduleConfig } = await import(
    '@jiwei/core'
  )
  const validated = ScheduleConfig.parse(config)
  const periods = buildPeriodsFromConfig(semesterId, validated)
  if (periods.length === 0) {
    throw new Error('作息表不能为空：至少保留一节课')
  }

  await repos.periods.replaceAll(semesterId, periods)
  const persisted = await repos.periods.listBySemester(semesterId)
  await saveScheduleConfig(repos, buildScheduleConfigFromPeriods(persisted, validated))
  await repos.rebuildOccurrences(semesterId)
  return periods.length
}
