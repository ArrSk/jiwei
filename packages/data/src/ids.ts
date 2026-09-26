/** id 与时间戳生成。集中在这里，将来接服务端时换成 uuid / 雪花 id 只改一处。 */
import { nowIso } from '@jiwei/core'

/** 本地 id。加时间戳前缀便于排查写入顺序，随机后缀避免碰撞。 */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export { nowIso }

/** 常用前缀 */
export const ID_PREFIX = {
  semester: 'sem',
  period: 'per',
  block: 'blk',
  adjustment: 'adj',
  alert: 'alt',
  note: 'note',
} as const
