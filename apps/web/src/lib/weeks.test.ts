import { describe, expect, it } from 'vitest'
import { formatWeeks, weeksToFormText } from './weeks'
import { parseWeeks } from '../features/timetable/TimetablePage'

/**
 * 这段测试守的是"编辑课程时周次不会悄悄变样"。
 *
 * 编辑表单预填的是 `weeksToFormText(weeks)` 的结果，用户点保存时又用它经
 * `parseWeeks` 解析回数组。**一旦两者不对称，用户只是点了下编辑再保存，
 * 周次就被改了** —— 这种 bug 极难被发现，但后果严重（课表静默变动）。
 */
describe('weeksToFormText ↔ parseWeeks 往返一致', () => {
  const cases: Array<[string, number[]]> = [
    ['连续区间', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]],
    ['单周', [1, 3, 5, 7, 9, 11, 13, 15]],
    ['双周', [2, 4, 6, 8, 10, 12, 14, 16]],
    ['零散周次', [1, 3, 7, 11]],
    ['单周但末尾不齐', [1, 3, 5]],
    ['只一周', [5]],
    ['两周不连续', [2, 9]],
  ]

  for (const [name, weeks] of cases) {
    it(`${name}：序列化再解析回来完全一致`, () => {
      const text = weeksToFormText(weeks)
      expect(parseWeeks(text, 20)).toEqual(weeks)
    })
  }

  it('空数组序列化为空串（表单语义 = 每周）', () => {
    expect(weeksToFormText([])).toBe('')
  })
})

describe('formatWeeks（展示用短格式）', () => {
  it('连续区间', () => {
    expect(formatWeeks([1, 2, 3, 4, 5, 6, 7, 8])).toBe('1-8周')
  })

  it('单周压缩成 1-15单周', () => {
    expect(formatWeeks([1, 3, 5, 7, 9, 11, 13, 15])).toBe('1-15单周')
  })

  it('双周压缩成 1-16双周', () => {
    expect(formatWeeks([2, 4, 6, 8, 10, 12, 14, 16])).toBe('1-16双周')
  })

  it('零散周次逗号列出', () => {
    expect(formatWeeks([1, 5, 9])).toBe('1,5,9周')
  })

  it('空数组返回空串', () => {
    expect(formatWeeks([])).toBe('')
  })

  it('奇数序列一律压缩成单周（哪怕没排到学期末）', () => {
    // [1,3,5] 本身就是完整的奇数序列，写成 `1-5单周` 比 `1,3,5周` 更短也更清楚
    expect(formatWeeks([1, 3, 5])).toBe('1-5单周')
    expect(formatWeeks([1, 3, 5, 7])).toBe('1-7单周')
  })

  it('不是完整奇数序列时用逗号列出（避免误导）', () => {
    // 缺了 3：写成 `1-5单周` 会让人以为 3 也有课
    expect(formatWeeks([1, 5])).toBe('1,5周')
    expect(formatWeeks([2, 6])).toBe('2,6周')
  })
})
