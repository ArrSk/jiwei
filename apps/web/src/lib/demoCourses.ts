/**
 * 示例课表数据。
 *
 * 只在用户主动点击"载入示例课表"时写入 —— 不用默认数据污染用户真实的课表。
 * 存在的意义：M0 的验收标准是"看到自己的课表"，没有任何数据时无法验证渲染链路。
 */
import { allWeeks, makeCourse } from '@jiwei/data'
import type { Block, Semester } from '@jiwei/core'
import type { ColorName } from './palette'

export interface DemoCourseSpec {
  title: string
  weekday: number
  periods: [number, number]
  weeks: number[]
  teacher?: string
  location?: string
  /** 显式指定色名，让 7 组配色都能展示出来 */
  color: ColorName
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
      color: 'blue',
    },
    {
      title: '大学英语',
      weekday: 1,
      periods: [3, 4],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '李梅',
      location: '外语楼 305',
      color: 'red',
    },
    {
      title: '线性代数',
      weekday: 2,
      periods: [1, 2],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '王强',
      location: '教二 108',
      color: 'cyan',
    },
    {
      title: '大学物理',
      weekday: 3,
      periods: [3, 4],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '陈志远',
      location: '理科楼 402',
      color: 'purple',
    },
    {
      title: '数据结构',
      weekday: 3,
      periods: [5, 6],
      weeks,
      teacher: '刘伟',
      location: '计算机楼 501',
      color: 'green',
    },
    {
      title: '体育（篮球）',
      weekday: 4,
      periods: [5, 6],
      weeks: odd.filter((w) => w <= 16),
      location: '东操场',
      color: 'orange',
    },
    {
      title: '大学物理实验',
      weekday: 4,
      periods: [7, 8],
      weeks: even,
      teacher: '陈志远',
      location: '物理实验中心 B203',
      color: 'yellow',
    },
    {
      title: '毛泽东思想概论',
      weekday: 5,
      periods: [1, 2],
      weeks: weeks.filter((w) => w <= 16),
      teacher: '赵敏',
      location: '文科楼 210',
      color: 'yellow',
    },
    {
      title: '数据结构上机',
      weekday: 5,
      periods: [7, 9],
      weeks: weeks.filter((w) => w % 3 === 0),
      teacher: '刘伟',
      location: '机房 A',
      color: 'green',
    },
  ]

  return specs.map((s) => {
    const block = makeCourse({
      semesterId: semester.id,
      title: s.title,
      weekday: s.weekday,
      periods: s.periods,
      weeks: s.weeks,
      ...(s.teacher ? { teacher: s.teacher } : {}),
      ...(s.location ? { location: s.location } : {}),
    })
    // 给示例课程**显式指定色名**，让 7 组配色全部露出来（否则会撞色）。
    // 用户自己新增的课程留空，由 paletteForBlock 按课名稳定派生。
    return { ...block, color: s.color }
  })
}

// 课程配色由 `lib/palette.ts` 提供（色值取自 plugin-campus 示例），
// 这里只负责给示例数据指定色名，不维护第二套色板。
