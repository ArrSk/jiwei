/**
 * Dexie 引擎（storage engine 实现之一，ADR-003 / ADR-007）。
 *
 * 这一层是**可替换的**：将来换 SQLite 或接服务端同步，只改这个目录。
 * `db.ts` 负责表结构与 schema 版本，`repos.ts` 负责仓储实现。
 */
import Dexie, { type EntityTable } from 'dexie'
import type { Adjustment, Alert, Block, Note, Occurrence } from '@jiwei/core'

/** 存储版本。每次改表结构 +1，并在下方追加 `version(n).stores(...).upgrade(...)`。 */
export const DB_VERSION = 2

/** `Occurrence` 的落库形态：比领域模型多一个 `periodStart`，用于确定性 ID 与排序 */
export interface OccurrenceRow extends Omit<Occurrence, 'status'> {
  periodStart: number
  status: Occurrence['status']
  semesterId: string
}

export class JiweiDatabase extends Dexie {
  semesters!: EntityTable<import('@jiwei/core').Semester, 'id'>
  periods!: EntityTable<import('@jiwei/core').Period, 'id'>
  blocks!: EntityTable<Block, 'id'>
  occurrences!: EntityTable<OccurrenceRow, 'id'>
  adjustments!: EntityTable<Adjustment, 'id'>
  alerts!: EntityTable<Alert, 'id'>
  notes!: EntityTable<Note, 'id'>
  meta!: EntityTable<{ key: string; value: string }, 'key'>

  constructor(name = 'jiwei') {
    super(name)

    // 索引声明：`&` 唯一，`[a+b]` 复合索引。
    // occurrences 的 `[semesterId+date]` 支撑"某学期某段日期"的课表查询。
    this.version(DB_VERSION).stores({
      semesters: '&id, isActive, startDate',
      periods: '&id, semesterId, [semesterId+index]',
      blocks: '&id, kind, semesterId, updatedAt',
      occurrences: '&id, blockId, semesterId, date, [semesterId+date], [blockId+date]',
      adjustments: '&id, semesterId, blockId, date',
      alerts: '&id, ownerType, ownerId, [ownerType+ownerId]',
      notes: '&id, ownerType, ownerId, [ownerType+ownerId]',
      meta: '&key',
    })

    // 未来版本在此追加：this.version(3).stores({...}).upgrade(tx => ...)
  }
}

/** 创建（或打开）数据库。传入名字便于测试隔离。 */
export function createDatabase(name?: string): JiweiDatabase {
  return name ? new JiweiDatabase(name) : new JiweiDatabase()
}
