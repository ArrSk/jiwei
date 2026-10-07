/**
 * Dexie 仓储实现。
 *
 * 关键实现点：`rebuildOccurrences` 必须在**单个事务**内"先删后写"——
 * IndexedDB 没有 SQL 的事务语义，一旦中途失败留下半套数据，
 * 课表会显示成"有的一周有课、有的一周没课"，且很难排查。
 */
import {
  addDaysStr,
  isValidDateStr,
  materializeAll,
  validatePlan,
  type Adjustment,
  type Alert,
  type Block,
  type Note,
  type Period,
  type Semester,
} from '@jiwei/core'
import type {
  AlertRepo,
  BlockRepo,
  MetaRepo,
  NoteRepo,
  OccurrenceRepo,
  PeriodRepo,
  Repos,
  SemesterRepo,
  StoreDump,
} from '../../types'
import { JiweiDatabase, type OccurrenceRow } from './db'
import { analyzeCourseImport, courseImportRowToBlock, validateCourseImportFields } from '../../courseImport'
import { newId, nowIso } from '../../ids'

/** Occurrence 的确定性 ID 形如 `occ_<blockId>#<date>#<periodStart>`，从中取回 periodStart */
function periodStartOf(id: string): number {
  const last = id.split('#').pop()
  const n = Number(last)
  return Number.isFinite(n) ? n : 0
}

function createSemesterRepo(db: JiweiDatabase): SemesterRepo {
  return {
    list: () => db.semesters.orderBy('startDate').reverse().toArray(),
    get: async (id) => (await db.semesters.get(id)) ?? null,
    active: async () => {
      const active = await db.semesters.filter((s) => s.isActive === true).first()
      if (active) return active
      // 没有显式活跃学期时退化为最新的一个
      return (await db.semesters.orderBy('startDate').reverse().first()) ?? null
    },
    put: async (semester) => {
      await db.semesters.put(semester)
    },
    remove: async (id) => {
      await db.transaction(
        'rw',
        [db.semesters, db.periods, db.blocks, db.occurrences, db.adjustments, db.alerts, db.notes],
        async () => {
          await db.periods.where('semesterId').equals(id).delete()
          await db.occurrences.where('semesterId').equals(id).delete()
          await db.adjustments.where('semesterId').equals(id).delete()
          // 课程类 Block 通过 anchor 归属学期（教学周锚点带 semesterId）
          const owned = await db.blocks
            .filter((b) => b.anchor.type === 'curriculum' && b.anchor.semesterId === id)
            .toArray()
          const occurrences = await db.occurrences.where('semesterId').equals(id).toArray()
          await deleteOwnedAttachments(db, [id, ...owned.map((block) => block.id), ...occurrences.map((occurrence) => occurrence.id)])
          await db.blocks.bulkDelete(owned.map((b) => b.id))
          await db.semesters.delete(id)
        },
      )
    },
  }
}

function createPeriodRepo(db: JiweiDatabase): PeriodRepo {
  return {
    listBySemester: (semesterId) =>
      db.periods.where('semesterId').equals(semesterId).sortBy('index'),
    replaceAll: async (semesterId, periods) => {
      await db.transaction('rw', db.periods, async () => {
        await db.periods.where('semesterId').equals(semesterId).delete()
        await db.periods.bulkPut(periods)
      })
    },
  }
}

function createBlockRepo(db: JiweiDatabase): BlockRepo {
  return {
    list: () => db.blocks.toArray(),
    listByKind: (kind) => db.blocks.where('kind').equals(kind).toArray(),
    listCourses: () => db.blocks.where('kind').equals('course').toArray(),
    // 课程类 Block 靠 anchor.semesterId 归属学期；非课程类（将来的日程/任务）不属于任何学期
    listBySemester: (semesterId) =>
      db.blocks
        .filter((b) => b.anchor.type === 'curriculum' && b.anchor.semesterId === semesterId)
        .toArray(),
    get: async (id) => (await db.blocks.get(id)) ?? null,
    put: async (block) => {
      await db.blocks.put(block)
    },
    remove: async (id) => {
      await db.transaction('rw', [db.blocks, db.adjustments, db.occurrences, db.alerts, db.notes], async () => {
        const occurrences = await db.occurrences.where('blockId').equals(id).toArray()
        await db.adjustments.where('blockId').equals(id).delete()
        await deleteOwnedAttachments(db, [id, ...occurrences.map((occurrence) => occurrence.id)])
        await db.occurrences.where('blockId').equals(id).delete()
        await db.blocks.delete(id)
      })
    },
  }
}

function createOccurrenceRepo(db: JiweiDatabase): OccurrenceRepo {
  const hydrate = (row: OccurrenceRow): import('@jiwei/core').Occurrence => {
    const { periodStart: _ignored, ...occ } = row
    return occ
  }
  return {
    listAll: async () => (await db.occurrences.toArray()).map(hydrate),
    listBySemester: async (semesterId) =>
      (await db.occurrences.where('semesterId').equals(semesterId).toArray()).map(hydrate),
    listByDateRange: async (from, to) =>
      (await db.occurrences.where('date').between(from, to, true, true).toArray()).map(hydrate),
    listByBlock: async (blockId) =>
      (await db.occurrences.where('blockId').equals(blockId).toArray()).map(hydrate),
    get: async (id) => {
      const row = await db.occurrences.get(id)
      return row ? hydrate(row) : null
    },
  }
}

function createAlertRepo(db: JiweiDatabase): AlertRepo {
  return {
    listByOwner: (ownerType, ownerId) =>
      db.alerts.where({ ownerType, ownerId }).toArray(),
    put: async (alert) => {
      await db.alerts.put(alert)
    },
    remove: async (id) => {
      await db.alerts.delete(id)
    },
  }
}

function createNoteRepo(db: JiweiDatabase): NoteRepo {
  return {
    listByOwner: (ownerType, ownerId) => db.notes.where({ ownerType, ownerId }).toArray(),
    get: async (id) => (await db.notes.get(id)) ?? null,
    put: async (note) => {
      await db.notes.put(note)
    },
    remove: async (id) => {
      await db.notes.delete(id)
    },
  }
}

function createMetaRepo(db: JiweiDatabase): MetaRepo {
  return {
    get: async (key) => (await db.meta.get(key))?.value ?? null,
    set: async (key, value) => {
      await db.meta.put({ key, value })
    },
    remove: async (key) => {
      await db.meta.delete(key)
    },
    all: async () => {
      const rows = await db.meta.toArray()
      return Object.fromEntries(rows.map((r) => [r.key, r.value]))
    },
  }
}

/** 组装全部仓储。`createRepos()` 会把这个函数作为 Dexie 引擎的入口。 */
export function createDexieRepos(db: JiweiDatabase): Repos {
  return {
    semesters: createSemesterRepo(db),
    periods: createPeriodRepo(db),
    blocks: createBlockRepo(db),
    occurrences: createOccurrenceRepo(db),
    adjustments: {
      listBySemester: (semesterId) =>
        db.adjustments.where('semesterId').equals(semesterId).toArray(),
      listByBlock: (blockId) => db.adjustments.where('blockId').equals(blockId).toArray(),
      put: async (adjustment) => {
        await db.adjustments.put(adjustment)
      },
      remove: async (id) => {
        await db.adjustments.delete(id)
      },
    },
    alerts: createAlertRepo(db),
    notes: createNoteRepo(db),
    meta: createMetaRepo(db),

    async savePlan(block) {
      validatePlan(block)
      await db.transaction('rw', [db.semesters, db.periods, db.blocks, db.adjustments, db.occurrences], async () => {
        const existing = await db.blocks.get(block.id)
        if (existing?.kind === 'course' || existing?.anchor.type === 'curriculum') throw new Error('不能将课程覆盖为计划')
        if (existing && existing.createdAt !== block.createdAt) throw new Error('编辑计划时必须保留创建时间')
        await db.blocks.put(block)
        // 清理旧日期的派生记录；再为所有相交学期生成新记录。
        await db.occurrences.where('blockId').equals(block.id).delete()
        const semesters = await db.semesters.toArray()
        for (const semester of semesters) {
          if (!belongsToSemester(block, semester.id, semester.startDate, endDateOf(semester))) continue
          const periods = await db.periods.where('semesterId').equals(semester.id).toArray()
          const rows = materializeSemesterRows([block], semester, periods, [])
          if (rows.length) await db.occurrences.bulkPut(rows)
        }
      })
    },

    async importCourses(semesterId, drafts) {
      return db.transaction('rw', [db.semesters, db.periods, db.blocks, db.adjustments, db.occurrences], async () => {
        const semester = await db.semesters.get(semesterId)
        if (!semester) throw new Error('目标课表已不存在，请重新选择文件')
        const periods = await db.periods.where('semesterId').equals(semesterId).toArray()
        const options = { semesterId, totalWeeks: semester.totalWeeks, maxPeriod: Math.max(0, ...periods.map((period) => period.index)) }
        // 不信任界面保存的 errors 或旧作息，使用数据库当前配置重新校验。
        const rows = drafts.map((row) => validateCourseImportFields(row.fields, options, row.line))
        const invalid = rows.find((row) => row.errors.length)
        if (invalid) throw new Error(`第 ${invalid.line} 行：${invalid.errors.join('；')}`)
        const periodIndexes = new Set(periods.map((period) => period.index))
        for (const row of rows) {
          for (let index = row.periodStart; index <= row.periodEnd; index += 1) {
            if (!periodIndexes.has(index)) throw new Error(`第 ${row.line} 行：第 ${index} 节没有作息时间`)
          }
        }
        const allBlocks = await db.blocks.toArray()
        const analysis = analyzeCourseImport(rows, allBlocks, semesterId)
        const now = nowIso()
        const additions = analysis.filter((item) => !item.duplicate).map(({ row }) => courseImportRowToBlock(row, semesterId, newId('blk'), now))
        if (additions.length) {
          const adjustments = await db.adjustments.where('semesterId').equals(semesterId).toArray()
          const occurrenceRows = materializeSemesterRows([...allBlocks, ...additions], semester, periods, adjustments)
          await db.blocks.bulkAdd(additions)
          await db.occurrences.where('semesterId').equals(semesterId).delete()
          await db.occurrences.bulkPut(occurrenceRows)
        }
        return { imported: additions.length, skipped: analysis.filter((item) => item.duplicate).length }
      })
    },

    async rebuildOccurrences(semesterId: string): Promise<number> {
      return db.transaction('rw', [db.semesters, db.periods, db.blocks, db.adjustments, db.occurrences], async () => {
        const semester = await db.semesters.get(semesterId)
        if (!semester) throw new Error(`学期不存在：${semesterId}`)

        const periods = await db.periods.where('semesterId').equals(semesterId).sortBy('index')
        const allBlocks = await db.blocks.toArray()
        const adjustments = await db.adjustments.where('semesterId').equals(semesterId).toArray()

        const rows = materializeSemesterRows(allBlocks, semester, periods, adjustments)
        await db.occurrences.where('semesterId').equals(semesterId).delete()
        if (rows.length > 0) await db.occurrences.bulkPut(rows)
        return rows.length
      })
    },

    /** 导出全部原始记录（不含派生表 Occurrence） */
    async dumpAll(): Promise<StoreDump> {
      const [semesters, periods, blocks, adjustments, alerts, notes, metaRows] = await Promise.all([
        db.semesters.toArray(),
        db.periods.toArray(),
        db.blocks.toArray(),
        db.adjustments.toArray(),
        db.alerts.toArray(),
        db.notes.toArray(),
        db.meta.toArray(),
      ])
      return {
        semesters: semesters as Semester[],
        periods: periods as Period[],
        blocks: blocks as Block[],
        adjustments: adjustments as Adjustment[],
        alerts: alerts as Alert[],
        notes: notes as Note[],
        meta: Object.fromEntries(metaRows.map((r) => [r.key, r.value])),
      }
    },

    /**
     * 用备份整体替换当前数据。
     *
     * 单个事务内"先清空再写入"：恢复要么全成、要么全不动。
     * 清库前预计算全部 Occurrence，并与原始记录一起提交。
     */
    async restoreAll(dump: StoreDump): Promise<void> {
      // 先在内存中完成日期、引用和课次预计算；任何失败都不能触碰当前数据库。
      const occurrencesBySemester = materializeDump(dump)

      await db.transaction(
        'rw',
        [
          db.semesters,
          db.periods,
          db.blocks,
          db.occurrences,
          db.adjustments,
          db.alerts,
          db.notes,
          db.meta,
        ],
        async () => {
          await Promise.all([
            db.semesters.clear(),
            db.periods.clear(),
            db.blocks.clear(),
            db.occurrences.clear(),
            db.adjustments.clear(),
            db.alerts.clear(),
            db.notes.clear(),
            db.meta.clear(),
          ])
          await db.semesters.bulkPut(dump.semesters)
          await db.periods.bulkPut(dump.periods)
          await db.blocks.bulkPut(dump.blocks)
          await db.adjustments.bulkPut(dump.adjustments)
          await db.alerts.bulkPut(dump.alerts)
          await db.notes.bulkPut(dump.notes)
          await db.meta.bulkPut(Object.entries(dump.meta).map(([key, value]) => ({ key, value })))
          for (const rows of occurrencesBySemester.values()) {
            if (rows.length > 0) await db.occurrences.bulkPut(rows)
          }
        },
      )
    },
  }
}

function materializeSemesterRows(allBlocks: Block[], semester: Semester, periods: Period[], adjustments: Adjustment[]): OccurrenceRow[] {
  const blocks = allBlocks.filter((block) => belongsToSemester(block, semester.id, semester.startDate, endDateOf(semester)))
  return materializeAll(blocks, { semester, periods }, adjustments).map((occurrence) => ({
    ...occurrence, semesterId: semester.id, periodStart: periodStartOf(occurrence.id), status: occurrence.status ?? 'normal',
  }))
}

async function deleteOwnedAttachments(db: JiweiDatabase, ownerIds: string[]): Promise<void> {
  if (!ownerIds.length) return
  await db.alerts.where('ownerId').anyOf(ownerIds).delete()
  await db.notes.where('ownerId').anyOf(ownerIds).delete()
}

/** 学期最后一天的日期 */
function endDateOf(semester: Semester): string {
  return addDaysStr(semester.startDate, semester.totalWeeks * 7 - 1)
}

/**
 * 恢复前的完整预计算。
 *
 * 这一步必须在清库事务之前完成：materialize 可能因为日期、作息或引用异常失败，
 * 但用户的旧数据此时仍应保持原样。
 */
function materializeDump(dump: StoreDump): Map<string, OccurrenceRow[]> {
  assertUnique(dump.semesters.map((s) => s.id), '学期 id')
  assertUnique(dump.periods.map((p) => p.id), '作息 id')
  assertUnique(dump.blocks.map((b) => b.id), '课程 id')
  assertUnique(dump.adjustments.map((a) => a.id), '调整 id')
  assertUnique(dump.alerts.map((a) => a.id), '提醒 id')
  assertUnique(dump.notes.map((n) => n.id), '笔记 id')

  const semesterIds = new Set(dump.semesters.map((s) => s.id))
  const blockById = new Map(dump.blocks.map((b) => [b.id, b]))
  for (const semester of dump.semesters) assertDate(semester.startDate, `学期 ${semester.id} 的开始日期`)
  for (const period of dump.periods) {
    if (!semesterIds.has(period.semesterId)) throw new Error(`作息 ${period.id} 引用了不存在的学期`)
  }
  for (const block of dump.blocks) validateBlockDates(block, semesterIds)
  for (const adjustment of dump.adjustments) {
    if (!semesterIds.has(adjustment.semesterId)) throw new Error(`调整 ${adjustment.id} 引用了不存在的学期`)
    if (!blockById.has(adjustment.blockId)) throw new Error(`调整 ${adjustment.id} 引用了不存在的课程`)
    assertDate(adjustment.date, `调整 ${adjustment.id} 的日期`)
    if (adjustment.newDate) assertDate(adjustment.newDate, `调整 ${adjustment.id} 的新日期`)
  }

  const result = new Map<string, OccurrenceRow[]>()
  for (const semester of dump.semesters) {
    const periods = dump.periods.filter((p) => p.semesterId === semester.id)
    const semesterStart = semester.startDate
    const semesterEnd = endDateOf(semester)
    const blocks = dump.blocks.filter((b) => belongsToSemester(b, semester.id, semesterStart, semesterEnd))
    const adjustments = dump.adjustments.filter((a) => a.semesterId === semester.id)
    const occurrences = materializeAll(blocks, { semester, periods }, adjustments)
    result.set(
      semester.id,
      occurrences.map((o) => ({
        ...o,
        semesterId: semester.id,
        periodStart: periodStartOf(o.id),
        status: o.status ?? 'normal',
      })),
    )
  }
  return result
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`备份中存在重复的${label}`)
}

function assertDate(value: string, label: string): void {
  if (!isValidDateStr(value)) throw new Error(`${label}不是有效日期：${value}`)
}

function validateBlockDates(block: Block, semesterIds: Set<string>): void {
  if (block.kind !== 'course' && block.anchor.type !== 'curriculum') validatePlan(block)
  if (block.anchor.type === 'curriculum') {
    if (!semesterIds.has(block.anchor.semesterId)) throw new Error(`课程 ${block.id} 引用了不存在的学期`)
  } else if (block.anchor.type === 'allDay' || block.anchor.type === 'deadline') {
    assertDate(block.anchor.date, `课程 ${block.id} 的日期`)
  } else if (block.anchor.type === 'floating') {
    // 无日期的长期计划不需要日期校验。
  } else if (block.anchor.type === 'range') {
    assertDate(block.anchor.start, `事项 ${block.id} 的开始日期`)
    assertDate(block.anchor.end, `事项 ${block.id} 的结束日期`)
    if (block.anchor.end < block.anchor.start) throw new Error(`事项 ${block.id} 的结束日期早于开始日期`)
  } else if (block.anchor.type === 'weekly') {
    assertDate(block.anchor.startDate, `事项 ${block.id} 的开始日期`)
    if (block.anchor.until) assertDate(block.anchor.until, `事项 ${block.id} 的重复结束日期`)
  } else {
    assertDate(block.anchor.start.slice(0, 10), `事项 ${block.id} 的开始日期`)
    assertDate(block.anchor.end.slice(0, 10), `事项 ${block.id} 的结束日期`)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(block.anchor.start)) throw new Error(`事项 ${block.id} 的开始时间无效`)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(block.anchor.end)) throw new Error(`事项 ${block.id} 的结束时间无效`)
  }
  if (block.repeat.mode === 'weekly') assertDate(block.repeat.until, `课程 ${block.id} 的重复结束日期`)
  if (block.repeat.mode === 'curriculum' && !semesterIds.has(block.repeat.semesterId)) {
    throw new Error(`课程 ${block.id} 的重复规则引用了不存在的学期`)
  }
}

/** 判断某个 Block 是否属于该学期 */
function belongsToSemester(
  block: Block,
  semesterId: string,
  start: string,
  end: string,
): boolean {
  if (block.anchor.type === 'curriculum') return block.anchor.semesterId === semesterId
  if (block.anchor.type === 'allDay' || block.anchor.type === 'deadline') return block.anchor.date >= start && block.anchor.date <= end
  if (block.anchor.type === 'floating') return false
  if (block.anchor.type === 'range') return block.anchor.end >= start && block.anchor.start <= end
  if (block.anchor.type === 'weekly') return !block.anchor.until || block.anchor.until >= start
  const date = block.anchor.start.slice(0, 10)
  return date >= start && date <= end
}
