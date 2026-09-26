/**
 * 示例课表数据。
 *
 * 只在用户主动点击"载入示例课表"时写入 —— 不用默认数据污染用户真实的课表。
 * 存在的意义：M0 的验收标准是"看到自己的课表"，没有任何数据时无法验证渲染链路。
 */
import { allWeeks, makeCourse } from '@jiwei/data'
import type { Block, Semester } from '@jiwei/core'

export interface DemoCourseSpec {
  title: string
  weekday: number
  periods: [number, number]
  weeks: number[]
  teacher?: string
  location?: string
}

/** 一份典型的大二课表（含单双周与连堂，用来顺带验证展开逻辑） */
export function buildDemoCourses(semester: Semester): Block[] {
  const weeks = allWeeks(semester.totalWeeks)
  const odd = weeks.filter((w) => w % 2 === 1)
  const even = weeks.filter((w) => w % 2 === 0 && w <= 16)

  const specs: DemoCourseSpec[] = [
    {
      title: '高等数学 A',
      weekday: 1,
      periods: [1, 2],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '张建国',
      location: '教三 201',
    },
    {
      title: '大学英语',
      weekday: 1,
      periods: [3, 4],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '李梅',
      location: '外语楼 305',
    },
    {
      title: '线性代数',
      weekday: 2,
      periods: [1, 2],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '王强',
      location: '教二 108',
    },
    {
      title: '大学物理',
      weekday: 3,
      periods: [3, 4],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '陈志远',
      location: '理科楼 402',
    },
    {
      title: '数据结构',
      weekday: 3,
      periods: [5, 6],
      weeks,
      teacher: '刘伟',
      location: '计算机楼 501',
    },
    {
      title: '体育（篮球）',
      weekday: 4,
      periods: [5, 6],
      weeks: odd.filter((w) => w <= 16),
      location: '东操场',
    },
    {
      title: '大学物理实验',
      weekday: 4,
      periods: [7, 8],
      weeks: even,
      teacher: '陈志远',
      location: '物理实验中心 B203',
    },
    {
      title: '毛泽东思想概论',
      weekday: 5,
      periods: [1, 2],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '赵敏',
      location: '文科楼 210',
    },
    {
      title: '数据结构上机',
      weekday: 5,
      periods: [7, 9],
      weeks: weeks.filter((w) => w % 3 === 0),
      teacher: '刘伟',
      location: '机房 A',
    },
  ]

  return specs.map((s) =>
    makeCourse({
      semesterId: semester.id,
      title: s.title,
      weekday: s.weekday,
      periods: s.periods,
      weeks: s.weeks,
      ...(s.teacher ? { teacher: s.teacher } : {}),
      ...(s.location ? { location: s.location } : {}),
    }),
  )
}

// 课程配色统一由 `@jiwei/ui` 的 paletteFor(标题) 派生，
// 这里不再维护第二套色板（避免两处颜色不一致）。
