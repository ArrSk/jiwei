/**
 * 课表（学期）管理的测试。
 *
 * 这里守的是三条不变量，破任何一条用户体验都会直接崩：
 * 1. 任何时刻**最多只有一张活跃课表**（否则切换课表时两张都亮）
 * 2. 新建的课表**自带一份独立作息**（否则改 A 的作息会改到 B）
 * 3. 删除课表后**要么还剩一张活跃课表，要么确实一张不剩**（不会卡在半死状态）
 */
import { afterEach, describe, expect, it } from 'vitest'
import { bootstrap, createDexieEngine, createRepos, makeCourse, newId } from './index'
import type { Engine, Repos } from './index'
import {
  activateSemester,
  createSemester,
  deleteSemester,
  summarizeSemesters,
  updateSemester,
} from './semesters'
import { applyScheduleConfig, loadScheduleConfig, saveScheduleConfig } from './schedule'

let engines: Engine[] = []

function freshRepos(): Repos {
  const engine = createDexieEngine(`jiwei_sem_${Math.random().toString(36).slice(2, 10)}`)
  engines.push(engine)
  return createRepos(engine)
}

afterEach(async () => {
  for (const e of engines) {
    e.db.close()
    await e.db.delete()
  }
  engines = []
})

/** 建一个干净的库：一个学期 + 默认作息 */
async function seeded(): Promise<Repos> {
  const repos = freshRepos()
  await bootstrap(repos, { startDate: '2025-09-22' })
  return repos
}

describe('createSemester', () => {
  it('新建后共有两张课表，且新的是活跃的那张', async () => {
    const repos = await seeded()
    const created = await createSemester(repos, {
      name: '2026 春',
      startDate: '2026-02-23',
      totalWeeks: 18,
    })

    const all = await repos.semesters.list()
    expect(all).toHaveLength(2)
    expect((await repos.semesters.active())?.id).toBe(created.id)
    expect(all.filter((s) => s.isActive)).toHaveLength(1)
  })

  it('新学期的作息表被真实生成（不是空的）', async () => {
    const repos = await seeded()
    const created = await createSemester(repos, { startDate: '2026-02-23' })
    const periods = await repos.periods.listBySemester(created.id)
    expect(periods.length).toBeGreaterThan(0)
    expect(periods[0]?.semesterId).toBe(created.id)
  })

  it('不传名字时按起始日推名字（2026-02-23 → 2026 春）', async () => {
    const repos = await seeded()
    const created = await createSemester(repos, { startDate: '2026-02-23' })
    expect(created.name).toBe('2026 春')
  })

  it('新建的课表有独立作息：改 A 的作息不影响 B', async () => {
    const repos = await seeded()
    const first = await repos.semesters.list()
    const a = first[0]
    expect(a).toBeDefined()
    if (!a) return

    const b = await createSemester(repos, { startDate: '2026-02-23' })

    // 把 B 的第 1 节改成 09:00 开始
    const cfgB = await loadScheduleConfig(repos, b.id)
    await applyScheduleConfig(repos, b.id, {
      ...cfgB,
      presetTimes: cfgB.presetTimes.map((t) =>
        t.index === 1 ? { ...t, start: '09:00', end: '09:45' } : t,
      ),
    })

    const periodsA = await repos.periods.listBySemester(a.id)
    const periodsB = await repos.periods.listBySemester(b.id)
    expect(periodsA.find((p) => p.index === 1)?.start).toBe('08:00')
    expect(periodsB.find((p) => p.index === 1)?.start).toBe('09:00')

    // 设置页读到的配方也必须各归各的
    expect((await loadScheduleConfig(repos, a.id)).presetTimes[0]?.start).toBe('08:00')
    expect((await loadScheduleConfig(repos, b.id)).presetTimes[0]?.start).toBe('09:00')
  })

  it('复制作息：新学期可以继承指定课表的作息', async () => {
    const repos = await seeded()
    const list = await repos.semesters.list()
    const a = list[0]
    expect(a).toBeDefined()
    if (!a) return

    const cfg = await loadScheduleConfig(repos, a.id)
    await saveScheduleConfig(repos, a.id, {
      ...cfg,
      presetTimes: cfg.presetTimes.map((t) =>
        t.index === 1 ? { ...t, start: '07:30', end: '08:15' } : t,
      ),
    })

    const b = await createSemester(repos, { startDate: '2026-02-23', copyScheduleFrom: a.id })
    expect((await loadScheduleConfig(repos, b.id)).presetTimes[0]?.start).toBe('07:30')
  })
})

describe('activateSemester', () => {
  it('切换后只有一张活跃', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    const b = await createSemester(repos, { startDate: '2026-02-23' })
    expect(a).toBeDefined()
    if (!a) return

    await activateSemester(repos, a.id)
    const all = await repos.semesters.list()
    expect(all.filter((s) => s.isActive)).toHaveLength(1)
    expect((await repos.semesters.active())?.id).toBe(a.id)
    expect(all.find((s) => s.id === b.id)?.isActive).toBe(false)
  })

  it('重复激活同一张不会产生第二条活跃记录', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return
    await activateSemester(repos, a.id)
    await activateSemester(repos, a.id)
    expect((await repos.semesters.list()).filter((s) => s.isActive)).toHaveLength(1)
  })
})

describe('updateSemester', () => {
  it('改名不影响场次', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return

    await repos.blocks.put(
      makeCourse({
        semesterId: a.id,
        title: '高等数学',
        weekday: 1,
        periods: [1, 2],
        weeks: [1, 2, 3],
      }),
    )
    await repos.rebuildOccurrences(a.id)
    const before = await repos.occurrences.listBySemester(a.id)

    const updated = await updateSemester(repos, a.id, { name: '大二上' })
    expect(updated.name).toBe('大二上')
    expect(await repos.occurrences.listBySemester(a.id)).toHaveLength(before.length)
  })

  it('改总周数会重建场次：周数变少，场次随之变少', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return

    await repos.blocks.put(
      makeCourse({
        semesterId: a.id,
        title: '高等数学',
        weekday: 1,
        periods: [1, 2],
        weeks: Array.from({ length: 20 }, (_, i) => i + 1),
      }),
    )
    await repos.rebuildOccurrences(a.id)
    expect(await repos.occurrences.listBySemester(a.id)).toHaveLength(20)

    await updateSemester(repos, a.id, { totalWeeks: 16 })
    // 超出 16 周的场次被 expandWeeks 过滤掉
    expect(await repos.occurrences.listBySemester(a.id)).toHaveLength(16)
  })

  it('空名字不会把课表改成无名（退回原名）', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return
    const updated = await updateSemester(repos, a.id, { name: '   ' })
    expect(updated.name).toBe(a.name)
  })

  it('课表不存在时报错而不是静默成功', async () => {
    const repos = await seeded()
    await expect(updateSemester(repos, 'sem_not_exist', { name: 'x' })).rejects.toThrow()
  })
})

describe('deleteSemester', () => {
  it('删掉当前活跃课表后，自动把剩下的设为活跃', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return
    const b = await createSemester(repos, { startDate: '2026-02-23' })

    await deleteSemester(repos, b.id)
    const rest = await repos.semesters.list()
    expect(rest).toHaveLength(1)
    expect((await repos.semesters.active())?.id).toBe(a.id)
  })

  it('删掉非活跃课表时，活跃课表不变', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return
    const b = await createSemester(repos, { startDate: '2026-02-23' })
    await activateSemester(repos, a.id)

    await deleteSemester(repos, b.id)
    expect((await repos.semesters.active())?.id).toBe(a.id)
  })

  it('删课表会连它的课程、场次、作息一起删干净', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return
    const b = await createSemester(repos, { startDate: '2026-02-23' })

    await repos.blocks.put(
      makeCourse({
        semesterId: b.id,
        title: '大学物理',
        weekday: 3,
        periods: [3, 4],
        weeks: [1, 2],
      }),
    )
    await repos.rebuildOccurrences(b.id)
    expect(await repos.occurrences.listBySemester(b.id)).not.toHaveLength(0)

    await deleteSemester(repos, b.id)

    expect(await repos.blocks.listBySemester(b.id)).toHaveLength(0)
    expect(await repos.occurrences.listBySemester(b.id)).toHaveLength(0)
    expect(await repos.periods.listBySemester(b.id)).toHaveLength(0)
    expect(await repos.meta.get(`scheduleConfig:${b.id}`)).toBeNull()
  })

  it('删掉最后一张课表时返回 null，而不是假装还有', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return
    expect(await deleteSemester(repos, a.id)).toBeNull()
    expect(await repos.semesters.list()).toHaveLength(0)
  })

  it('删不存在的课表不抛错（幂等）', async () => {
    const repos = await seeded()
    await expect(deleteSemester(repos, newId('sem'))).resolves.toBeTruthy()
  })
})

describe('listBySemester（防串课）', () => {
  it('只返回本课表的课程', async () => {
    const repos = await seeded()
    const list = await repos.semesters.list()
    const a = list[0]
    expect(a).toBeDefined()
    if (!a) return
    const b = await createSemester(repos, { startDate: '2026-02-23' })

    const blockA = makeCourse({
      semesterId: a.id,
      title: 'A 的课',
      weekday: 1,
      periods: [1, 2],
      weeks: [1],
    })
    const blockB = makeCourse({
      semesterId: b.id,
      title: 'B 的课',
      weekday: 2,
      periods: [3, 4],
      weeks: [1],
    })
    await repos.blocks.put(blockA)
    await repos.blocks.put(blockB)

    expect((await repos.blocks.listBySemester(a.id)).map((x) => x.title)).toEqual(['A 的课'])
    expect((await repos.blocks.listBySemester(b.id)).map((x) => x.title)).toEqual(['B 的课'])
    // listCourses() 仍会返回全部 —— 所以视图层必须用 listBySemester
    expect(await repos.blocks.listCourses()).toHaveLength(2)
  })
})

describe('summarizeSemesters', () => {
  it('统计每张课表的课程数与课次数', async () => {
    const repos = await seeded()
    const a = (await repos.semesters.list())[0]
    expect(a).toBeDefined()
    if (!a) return

    await repos.blocks.put(
      makeCourse({
        semesterId: a.id,
        title: '高等数学',
        weekday: 1,
        periods: [1, 2],
        weeks: [1, 2, 3],
      }),
    )
    await repos.rebuildOccurrences(a.id)

    const summaries = await summarizeSemesters(repos)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.courseCount).toBe(1)
    expect(summaries[0]?.occurrenceCount).toBe(3)
    expect(summaries[0]?.periodCount).toBeGreaterThan(0)
  })
})
