/**
 * 备份导出的测试。
 *
 * 为什么值得专门测：本项目按 ADR-002 是**无服务器的本地优先**应用，
 * 而调研确认 iOS 上 IndexedDB 可能静默丢失数据（WebKit #277615，Dexie 作者确认无法绕过）。
 * **JSON 备份是当前唯一的兜底** —— 它没被测过，就等于没有。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nowIso, type Block } from '@jiwei/core'
import {
  BackupError,
  backupFileName,
  bootstrap,
  createDexieEngine,
  createRepos,
  describeBackup,
  exportBackup,
  importBackup,
  makeCourse,
  newId,
  parseBackup,
  type Engine,
  type Repos,
} from './index'

let engines: Engine[] = []

function freshRepos(): Repos {
  const engine = createDexieEngine(`jiwei_backup_${Math.random().toString(36).slice(2, 10)}`)
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

/** 造一份有课程与调课的样例数据 */
async function seeded(): Promise<{ repos: Repos; semesterId: string }> {
  const repos = freshRepos()
  await bootstrap(repos, { startDate: '2025-09-22' })
  const sem = (await repos.semesters.active())!
  const block = makeCourse({
    semesterId: sem.id,
    title: '高等数学',
    weekday: 3,
    periods: [3, 4],
    weeks: [1, 2, 3],
    teacher: '张老师',
    location: '教西—101',
  })
  await repos.blocks.put(block)
  await repos.adjustments.put({
    id: newId('adj'),
    semesterId: sem.id,
    date: '2025-10-01',
    action: 'cancel',
    blockId: block.id,
  })
  await repos.rebuildOccurrences(sem.id)
  return { repos, semesterId: sem.id }
}

describe('备份导出', () => {
  it('导出内容含全部原始记录，且**不含派生的 Occurrence**', async () => {
    const { repos } = await seeded()
    const text = await exportBackup(repos, { appVersion: '0.1.0' })
    const file = parseBackup(text)

    expect(file.format).toBe('jiwei-backup')
    expect(file.formatVersion).toBe(1)
    expect(file.appVersion).toBe('0.1.0')
    expect(file.data.semesters).toHaveLength(1)
    expect(file.data.blocks).toHaveLength(1)
    expect(file.data.adjustments).toHaveLength(1)
    expect(file.data.periods.length).toBeGreaterThan(0)
    expect(file.data.meta.scheduleConfig).toBeTruthy()

    // Occurrence 是派生数据，不进备份（避免"场次与课程对不上"）
    expect(JSON.stringify(file.data)).not.toContain('"occurrences"')
  })

  it('文件名带日期', () => {
    const name = backupFileName(new Date('2026-09-26T10:00:00+08:00'))
    expect(name).toBe('jiwei-backup-2026-09-26.json')
  })

  it('概况文本含学期名与课程数，便于导入前确认', async () => {
    const { repos } = await seeded()
    const file = parseBackup(await exportBackup(repos))
    const desc = describeBackup(file)
    expect(desc).toContain('1 个学期')
    expect(desc).toContain('1 门课程')
  })
})

describe('备份导入', () => {
  it('★ 导入后课程、作息、调课全部还原，且场次被重建', async () => {
    const source = await seeded()
    const text = await exportBackup(source.repos)

    // 目标库是全新的（模拟换设备）
    const target = freshRepos()
    await bootstrap(target, { startDate: '2025-09-22' })
    await target.blocks.put(
      makeCourse({ semesterId: (await target.semesters.active())!.id, title: '临时课程', weekday: 1, periods: [1, 2], weeks: [1] }),
    )

    const result = await importBackup(target, text)
    expect(result.semesters).toBe(1)
    expect(result.blocks).toBe(1)

    // 旧数据被整体替换（不是合并）
    const courses = await target.blocks.listCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0]?.title).toBe('高等数学')

    // 调课记录还原
    const sem = (await target.semesters.active())!
    expect(await target.adjustments.listBySemester(sem.id)).toHaveLength(1)

    // 作息还原
    expect((await target.periods.listBySemester(sem.id)).length).toBeGreaterThan(0)

    // 场次被重建：第 2 周那次应被标记为 cancelled
    const occ = await target.occurrences.listBySemester(sem.id)
    expect(occ.length).toBeGreaterThan(0)
    expect(occ.find((o) => o.date === '2025-10-01')?.status).toBe('cancelled')
  })

  it('恢复是"要么全成要么全不动"：非法备份被拒绝，原数据不受影响', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const sem = (await repos.semesters.active())!
    await repos.blocks.put(
      makeCourse({ semesterId: sem.id, title: '保留的课程', weekday: 1, periods: [1, 2], weeks: [1] }),
    )

    await expect(importBackup(repos, '{ 这不是 json')).rejects.toBeInstanceOf(BackupError)

    // 原数据仍在
    const courses = await repos.blocks.listCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0]?.title).toBe('保留的课程')
  })

  it('拒绝用空学期备份覆盖当前数据（防手滑清库）', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const empty = JSON.stringify({
      format: 'jiwei-backup',
      formatVersion: 1,
      exportedAt: nowIso(),
      data: { semesters: [], periods: [], blocks: [], adjustments: [], alerts: [], notes: [], meta: {} },
    })
    await expect(importBackup(repos, empty)).rejects.toThrow('没有任何学期')
  })

  it('拒绝来自更新版本的备份，并说明原因', async () => {
    const repos = freshRepos()
    await bootstrap(repos, { startDate: '2025-09-22' })
    const future = JSON.stringify({
      format: 'jiwei-backup',
      formatVersion: 99,
      exportedAt: nowIso(),
      data: { semesters: [], periods: [], blocks: [], adjustments: [], alerts: [], notes: [], meta: {} },
    })
    await expect(importBackup(repos, future)).rejects.toThrow('更新的版本')
  })

  it('结构不合规时给出可读错误（指出出错位置）', () => {
    const bad = JSON.stringify({
      format: 'jiwei-backup',
      formatVersion: 1,
      exportedAt: nowIso(),
      // 缺 data
    })
    expect(() => parseBackup(bad)).toThrow(/不符合格式/)
  })
})

describe('端到端：导出 → 清库 → 导入', () => {
  it('数据完全一致（课程字段逐项比对）', async () => {
    const { repos, semesterId } = await seeded()
    const before = await repos.blocks.listCourses()
    const text = await exportBackup(repos)

    // 清库：模拟用户清了浏览器数据
    await repos.semesters.remove(semesterId)
    expect(await repos.blocks.listCourses()).toHaveLength(0)

    await importBackup(repos, text)
    const after = await repos.blocks.listCourses()

    const pick = (b: Block) => ({
      title: b.title,
      anchor: b.anchor,
      detail: b.detail,
      color: b.color,
    })
    expect(after.map(pick)).toEqual(before.map(pick))
  })
})
