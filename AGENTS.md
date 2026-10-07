# 几微项目维护约定

## 接手入口

- 先读 `docs/HANDOVER.md`，了解实测基线、代码入口和未修复问题。
- 产品与长期设计见 `README.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md`。
- 架构与路线图同时含规划；当前实现以代码和实测为准，不把规划写成已完成。
- 用户指令优先。按当前任务完成必要工作，避免顺带扩展其他里程碑。

## 分层

- `packages/core`：模型、日期/周次计算、课次展开；保持纯函数，不依赖 DOM 或存储。
- `packages/data`：仓储、学期/作息管理、备份恢复、Dexie 实现。
- `packages/ui`：通用网格、图标、模块契约。
- `packages/platform`：通知、文件与持久化存储能力；当前只有 Web 实现。
- `apps/web`：React 客户端、外壳与功能模块。
- 时间计算复用 core；界面通过 `useJiwei().repos` 和 data 服务操作数据，不直接使用 Dexie。
- 功能模块之间不要互相导入；共享逻辑放到适当的公共层。
- Zustand 以界面状态为主。现有 store 含选中学期快照，恢复/更新数据库时需同步它。

## 数据与行为

- `Block` 是模板，`Occurrence` 是派生课次。编辑课程保留 Block 的 id 与 createdAt。
- 学期、课程、作息、调整变化后，按需重建课次，再调用 `refresh()` 通知读取方；`refresh()` 自身只递增 dataVersion。
- 正常课和调入课均为 normal；调出课为 moved，停课为 cancelled。判断是否上课用 `isOccurrenceActive()`。
- 作息配置按学期保存为 `scheduleConfig:<id>`；保留旧全局键的读取兼容。
- 保持已有数据库与备份的升级兼容。涉及 schema、ID 或删除/恢复流程时检查引用完整性和失败回滚。
- PWA 的 base、start_url、scope 保持相对路径，兼容 GitHub Pages `/jiwei/` 子目录。
- 新功能只在真实可用后加入能力列表；当前没有日程、日历订阅、同步或原生闹钟成品。

## 开发与验证

- Node >=22；pnpm 版本以根 package.json 的 packageManager 为准。
- `pnpm dev`：开发服务，配置端口 5273。
- 改代码后运行 `pnpm typecheck`、`pnpm test`、`pnpm build`，构建成功后运行 `pnpm smoke`。
- 针对行为/数据问题补有意义的回归测试；纯文档改动检查链接、编码和 diff 即可。
- 现有 web 测试只有纯函数单测。涉及交互、刷新、恢复、离线时补对应浏览器验证，并说明手机真机是否覆盖。
- `scripts/verify.ps1` 当前漏 web 单测和 smoke，不能代替完整检查；修复前使用上述四条命令。
- `docs/history/ENVIRONMENT.md` 描述历史环境问题；当前是否受限需实测，不能据此直接跳过检查。
- `pnpm save` 会提交并推送，main 推送会触发部署。仅在任务授权提交/推送时使用，优先用标准 Git 命令检查实际状态。

## 文档维护

- 维护结果与未完成项更新 `docs/HANDOVER.md`；产品能力变化同步 README/ROADMAP。
- 模型与关键决策变化同步 ARCHITECTURE/DECISIONS。
- 不改写历史检查记录为本次结果；记录日期、基线版本、实际检查范围与未验证边界。
