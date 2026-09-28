/**
 * 作息配置的读写。
 *
 * 作息表（`Period[]`）是**生成结果**，本配置是**生成配方**。
 * 两者都要存：前者用于渲染与时间展开，后者用于用户回到设置页时看到当前参数、
 * 并在修改后重建整张作息表。
 *
 * **配置按学期分开存**（`scheduleConfig:<semesterId>`）：
 * 一个人可能同时有"本科课表"和"辅修课表"，两边的上课时间不一定一样。
 * 早期版本把配置存在全局键 `scheduleConfig` 上，于是改 A 课表的作息会让
 * B 课表的设置页显示成 A 的参数 —— 读的时候会回退到那个旧键，老数据不受影响。
 */
import { defaultScheduleConfig, ScheduleConfig } from '@jiwei/core'
import type { Repos } from './types'

/** 旧版本的全局键，只读不写（兼容升级前建的库） */
const LEGACY_META_KEY = 'scheduleConfig'

function metaKey(semesterId: string): string {
  return `scheduleConfig:${semesterId}`
}

/**
 * 读取某个学期的作息配置。
 * 找不到就回退到旧全局键，再找不到返回默认参数。
 */
export async function loadScheduleConfig(
  repos: Repos,
  semesterId?: string,
): Promise<ScheduleConfig> {
  const keys = semesterId ? [metaKey(semesterId), LEGACY_META_KEY] : [LEGACY_META_KEY]
  for (const key of keys) {
    const raw = await repos.meta.get(key)
    if (!raw) continue
    try {
      const parsed = ScheduleConfig.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
    } catch {
      // 坏数据当没有，继续回退
    }
  }
  return defaultScheduleConfig()
}

/** 保存某个学期的作息配置 */
export async function saveScheduleConfig(
  repos: Repos,
  semesterId: string,
  config: ScheduleConfig,
): Promise<void> {
  const validated = ScheduleConfig.parse(config)
  await repos.meta.set(metaKey(semesterId), JSON.stringify(validated))
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
  await saveScheduleConfig(repos, semesterId, buildScheduleConfigFromPeriods(persisted, validated))
  await repos.rebuildOccurrences(semesterId)
  return periods.length
}
