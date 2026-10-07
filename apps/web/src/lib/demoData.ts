import { addDaysStr, today, type Block } from '@jiwei/core'
import { buildDemoCourses } from './demoCourses'
import { nowIso, validateCourseImportFields, type Repos } from '@jiwei/data'

const agendaKey = 'demo:agenda:v1'
const tasksKey = 'demo:tasks:v1'
const pending = new WeakMap<Repos, Map<string, Promise<number>>>()

/** 写入一组可重复点击而不会不断复制的示例数据。 */
export async function loadDemoCourses(repos: Repos, semesterId?: string): Promise<number> {
  const semester = semesterId ? await repos.semesters.get(semesterId) : await repos.semesters.active()
  if (!semester) return 0
  const periods = await repos.periods.listBySemester(semester.id)
  const options = { semesterId: semester.id, totalWeeks: semester.totalWeeks, maxPeriod: Math.max(0, ...periods.map((period) => period.index)) }
  const rows = buildDemoCourses(semester).flatMap((block, index) => {
    if (block.anchor.type !== 'curriculum' || !block.anchor.weeks.length) return []
    const [start, end] = block.anchor.periods
    if (end > options.maxPeriod) return []
    return [validateCourseImportFields({ title: block.title, teacher: block.detail?.teacher ?? '', location: block.detail?.location ?? '', weekday: String(block.anchor.weekday), periodStart: String(start), periodEnd: String(end), weeks: block.anchor.weeks.join(','), color: block.color ?? '' }, options, index + 1)]
  })
  const result = await repos.importCourses(semester.id, rows)
  return result.imported
}

export async function loadDemoAgenda(repos: Repos): Promise<number> {
  return saveOnce(repos, agendaKey, [
    makeBlock({ kind: 'event', planType: 'event', title: '【示例】今天的小组讨论', anchor: { type: 'allDay', date: today() } }),
    makeBlock({ kind: 'event', planType: 'deadline', title: '社团报名截止', anchor: { type: 'deadline', date: addDaysStr(today(), 2), time: '18:00' } }),
    makeBlock({ kind: 'task', planType: 'range', title: '准备小组展示', anchor: { type: 'range', start: today(), end: addDaysStr(today(), 5) } }),
    makeBlock({ kind: 'task', planType: 'weekly', title: '每周整理课堂笔记', anchor: { type: 'weekly', weekdays: [1, 3], startDate: today(), until: addDaysStr(today(), 28), startTime: '20:00', endTime: '20:30' } }),
    makeBlock({ kind: 'exam', planType: 'event', title: '高等数学阶段测验', anchor: { type: 'absolute', start: `${addDaysStr(today(), 7)}T09:00:00+08:00`, end: `${addDaysStr(today(), 7)}T11:00:00+08:00` } }),
  ])
}

export async function loadDemoTasks(repos: Repos): Promise<number> {
  return saveOnce(repos, tasksKey, [
    makeBlock({ kind: 'task', planType: 'deadline', title: '提交课程作业', anchor: { type: 'deadline', date: today(), time: '23:59' }, note: '这是一个截止日期示例' }),
    makeBlock({ kind: 'task', planType: 'longterm', title: '整理本学期学习资料', anchor: { type: 'floating' }, note: '这是一个长期事项示例' }),
    makeBlock({ kind: 'task', planType: 'deadline', title: '归还图书', anchor: { type: 'deadline', date: addDaysStr(today(), -1) }, note: '这是一个逾期示例' }),
    { ...makeBlock({ kind: 'task', planType: 'deadline', title: '领取教材', anchor: { type: 'deadline', date: today() } }), done: true },
  ])
}

export async function loadAllDemoData(repos: Repos, semesterId?: string): Promise<number> {
  const courses = await loadDemoCourses(repos, semesterId)
  const agenda = await loadDemoAgenda(repos)
  const tasks = await loadDemoTasks(repos)
  return courses + agenda + tasks
}

function makeBlock(input: Pick<Block, 'kind' | 'planType' | 'title' | 'anchor'> & { note?: string }): Block {
  const stamp = nowIso()
  return { id: '', repeat: { mode: 'once' }, createdAt: stamp, updatedAt: stamp, note: '示例数据，可自由编辑或删除', ...input, title: input.title.startsWith('【示例】') ? input.title : `【示例】${input.title}` }
}

function saveOnce(repos: Repos, key: string, blocks: Block[]): Promise<number> {
  let groups = pending.get(repos)
  if (!groups) { groups = new Map(); pending.set(repos, groups) }
  const running = groups.get(key)
  if (running) return running
  const operation = (async () => {
    let count = 0
    for (const [index, block] of blocks.entries()) {
      const id = `blk_${key}:${index}`
      if (await repos.blocks.get(id)) continue
      await repos.savePlan({ ...block, id })
      count += 1
    }
    return count
  })().finally(() => groups.delete(key))
  groups.set(key, operation)
  return operation
}
