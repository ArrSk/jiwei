/**
 * 模块注册表（ADR-005）。
 *
 * 静态导入全部模块，保持类型安全与 tree-shaking（不用动态扫描目录）。
 * 加模块 = 加一行 import + 加一行数组元素。
 */
import type { FeatureModule } from '@jiwei/ui'
import { timetableModule } from './features/timetable'

export const modules: FeatureModule[] = [timetableModule].sort((a, b) => a.order - b.order)

export function findModule(id: string): FeatureModule | undefined {
  return modules.find((m) => m.id === id)
}
