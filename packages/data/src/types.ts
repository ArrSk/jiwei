/**
 * 数据层对外契约（ADR-007）。
 *
 * **业务代码（features/*）只允许依赖本文件的类型**，不得直接 import Dexie。
 * 这条约束由 ESLint `no-restricted-imports` 强制执行，因为一旦实现细节渗透到业务代码，
 * "将来把 IndexedDB 换成 SQLite"就会从"换一个入参"退化成"重构整个应用"。
 */
import type {
  Adjustment,
  Alert,
  Block,
  Note,
  Occurrence,
  Period,
  Semester,
} from '@jiwei/core'
import type { CourseImportResult, CourseImportRow } from './courseImport'

/** 当前使用的存储引擎标识，写入 Meta 表，供将来迁移时检测 */
export type StorageEngineKind = 'dexie' | 'sqlite'

export interface SemesterWithPeriods {
  semester: Semester
  periods: Period[]
}

export interface SemesterRepo {
  list(): Promise<Semester[]>
  get(id: string): Promise<Semester | null>
  /** 当前活跃学期（界面上正在看的那一个） */
  active(): Promise<Semester | null>
  put(semester: Semester): Promise<void>
  remove(id: string): Promise<void>
}

export interface PeriodRepo {
  listBySemester(semesterId: string): Promise<Period[]>
  replaceAll(semesterId: string, periods: Period[]): Promise<void>
}

export interface BlockRepo {
  list(): Promise<Block[]>
  listByKind(kind: Block['kind']): Promise<Block[]>
  /** 课表视图用：只取课程类 */
  listCourses(): Promise<Block[]>
  /**
   * 某一张课表（学期）里的课程。
   *
   * **多课表并存时视图必须用这个，不要用 `listCourses()`** ——
   * 后者会返回所有学期的课，切到另一张课表时会串课。
   */
  listBySemester(semesterId: string): Promise<Block[]>
  get(id: string): Promise<Block | null>
  put(block: Block): Promise<void>
  remove(id: string): Promise<void>
}

export interface OccurrenceRepo {
  listAll(): Promise<Occurrence[]>
  listBySemester(semesterId: string): Promise<Occurrence[]>
  listByDateRange(from: string, to: string): Promise<Occurrence[]>
  listByBlock(blockId: string): Promise<Occurrence[]>
  get(id: string): Promise<Occurrence | null>
}

export interface MetaRepo {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  /** 删键。删除课表时要顺手清掉它的作息配方，否则 meta 里会堆孤儿键 */
  remove(key: string): Promise<void>
  all(): Promise<Record<string, string>>
}

/** 附件型资源：M5/M7 才会用到，M0 只保证接口与表就位 */
export interface AlertRepo {
  listByOwner(ownerType: Alert['ownerType'], ownerId: string): Promise<Alert[]>
  put(alert: Alert): Promise<void>
  remove(id: string): Promise<void>
}

export interface NoteRepo {
  listByOwner(ownerType: Note['ownerType'], ownerId: string): Promise<Note[]>
  get(id: string): Promise<Note | null>
  put(note: Note): Promise<void>
  remove(id: string): Promise<void>
}

/**
 * 仓储集合。**这是 web 层唯一需要认识的存储入口**。
 * 将来换成 SQLite 或接服务端同步，只要换 `createRepos(engine)` 的入参。
 */
export interface Repos {
  semesters: SemesterRepo
  periods: PeriodRepo
  blocks: BlockRepo
  occurrences: OccurrenceRepo
  adjustments: {
    listBySemester(semesterId: string): Promise<Adjustment[]>
    listByBlock(blockId: string): Promise<Adjustment[]>
    put(adjustment: Adjustment): Promise<void>
    remove(id: string): Promise<void>
  }
  alerts: AlertRepo
  notes: NoteRepo
  meta: MetaRepo

  /** 确认后的课程导入：重新校验/去重，课程与派生课次在同一事务提交，失败不改库。 */
  importCourses(semesterId: string, rows: CourseImportRow[]): Promise<CourseImportResult>

  /**
   * 幂等重建整个学期的 Occurrence（docs/ARCHITECTURE.md 4.3 第 4 条）。
   *
   * 触发时机：学期周次、作息表、课程、调课记录任一变更。
   * 实现要求：**在一个事务内"先删后写"**，失败必须整体回滚。
   * 因为 Occurrence 的 ID 是确定性的，重建后挂在其上的提醒与笔记不会失联。
   *
   * @returns 重建后的场次数量
   */
  rebuildOccurrences(semesterId: string): Promise<number>

  /**
   * 导出全部**原始记录**（备份用）。
   *
   * 为什么不导出 Occurrence：它是由 Block + Adjustment 派生出来的，
   * 恢复时用 `rebuildOccurrences()` 重新生成即可 —— 这样备份文件更小，
   * 也不会出现"备份里的场次与课程对不上"的隐患。
   */
  dumpAll(): Promise<StoreDump>

  /**
   * 用备份数据**整体替换**当前数据（恢复用）。
   *
   * 必须在单个事务里完成：先清空再写入，失败整体回滚 ——
   * 恢复是"要么全成、要么全不动"的操作，写坏一半比不做更糟。
   */
  restoreAll(dump: StoreDump): Promise<void>
}

/** 全量备份的数据形态（不含派生表 Occurrence） */
export interface StoreDump {
  semesters: Semester[]
  periods: Period[]
  blocks: Block[]
  adjustments: Adjustment[]
  alerts: Alert[]
  notes: Note[]
  /** meta 中的键值（含作息配方 scheduleConfig） */
  meta: Record<string, string>
}
