/**
 * 全量备份与恢复。
 *
 * 为什么必须有它：本项目按 ADR-002 是**本地优先、无服务器**，数据只存在用户的浏览器里。
 * 而调研（docs/MOBILE-ARCHITECTURE.md 第五节）确认 iOS 上 IndexedDB 可能
 * **静默丢失数据**（WebKit #277615，Dexie 作者本人确认无法绕过）。
 * 在迁移到原生 SQLite（M5）之前，**可导出的 JSON 备份是唯一的兜底**。
 *
 * 设计要点：
 * - 备份里**不含 Occurrence**（它是 Block + Adjustment 派生出来的），
 *   恢复时重建即可 —— 文件更小，也不会出现"场次与课程对不上"。
 * - 导入用 Zod 严格校验：宁可拒绝一个坏文件，也不能把半套数据灌进库。
 * - 备份带 `formatVersion`，将来格式变化时能识别并给出明确提示。
 */
import { z } from 'zod'
import { Adjustment, Alert, Block, Note, Period, Semester } from '@jiwei/core'
import type { Repos, StoreDump } from './types'

/** 备份格式版本。改动 Schema 时 +1。 */
export const BACKUP_FORMAT_VERSION = 1

const BackupSchema = z.object({
  format: z.literal('jiwei-backup'),
  formatVersion: z.number().int().min(1),
  exportedAt: z.string().min(1),
  appVersion: z.string().optional(),
  data: z.object({
    semesters: z.array(Semester),
    periods: z.array(Period),
    blocks: z.array(Block),
    adjustments: z.array(Adjustment),
    alerts: z.array(Alert),
    notes: z.array(Note),
    meta: z.record(z.string(), z.string()),
  }),
})

export type BackupFile = z.infer<typeof BackupSchema>

export interface ExportOptions {
  appVersion?: string
}

/** 生成备份文件内容（JSON 字符串，带缩进便于人工检查） */
export async function exportBackup(repos: Repos, options: ExportOptions = {}): Promise<string> {
  const dump = await repos.dumpAll()
  const file: BackupFile = {
    format: 'jiwei-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    data: dump,
  }
  return JSON.stringify(file, null, 2)
}

/** 生成建议的文件名：`jiwei-backup-2026-09-26.json` */
export function backupFileName(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `jiwei-backup-${y}-${m}-${d}.json`
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

/** 解析并校验备份内容；任何不合规都抛出可读的错误 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('不是合法的 JSON 文件')
  }

  const parsed = BackupSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const where = first?.path.join('.') ?? '未知位置'
    throw new BackupError(`备份内容不符合格式（${where}：${first?.message ?? '校验失败'}）`)
  }

  if (parsed.data.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupError(
      `备份来自更新的版本（格式 v${parsed.data.formatVersion}，本应用支持到 v${BACKUP_FORMAT_VERSION}），请先升级应用`,
    )
  }

  return parsed.data
}

export interface ImportResult {
  semesters: number
  periods: number
  blocks: number
}

/**
 * 用备份**整体替换**当前数据，并重建派生的场次。
 *
 * ⚠️ 这是破坏性操作：调用方必须先让用户确认（界面上的确认文案要写清"当前数据会被覆盖"）。
 */
export async function importBackup(repos: Repos, text: string): Promise<ImportResult> {
  const file = parseBackup(text)
  const data = file.data
  if (data.semesters.length === 0) {
    throw new BackupError('备份里没有任何学期，拒绝用空数据覆盖当前课表')
  }

  await repos.restoreAll(data as StoreDump)

  return {
    semesters: data.semesters.length,
    periods: data.periods.length,
    blocks: data.blocks.length,
  }
}

/** 备份内容的概况，用于导入前给用户确认 */
export function describeBackup(file: BackupFile): string {
  const d = file.data
  const names = d.semesters.map((s) => s.name).join('、')
  const exported = file.exportedAt.slice(0, 19).replace('T', ' ')
  return `${d.semesters.length} 个学期（${names}）· ${d.blocks.length} 门课程 · 导出于 ${exported}`
}
