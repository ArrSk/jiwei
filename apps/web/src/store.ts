/**
 * 界面状态（Zustand）。
 *
 * 刻意只放"界面状态"，不放业务数据 —— 业务数据一律经 `@jiwei/data` 仓储读取，
 * 避免出现"两处各存一份课表、互相同步"的经典烂摊子。
 */
import { create } from 'zustand'
import type { Semester } from '@jiwei/core'

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'success' | 'error'
}

interface UiState {
  /** 当前模块（外壳导航用）。M0 只有 timetable。 */
  activeModuleId: string
  setActiveModuleId: (id: string) => void

  /**
   * 当前页签。
   *
   * 放在 store 而不是组件里，因为外壳的**底部导航**需要读写它 ——
   * 导航被锁在屏幕底部，与内容区不在同一棵组件树里。
   *
   * `calendar` 目前是**占位页签**：日程表排在 M4，先把入口留出来。
   */
  view: 'timetable' | 'calendar'
  setView: (view: 'timetable' | 'calendar') => void

  /**
   * 正在查看的**某一天**（1=周一 … 7=周日）。
   *
   * `null` = 周视图（看整周）；设为数字 = **日视图**（只看那一天）。
   * 放进 store 的理由：顶部星期条的点击要切换它，而星期条与内容区
   * 虽在同一模块、却分属不同组件，放 store 比层层传 prop 干净。
   */
  dayViewWeekday: number | null
  setDayViewWeekday: (weekday: number | null) => void

  /** 当前正在查看的学期；null 表示"跟随活跃学期" */
  semester: Semester | null
  setSemester: (semester: Semester | null) => void

  /**
   * 正在查看的教学周。
   * `null` 表示"跟随今天"（打开时自动定位到当前周）；用户手动翻周后才变成具体数字。
   */
  week: number | null
  setWeek: (week: number | null) => void

  toasts: Toast[]
  toast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeModuleId: 'timetable',
  setActiveModuleId: (id) => set({ activeModuleId: id }),

  view: 'timetable',
  // 切走时顺手退出日视图：留在"只看周三"的状态回到课表会让人以为课丢了
  setView: (view) => set({ view, ...(view === 'calendar' ? { dayViewWeekday: null } : {}) }),

  dayViewWeekday: null,
  setDayViewWeekday: (weekday) => set({ dayViewWeekday: weekday }),

  semester: null,
  setSemester: (semester) => set({ semester, week: null }),

  week: null,
  setWeek: (week) => set({ week }),

  toasts: [],
  toast: (text, kind = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
