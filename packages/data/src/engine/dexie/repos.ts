/**
 * Dexie 仓储实现。
 *
 * 关键实现点：`rebuildOccurrences` 必须在**单个事务**内"先删后写"——
 * IndexedDB 没有 SQL 的事务语义，一旦中途失败留下半套数据，
 * 课表会显示成"有的一周有课、有的一周没课"，且很难排查。
 */
import { materializeAll, type Adjustment, type Alert, type Block, type Note, type Period, type Semester } from '@jiwei/core'
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
        [db.semesters, db.periods, db.blocks, db.occurrences, db.adjustments],
        async () => {
          await db.periods.where('semesterId').equals(id).delete()
          await db.occurrences.where('semesterId').equals(id).delete()
          await db.adjustments.where('semesterId').equals(id).delete()
          // 课程类 Block 通过 anchor 归属学期（教学周锚点带 semesterId）
          const owned = await db.blocks
            .filter((b) => b.anchor.type === 'curriculum' && b.anchor.semesterId === id)
            .toArray()
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
    get: async (id) => (await db.blocks.get(id)) ?? null,
    put: async (block) => {
      await db.blocks.put(block)
    },
    remove: async (id) => {
      await db.blocks.delete(id)
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

    async rebuildOccurrences(semesterId: string): Promise<number> {
      const semester = await db.semesters.get(semesterId)
      if (!semester) throw new Error(`学期不存在：${semesterId}`)

      const periods = await db.periods.where('semesterId').equals(semesterId).sortBy('index')
      const allBlocks = await db.blocks.toArray()
      const adjustments = await db.adjustments.where('semesterId').equals(semesterId).toArray()

      // 只展开属于该学期的 Block：教学周锚点看 semesterId；绝对时间锚点看是否落在学期日期范围内
      const semesterStart = semester.startDate
      const semesterEnd = endDateOf(semester)
      const blocks = allBlocks.filter((b) => belongsToSemester(b, semesterId, semesterStart, semesterEnd))

      const occurrences = materializeAll(
        blocks as Block[],
        { semester: semester as Semester, periods: periods as Period[] },
        adjustments as Adjustment[],
      )

      const rows: OccurrenceRow[] = occurrences.map((o) => ({
        ...o,
        semesterId,
        periodStart: periodStartOf(o.id),
        status: o.status ?? 'normal',
      }))

      await db.transaction('rw', db.occurrences, async () => {
        await db.occurrences.where('semesterId').equals(semesterId).delete()
        if (rows.length > 0) await db.occurrences.bulkPut(rows)
      })

      return rows.length
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
     * 写完再逐学期重建 Occurrence —— 只重建一次，避免不必要的事务。
     */
    async restoreAll(dump: StoreDump): Promise<void> {
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
        },
      )

      // Occurrence 是派生数据：恢复后按新数据重建
      for (const sem of dump.semesters) {
        await this.rebuildOccurrences(sem.id)
      }
    },
  }
}

/** 学期最后一天的日期 */
function endDateOf(semester: Semester): string {
  const start = new Date(`${semester.startDate}T00:00:00`)
  const days = semester.totalWeeks * 7 - 1
  start.setDate(start.getDate() + days)
  return start.toISOString().slice(0, 10)
}

/** 判断某个 Block 是否属于该学期 */
function belongsToSemester(
  block: Block,
  semesterId: string,
  start: string,
  end: string,
): boolean {
  if (block.anchor.type === 'curriculum') return block.anchor.semesterId === semesterId
  if (block.anchor.type === 'allDay') return block.anchor.date >= start && block.anchor.date <= end
  const date = block.anchor.start.slice(0, 10)
  return date >= start && date <= end
}
