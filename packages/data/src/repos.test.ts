/**
 * 数据层测试：迁移、CRUD、Occurrence 重建、附件不丢。
 *
 * 这里覆盖的是 docs/ARCHITECTURE.md 第 9 节风险表里的两条：
 * - "IndexedDB 无事务语义 → 重建可能写坏"
 * - "实例重建丢附件 → 闹钟/笔记挂空"
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  cancelAdjustment,
  materializeBlock,
  moveAdjustment,
  nowIso,
  occurrenceId,
  type Alert,
  type Block,
  type Note,
} from '@jiwei/core'
import { parseCourseCsv } from './courseImport'
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

  it('savePlan 写入待办并为截止日生成可查询的派生记录', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const task: Block = {
      id: newId('blk'),
      kind: 'task',
      title: '提交作业',
      planType: 'deadline',
      anchor: { type: 'deadline', date: '2025-10-08' },
      repeat: { mode: 'once' },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    await repos.savePlan(task)
    expect(await repos.blocks.listByKind('task')).toHaveLength(1)
    const occurrences = await repos.occurrences.listAll()
    expect(occurrences.filter((item) => item.blockId === task.id).map((item) => item.date)).toEqual(['2025-10-08'])
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

describe('停课 / 调课落库后重建（M1-3 的数据通路）', () => {
  /** 一门周一第 1-2 节、上第 1~3 周的课 */
  async function withCourse() {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const sem = (await repos.semesters.active())!
    const block = makeCourse({
      semesterId: sem.id,
      title: '高等数学',
      weekday: 1,
      periods: [1, 2],
      weeks: [1, 2, 3],
    })
    await repos.blocks.put(block)
    await repos.rebuildOccurrences(sem.id)
    return { repos, semesterId: sem.id, block }
  }

  it('停课：该次变 cancelled，其他次不受影响', async () => {
    const { repos, semesterId, block } = await withCourse()
    await repos.adjustments.put(
      cancelAdjustment({ blockId: block.id, semesterId, date: '2025-09-29' }),
    )
    await repos.rebuildOccurrences(semesterId)

    const occ = await repos.occurrences.listBySemester(semesterId)
    expect(occ.find((o) => o.date === '2025-09-29')?.status).toBe('cancelled')
    expect(occ.find((o) => o.date === '2025-09-22')?.status).toBe('normal')
    expect(occ).toHaveLength(3)
  })

  it('★ 调课：原时间变 moved，新时间多一条 normal 且带 movedFrom', async () => {
    const { repos, semesterId, block } = await withCourse()
    await repos.adjustments.put(
      moveAdjustment({
        blockId: block.id,
        semesterId,
        date: '2025-09-29',
        newDate: '2025-10-03',
        newPeriods: [5, 6],
      }),
    )
    await repos.rebuildOccurrences(semesterId)

    const occ = await repos.occurrences.listBySemester(semesterId)
    expect(occ).toHaveLength(4)
    expect(occ.find((o) => o.date === '2025-09-29')?.status).toBe('moved')

    const movedIn = occ.find((o) => o.date === '2025-10-03')
    expect(movedIn?.status).toBe('normal')
    expect(movedIn?.movedFrom).toBe('2025-09-29')
    expect(movedIn?.id).toBe(occurrenceId(block.id, '2025-10-03', 5))
  })

  it('★ 同一天只能有一条调整记录：先停课再改成调课，不会留下两条', async () => {
    const { repos, semesterId, block } = await withCourse()
    await repos.adjustments.put(
      cancelAdjustment({ blockId: block.id, semesterId, date: '2025-09-29' }),
    )
    await repos.adjustments.put(
      moveAdjustment({
        blockId: block.id,
        semesterId,
        date: '2025-09-29',
        newDate: '2025-10-03',
        newPeriods: [5, 6],
      }),
    )
    // 两条记录的 id 相同（确定性 id），put 是覆盖而不是新增
    expect(await repos.adjustments.listByBlock(block.id)).toHaveLength(1)

    await repos.rebuildOccurrences(semesterId)
    const occ = await repos.occurrences.listBySemester(semesterId)
    // 不能同时出现"停课"与"调课"两种状态
    expect(occ.find((o) => o.date === '2025-09-29')?.status).toBe('moved')
  })

  it('撤销调整（删掉记录）后，课恢复原样', async () => {
    const { repos, semesterId, block } = await withCourse()
    const adj = cancelAdjustment({ blockId: block.id, semesterId, date: '2025-09-29' })
    await repos.adjustments.put(adj)
    await repos.rebuildOccurrences(semesterId)
    expect(
      (await repos.occurrences.listBySemester(semesterId)).find(
        (o) => o.date === '2025-09-29',
      )?.status,
    ).toBe('cancelled')

    await repos.adjustments.remove(adj.id)
    await repos.rebuildOccurrences(semesterId)
    expect(
      (await repos.occurrences.listBySemester(semesterId)).find(
        (o) => o.date === '2025-09-29',
      )?.status,
    ).toBe('normal')
  })

  it('删课表会连调整记录一起删掉', async () => {
    const { repos, semesterId, block } = await withCourse()
    await repos.adjustments.put(
      cancelAdjustment({ blockId: block.id, semesterId, date: '2025-09-29' }),
    )
    await repos.semesters.remove(semesterId)
    expect(await repos.adjustments.listBySemester(semesterId)).toHaveLength(0)
  })

  it('删课程会连调整和已生成课次一起清理', async () => {
    const { repos, semesterId, block } = await withCourse()
    const adjustment = cancelAdjustment({ blockId: block.id, semesterId, date: '2025-09-29' })
    await repos.adjustments.put(adjustment)
    await repos.rebuildOccurrences(semesterId)
    const occurrence = (await repos.occurrences.listByBlock(block.id))[0]!
    const at = nowIso()
    const blockAlert: Alert = { id: 'alert_block', ownerType: 'block', ownerId: block.id, leadMinutes: 10, mode: 'notify', channels: ['inapp'], repeat: 'always', enabled: true, createdAt: at }
    const occurrenceAlert: Alert = { ...blockAlert, id: 'alert_occurrence', ownerType: 'occurrence', ownerId: occurrence.id }
    const blockNote: Note = { id: 'note_block', ownerType: 'block', ownerId: block.id, title: '课程笔记', tags: [], createdAt: at, updatedAt: at }
    const occurrenceNote: Note = { id: 'note_occurrence', ownerType: 'occurrence', ownerId: occurrence.id, title: '课堂笔记', tags: [], createdAt: at, updatedAt: at }
    await repos.alerts.put(blockAlert)
    await repos.alerts.put(occurrenceAlert)
    await repos.notes.put(blockNote)
    await repos.notes.put(occurrenceNote)
    await repos.blocks.remove(block.id)
    expect(await repos.adjustments.listByBlock(block.id)).toHaveLength(0)
    expect(await repos.occurrences.listByBlock(block.id)).toHaveLength(0)
    expect(await repos.blocks.get(block.id)).toBeNull()
    expect(await repos.alerts.listByOwner('block', block.id)).toHaveLength(0)
    expect(await repos.alerts.listByOwner('occurrence', occurrence.id)).toHaveLength(0)
    expect(await repos.notes.listByOwner('block', block.id)).toHaveLength(0)
    expect(await repos.notes.listByOwner('occurrence', occurrence.id)).toHaveLength(0)
  })

  it('课程导入在事务内去重并重建课次', async () => {
    const { repos, semesterId } = await withCourse()
    const rows = parseCourseCsv('课程名,教师,教室,星期,开始节,结束节,周次\n高等数学,,,一,1,2,1-3\n英语,李老师,外语楼,五,3,4,1-3\n', { semesterId, totalWeeks: 20, maxPeriod: 12 })
    const result = await repos.importCourses(semesterId, rows)
    expect(result).toEqual({ imported: 1, skipped: 1 })
    expect((await repos.blocks.listBySemester(semesterId)).map((block) => block.title)).toEqual(['高等数学', '英语'])
    expect((await repos.occurrences.listBySemester(semesterId)).filter((occurrence) => occurrence.blockId !== 'missing')).toHaveLength(6)
  })

  it('课程导入校验失败时不会写入任何课程', async () => {
    const { repos, semesterId } = await withCourse()
    const rows = parseCourseCsv('课程名,星期,开始节,结束节,周次\n新课,一,1,2,99\n', { semesterId, totalWeeks: 20, maxPeriod: 12 })
    await expect(repos.importCourses(semesterId, rows)).rejects.toThrow('第 2 行')
    expect((await repos.blocks.listBySemester(semesterId)).map((block) => block.title)).toEqual(['高等数学'])
  })
})
