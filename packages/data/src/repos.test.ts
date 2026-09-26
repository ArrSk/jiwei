/**
 * 数据层测试：迁移、CRUD、Occurrence 重建、附件不丢。
 *
 * 这里覆盖的是 docs/ARCHITECTURE.md 第 9 节风险表里的两条：
 * - "IndexedDB 无事务语义 → 重建可能写坏"
 * - "实例重建丢附件 → 闹钟/笔记挂空"
 */
import { afterEach, describe, expect, it } from 'vitest'
import { materializeBlock, nowIso, type Alert, type Block } from '@jiwei/core'
import { bootstrap, createDexieEngine, createRepos, makeCourse, newId } from './index'
import type { Engine, Repos } from './index'

let engines: Engine[] = []

/** 每个用例一个独立的库，避免相互污染 */
function freshRepos(): Repos {
  const engine = createDexieEngine(`jiwei_test_${Math.random().toString(36).slice(2, 10)}`)
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

describe('bootstrap（首次启动引导）', () => {
  it('创建一个学期 + 12 节默认作息，并写入 meta', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })

    const semesters = await repos.semesters.list()
    expect(semesters).toHaveLength(1)
    expect(semesters[0]?.startDate).toBe('2025-09-22')
    expect(semesters[0]?.name).toBe('2025 秋')
    expect(semesters[0]?.totalWeeks).toBe(20)

    const periods = await repos.periods.listBySemester(semesters[0]!.id)
    expect(periods).toHaveLength(12)
    expect(periods[0]?.start).toBe('08:00')

    expect(await repos.meta.get('storageEngine')).toBe('dexie')
    expect(await repos.meta.get('schemaVersion')).toBe('1')
  })

  it('幂等：重复调用不会造出第二个学期（React 严格模式双挂载安全）', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    await bootstrap(repos, { startDate: '2025-09-22' })
    await bootstrap(repos)
    expect(await repos.semesters.list()).toHaveLength(1)
  })

  it('active() 返回当前活跃学期', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const active = await repos.semesters.active()
    expect(active).not.toBeNull()
    expect(active?.startDate).toBe('2025-09-22')
  })
})

describe('Block CRUD', () => {
  it('写入后可读回，listCourses 只返回课程类', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const sem = (await repos.semesters.active())!

    const course = makeCourse({
      semesterId: sem.id,
      title: '高等数学',
      weekday: 3,
      periods: [3, 4],
      weeks: [1, 2, 3],
      teacher: '张老师',
      location: '教三 201',
    })
    await repos.blocks.put(course)

    const task: Block = {
      id: newId('blk'),
      kind: 'task',
      title: '交作业',
      anchor: { type: 'allDay', date: '2025-10-08' },
      repeat: { mode: 'once' },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    await repos.blocks.put(task)

    expect(await repos.blocks.list()).toHaveLength(2)
    const courses = await repos.blocks.listCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0]?.title).toBe('高等数学')
    expect(courses[0]?.detail?.teacher).toBe('张老师')
  })
})

describe('rebuildOccurrences（幂等重建）', () => {
  async function setup(): Promise<{ repos: Repos; semesterId: string; block: Block }> {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const sem = (await repos.semesters.active())!
    const block = makeCourse({
      semesterId: sem.id,
      title: '高等数学',
      weekday: 3, // 周三
      periods: [3, 4],
      weeks: [1, 2, 3, 4, 5],
    })
    await repos.blocks.put(block)
    return { repos, semesterId: sem.id, block }
  }

  it('展开出正确数量的场次，且落库的日期时刻与纯函数一致', async () => {
    const { repos, semesterId, block } = await setup()
    const count = await repos.rebuildOccurrences(semesterId)
    expect(count).toBe(5)

    const occ = await repos.occurrences.listBySemester(semesterId)
    expect(occ).toHaveLength(5)
    expect(occ.map((o) => o.date)).toEqual([
      '2025-09-24',
      '2025-10-01',
      '2025-10-08',
      '2025-10-15',
      '2025-10-22',
    ])

    // 与 core 纯函数结果逐条对齐（防止落库层与计算层走偏）
    const periods = await repos.periods.listBySemester(semesterId)
    const semester = (await repos.semesters.get(semesterId))!
    const expected = materializeBlock(block, { semester, periods })
    expect(occ.map((o) => o.id).sort()).toEqual(expected.map((o) => o.id).sort())
  })

  it('重建是幂等的：连续三次结果完全一致，不产生重复', async () => {
    const { repos, semesterId } = await setup()
    const a = await repos.rebuildOccurrences(semesterId)
    const b = await repos.rebuildOccurrences(semesterId)
    const c = await repos.rebuildOccurrences(semesterId)
    expect([a, b, c]).toEqual([5, 5, 5])
    expect(await repos.occurrences.listBySemester(semesterId)).toHaveLength(5)
  })

  it('课程周次变更后重建，场次随之更新', async () => {
    const { repos, semesterId, block } = await setup()
    await repos.rebuildOccurrences(semesterId)

    const trimmed: Block = {
      ...block,
      anchor:
        block.anchor.type === 'curriculum' ? { ...block.anchor, weeks: [1, 2] } : block.anchor,
    }
    await repos.blocks.put(trimmed)

    expect(await repos.rebuildOccurrences(semesterId)).toBe(2)
    expect(await repos.occurrences.listBySemester(semesterId)).toHaveLength(2)
  })

  it('★ 重建后挂在 occurrence 上的提醒（附件）不丢，且 ID 保持确定性', async () => {
    const { repos, semesterId } = await setup()
    await repos.rebuildOccurrences(semesterId)

    const before = await repos.occurrences.listBySemester(semesterId)
    const target = before[0]!

    // 挂一条提醒到这一次课
    const alert: Alert = {
      id: newId('alt'),
      ownerType: 'occurrence',
      ownerId: target.id,
      leadMinutes: 10,
      mode: 'notify',
      channels: ['inapp'],
      repeat: 'always',
      enabled: true,
      createdAt: nowIso(),
    }
    await repos.alerts.put(alert)

    // 重建（模拟"改了作息时间"或"改了周次"）——附件表不参与重建
    await repos.rebuildOccurrences(semesterId)

    // 提醒仍在，且它的 ownerId 依然能在新场次里找到
    const alerts = await repos.alerts.listByOwner('occurrence', target.id)
    expect(alerts).toHaveLength(1)

    const after = await repos.occurrences.listBySemester(semesterId)
    expect(after.map((o) => o.id)).toContain(target.id)
  })

  it('学期不存在时明确报错，而不是静默写空', async () => {
    const repos = freshRepos()
    await expect(repos.rebuildOccurrences('sem_not_exist')).rejects.toThrow('学期不存在')
  })

  it('按日期范围查询返回该区间的场次', async () => {
    const { repos, semesterId } = await setup()
    await repos.rebuildOccurrences(semesterId)
    const range = await repos.occurrences.listByDateRange('2025-10-01', '2025-10-15')
    expect(range.map((o) => o.date)).toEqual(['2025-10-01', '2025-10-08', '2025-10-15'])
  })
})

describe('删除学期会连带清理其数据', () => {
  it('周期、场次、课程一并清除', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const sem = (await repos.semesters.active())!
    await repos.blocks.put(
      makeCourse({
        semesterId: sem.id,
        title: '大学英语',
        weekday: 1,
        periods: [1, 2],
        weeks: [1, 2],
      }),
    )
    await repos.rebuildOccurrences(sem.id)

    await repos.semesters.remove(sem.id)

    expect(await repos.semesters.list()).toHaveLength(0)
    expect(await repos.periods.listBySemester(sem.id)).toHaveLength(0)
    expect(await repos.occurrences.listBySemester(sem.id)).toHaveLength(0)
    expect(await repos.blocks.listCourses()).toHaveLength(0)
  })
})
