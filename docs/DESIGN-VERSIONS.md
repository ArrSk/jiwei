# 课表设计版本与回退方法

> 设计改过几轮，每个版本都已打上 **git 标签**，回退不需要记 commit 哈希。
>
> **重要**：`design-first` 原来指向的提交 `4163576` 里，`TimetableGrid.tsx`
> 是**被写坏的文件**（当时用 PowerShell 保存时注释与 JSX 被并成一行）。
> 因此该标签已重新指向"修复版"提交，`4163576` 仅作历史留档，**不要用它回退**。

---

## 一、版本速查

| 标签 | 课程块 | 表头 | 节次号 | 时间 | 分割线 | 时段分组行 |
| --- | --- | --- | --- | --- | --- | --- |
| **`design-first`**（当前） | 实色底 + 白字 | 单行、吸顶 | 10px（"第 N 节"） | 单行 | 有 | 有 |
| `design-solid` | 实色底 + 白字 | 两行、吸顶、字更大 | 14px | 7px（两行） | 无 | 无 |
| `design-pastel` | 浅色底 + 同色深字 + 左竖线 | 两行、吸顶、字最大 | 11px | 8px（两行） | 无 | 无 |

**真正有区别的只有三处**：课程块配色、表头字号与行数、节次轴字号。

### 当前版本（初版观感 + 两处必修）

回退到初版时保留了/修补了两处，都不是视觉选择：

1. **表头 `sticky + z-30`** —— 初版没有它，导致课程块（`z-index:10`）盖住表头。
   这是真实 bug，保留修复。
2. **课程块取色改为 `block.color ?? colorForTitle(block.title)`** ——
   初版写的是 `?? '#64748b'`，而 `Block.color` 从来没被写入过
   （示例课程与新增课程都不设 color），结果**所有色块都是同一个灰色**。
   改为按课程名派生颜色后恢复彩色。

> 如果确实想要初版那个"全灰"效果，把 `TimetableGrid.tsx` 的 `blockColor()`
> 改回 `return block.color ?? '#64748b'` 即可。

---

## 二、我想切回「初版」（当前版本）

```powershell
cd E:\CodeAndProj\jiwei; git checkout design-first -- packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx apps/web/src/lib/demoCourses.ts; Remove-Item apps\web\src\lib\courseColor.ts -Force -ErrorAction SilentlyContinue
```

## 三、我想切到「实色方案」

```powershell
cd E:\CodeAndProj\jiwei; git checkout design-solid -- packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx apps/web/src/lib/courseColor.ts; Remove-Item packages\ui\src\palette.ts,apps\web\src\lib\demoCourses.ts -Force -ErrorAction SilentlyContinue
```

> 注意：`design-solid` 的 `TimetableGrid.tsx` 引用 `lib/courseColor.ts`，
> 所以必须一起恢复 `courseColor.ts`，否则类型检查会报 `Cannot find module`。

## 四、我想切到「浅色方案」

```powershell
cd E:\CodeAndProj\jiwei; git checkout design-pastel -- packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx packages/ui/src/palette.ts; Remove-Item apps\web\src\lib\courseColor.ts -Force -ErrorAction SilentlyContinue
```

**然后必须手工补一步**（实测过，不补会报错）：

在 `packages/ui/src/index.ts` 里加回 `export * from './palette'`。

否则 web 包类型检查会报：

```
error TS2305: Module '"@jiwei/ui"' has no exported member 'paletteFor'
error TS2305: Module '"@jiwei/ui"' has no exported member 'MUTED_PALETTE'
```

⚠️ 这个坑容易漏：**只跑 ui 包的类型检查会显示通过**（ui 包自己不引用 `paletteFor`），
要到 web 包才暴露，若跳过检查就会在浏览器里看到 `paletteFor is not a function`。

---

## 五、切完必须做两件事

```powershell
# 1) 类型检查（切文件容易漏 import）+ 编码体检
pnpm typecheck
node scripts/check-encoding.mjs packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx apps/web/src/lib/demoCourses.ts

# 2) 看效果（dev server 会热更新）
pnpm dev
```

下面是本文件早期版本的遗留说明，保留以解释 `design-first` 标签为何被重新指向。

---

## 附：早期命令留档（标签已变更，勿直接使用）
```

> 初版**存在表头被课程块覆盖的 bug**。如果只想回到"小表头"的观感但不要 bug，
> 更推荐：用 `design-solid`，然后只把表头字号调小（见第六节）。

---

## 五、切完必须做两件事

```powershell
# 1) 类型检查 + 编码体检（切文件容易漏 import，也可能带进坏文件）
pnpm typecheck
node scripts/check-encoding.mjs packages/ui/src/TimeGrid.tsx apps/web/src/features/timetable/TimetablePage.tsx apps/web/src/features/timetable/components/TimetableGrid.tsx apps/web/src/features/timetable/components/CourseList.tsx apps/web/src/lib/demoCourses.ts

# 2) 看效果（dev server 会自动热更新）
pnpm dev
```

> `scripts/check-encoding.mjs` 会检查：BOM、替换字符、乱码字符、
> **注释与标签被并到同一行**（这一项能直接找出语法损坏，本次就是靠它定位的）。

## 六、只想微调某一项（不用整体回退）

以下按**当前版本（初版观感）**的实际位置标注：

| 想要的效果 | 改哪里 |
| --- | --- |
| 节次号更大/更小 | `packages/ui/src/TimeGrid.tsx` → 轴列 `text-[10px]` |
| 时间字更大/更小 | 同上 → 轴列下方 `text-[8px]` |
| 轴上文字改成纯数字 | `apps/web/src/features/timetable/TimetablePage.tsx` → `buildRows()` 的 `label`（现在写的是 `第 N 节`） |
| 星期名 / 日期字大小 | `packages/ui/src/TimeGrid.tsx` → 表头 `text-[11px] sm:text-xs`、日期 `text-[9px] sm:text-[10px]` |
| 行高（每节高度） | 同上 → `--tg-row-h: clamp(2.15rem, 7.2vw, 3.5rem)` |
| 课程颜色规则 | `apps/web/src/lib/demoCourses.ts` → `COURSE_PALETTE`（10 个色值）与 `colorForTitle()` |
| 表头不吸顶 | `packages/ui/src/TimeGrid.tsx` → 去掉表头的 `sticky top-0`（**务必保留 `z-30`**） |
| 去掉分割线 | 同上 → 删掉格子的 `border-b border-l border-border`，改用交替底色 |
| 去掉时段分组行 | 同上 → 删除 `row.kind === 'group'` 分支；`TimetablePage.buildRows()` 里不再传 `group` |

---

## 七、为什么表头必须有 `z-30`

课程块的 `z-index` 是 **10**，而如果表头单元格**既没有定位、也没有 z-index**，
两者就同处一个网格堆叠上下文 → **跨节的大色块会直接压在表头上面**。
初版就存在这个 bug（`4163576`）。

修复方式是给表头加 `position: sticky` + `z-30`，让它形成独立的堆叠上下文。

**无论以后怎么换视觉，都不要去掉 `z-30`；只想去掉吸顶效果的话，删 `sticky top-0` 即可。**

---

## 八、⚠️ 重大坑：`packages/ui` 里的 Tailwind 类曾长期不生效

**症状**：在 `packages/ui/src/TimeGrid.tsx` 里改字号、字号类、`leading-*` 等，
构建后产物 CSS 里**根本没有这些类**，页面上毫无变化。
（`font-size` 只有 10px / 11px 两个值，而源码里明明写了 9/12/13px。）

**根因**：Tailwind 的自动内容探测对**跨包源码**不可靠。
`packages/ui` 是通过 tsconfig `paths` 别名引入的源码包，不在 `apps/web` 目录树内，
它内部的类名没有被收集。

**后果（重要）**：此前几轮"在 UI 包里调字号"的操作**全部静默失效**，
包括 `design-solid` 那版号称的"节次号 14px / 时间 7px"。
用户看到的一直是旧字号，而我误以为改动无效是"视觉选择问题"。

**修复**：在 `apps/web/src/styles.css` 里显式声明扫描范围：

```css
@source '../../index.html';
@source '../src/**/*.{ts,tsx}';
@source '../../../packages/ui/src/**/*.{ts,tsx}';
```

修复后产物 CSS 完整包含 9/10/11/12/13px 与 `leading-[1.15]`、`overflow-wrap:anywhere`。

**纪律**：以后凡是"UI 包里改了类名但页面没反应"，**先查产物 CSS 里有没有这个类**，
再怀疑样式写法。判断命令：

```powershell
$css = (Get-ChildItem 'apps\web\dist\assets\*.css' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
node -e "const fs=require('fs');const t=fs.readFileSync(process.argv[1],'utf8');console.log('12px:', t.split('12px').length-1)" $css
```

> 同理，前几节里"分割线工具类 `border-border-soft` 没生成"也是同一类问题
> （跨包 + 主题令牌），当时用属性选择器绕过了；根因其实是同一个。

