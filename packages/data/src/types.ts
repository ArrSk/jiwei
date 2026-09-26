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
}
