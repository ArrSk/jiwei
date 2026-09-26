# 课表设计版本与回退方法

> 设计改过几轮，每个版本都已打上 **git 标签**，回退不需要记 commit 哈希。
> 三个标签：`design-solid`（当前）、`design-pastel`、`design-first`。

---

## 一、三个版本速查

| 标签 | 课程块 | 表头 | 节次号 | 时间字号 | 分割线 | 时段分组行 |
| --- | --- | --- | --- | --- | --- | --- |
| **`design-solid`**（当前） | **实色底 + 白字** | 两行、吸顶、z-30 | 14px | 7px（两行） | 无 | 无 |
| `design-pastel` | 浅色底 + 同色深字 + 左竖线 | 两行、吸顶、z-30、字更大 | 11px | 8px（两行） | 无 | 无 |
| `design-first` | 实色底 + 白字 | 单行、**无 z-30** | 10px（"第 N 节"） | 单行 | 有 | 有 |

**关键区别只有三处**：课程块配色方案、表头字号与两行结构、节次轴字号。

> ⚠️ 注意 `design-first` **没有**表头的 `z-index` 修复 ——
> 那个版本存在"课程块盖住表头"的真实 bug（见文档末尾说明）。

---

## 二、我想切到「浅色方案」

```powershell
cd E:\CodeAndProj\jiwei

# 恢复该版本涉及的 4 个文件
git checkout design-pastel -- `
  packages/ui/src/TimeGrid.tsx `
  apps/web/src/features/timetable/TimetablePage.tsx `
  apps/web/src/features/timetable/components/TimetableGrid.tsx `
  apps/web/src/features/timetable/components/CourseList.tsx

# 恢复浅色方案专用的配色模块（11cbd40 里被删掉了）
git checkout design-pastel -- packages/ui/src/palette.ts

# 删掉实色方案专用的取色模块
Remove-Item apps\web\src\lib\courseColor.ts -Force -ErrorAction SilentlyContinue

# 别忘了把 ui 包的导出加回 palette（11cbd40 里被移除了）
# 手工确认 packages/ui/src/index.ts 里有这一行：
#   export * from './palette'
```

可直接粘的一行版：

```powershell
cd E:\CodeAndProj\jiwei; git checkout design-pastel -- packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx packages/ui/src/palette.ts; Remove-Item apps\web\src\lib\courseColor.ts -Force -ErrorAction SilentlyContinue
```

## 三、我想切回「实色方案」（当前版本）

```powershell
cd E:\CodeAndProj\jiwei; git checkout design-solid -- packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx apps/web/src/lib/courseColor.ts; Remove-Item packages\ui\src\palette.ts -Force -ErrorAction SilentlyContinue
```

## 四、我想切回「初版」

```powershell
cd E:\CodeAndProj\jiwei; git checkout design-first -- packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx apps/web/src/lib/demoCourses.ts
```

> 初版**存在表头被课程块覆盖的 bug**。如果只想回到"小表头"的观感但不要 bug，
> 更推荐：用 `design-solid`，然后只把表头字号调小（见第六节）。

---

## 五、切完必须做的两件事

```powershell
# 1) 类型检查（切文件容易漏掉 import，必须验）
pnpm typecheck

# 2) 看效果（dev server 会自动热更新）
pnpm dev
```

如果类型检查报了 `Cannot find module './palette'` 或 `paletteFor` 未定义，
说明上面"恢复 palette.ts / 改 index.ts 导出"这两步漏了。

## 六、只想微调某一项（不用整体回退）

| 想要的效果 | 改哪里 |
| --- | --- |
| 节次号更大/更小 | `packages/ui/src/TimeGrid.tsx` → 轴列 `text-[14px]` |
| 时间字更大/更小 | 同上 → `text-[7px]`（两处：开始、结束） |
| 星期名更大/更小 | 同上 → 表头 `text-[11px] sm:text-xs` |
| 日期字更大/更小 | 同上 → 日期行 `text-[9px] sm:text-[10px]` |
| 行高（每节高度） | 同上 → `--tg-row-h: clamp(2.7rem, 9vw, 3.6rem)` |
| 轴上文字改成"第 N 节" | `apps/web/src/features/timetable/TimetablePage.tsx` → `buildRows()` 的 `label` |
| 课程颜色规则 | `apps/web/src/lib/courseColor.ts` → `SEED_COLORS`（常见课固定色）与 `HUE_POOL`（色相池） |
| 表头不吸顶 | `packages/ui/src/TimeGrid.tsx` → 去掉表头两行的 `sticky top-0`（**保留 `z-30`**，否则表头会被课程块盖住） |
| 恢复分割线 | 同上 → 给格子加回 `border-b border-l border-border`，并去掉交替底色 |

---

## 七、为什么 `design-first` 的表头有 bug

课程块的 `z-index` 是 10，而初版的表头单元格**既没有定位、也没有 z-index**。
两者同处一个网格堆叠上下文 → 跨节的大色块（如连上 3 节的实验课）会直接压在表头上面。

修复方式是给表头两行加 `position: sticky` + `z-30`，让它形成独立的堆叠上下文。
这条修复从 `design-pastel` 起一直保留 —— **无论以后怎么调视觉，都不要去掉 `z-30`**。
