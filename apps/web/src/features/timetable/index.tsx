/**
 * 课程表模块的注册项（ADR-005）。
 *
 * 外壳只认识这个 `FeatureModule`；加日程表/任务/笔记时，照抄这个文件的结构即可，
 * **不需要改动课表的任何代码**。
 */
import { CalendarIcon, type FeatureModule } from '@jiwei/ui'
import { TimetablePage } from './TimetablePage'

export const timetableModule: FeatureModule = {
  id: 'timetable',
  title: '课程表',
  icon: CalendarIcon,
  order: 10,
  render: TimetablePage,
}
