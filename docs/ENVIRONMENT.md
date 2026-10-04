# 环境诊断与行动清单

> 起因：M0 编码完成后，安装依赖与验证耗费了大量时间却反复失败。
> 本文档记录**真实原因**、**已修复项**、**仍需你决策的事项**，避免下次重复踩坑。
>
> **后续补充（重要）**：M0 最终**已完整验证通过**——core 44/44、data 11/11、生产构建 468 模块成功。
> 当时"环境拦死一切"的判断是**过度悲观**的，原因见 R3 的更正说明。

---

## 零、最终结论（先看这里）

**你不需要做任何环境改造，项目就能继续推进。** 三项"必做"已全部消除，只剩一项可选的便利措施与一次授权。

| 我之前列的 | 实际情况 |
| --- | --- |
| 【必做1】解决网络 | ❌ **已无必要**。472 个依赖已完整安装、lockfile 完整；现有代码在网络不通时也能构建通过。只有"新增依赖"才会受影响 |
| 【必做2】验证代码 | ✅ **已完成**（我用完全访问跑通了单测与构建）。你若想自己复核，命令见第五节 |
| 【必做3】决定沙箱权限 | ⚠️ **保留**，但已降级为"每次让我跑 dev/test 时点一次授权"，你也可改为自己终端运行 |
| 【可选4】`git init` | 建议做，但不阻塞（具体命令见第五节） |

---

## 一、结论速览

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| 环境本身的问题 | 4 | 网络（根因）、pnpm 11 默认值、沙箱限制、PowerShell 策略 |
| 我的操作失误 | 3 | 误判 EPERM、用 PowerShell 改文本毁文件、长任务空等 |
| 已修复 | 3 | 配置文件、缺失依赖、代码错误 |
| 需要你处理 | 1 | 见第五节 |

**一句话**：代码写完了，**卡住的是环境**，而其中一半是我自己的误判造成的；事后证明这些坑**几乎都不需要你来填**。

---

## 二、逐条根因

### R1 · 网络（根因，影响最大）

`registry.npmjs.org` 的 TLS 连接**间歇性被重置**：

- `pnpm install` 元数据请求在 **60 秒**时被掐断（`ERR_PNPM_BROKEN_METADATA_JSON: The operation was aborted due to timeout`）；
- `curl` / `Invoke-WebRequest` 连 `https://example.com` 都失败，但 `pnpm add zod` 单包却能在 49 秒内成功 → 说明不是完全不通，而是**不稳定 + 极慢（实测 3~30 KiB/s）**；
- `registry.npmmirror.com` 同样不可达。

后果：每次 install 都要重试多轮；`@types/node` 这类小包也可能装不上。

### R2 · pnpm 11 的三个新默认值（最容易被误读）

| 项 | 行为 | 为什么坑 |
| --- | --- | --- |
| `allowBuilds` | 取代了 `onlyBuiltDependencies`；**未配置时拦截构建脚本，且以非零码退出**（`ERR_PNPM_IGNORED_BUILDS`） | 报错文本看起来像"安装失败"，实际依赖已装好。我因此白跑了好几轮 |
| `verifyDepsBeforeRun` | 默认 `install`：**每次执行脚本前都会重新校验依赖** | 校验内部再跑 install → 又被上面的拦截判定为失败 → `pnpm typecheck` / `pnpm test` **根本无法启动** |
| 配置位置迁移 | `.npmrc` 只认 registry/认证，**其余设置必须写 `pnpm-workspace.yaml`**；环境变量前缀从 `npm_config_*` 改成 `pnpm_config_*` | 我最初把重试/超时写进 `.npmrc`，**完全没生效** |

### R3 · 沙箱限制：esbuild 无法以服务模式启动（硬限制，无法绕开）

已用实验确证（受限模式 vs 完全访问，同一命令）：

```
Error: spawn EPERM
  at ChildProcess.spawn
  at Object.spawn (esbuild/lib/main.js:2272)      ← ensureServiceIsRunning
  at bundleConfigFile (vite/dist/node/chunks/config.js)
```

esbuild 启动自己的二进制时使用「常驻服务进程 + 管道 stdio」。受限沙箱会拒绝这种子进程创建。
**连锁后果**：Vite 用它加载配置 → **Vitest / `vite dev` / `vite build` 在受限模式下无法运行**。

> **更正（事后实测）**：这一条被我说得过于严重。实际边界很窄：
> - **只在受限模式下失败**；用完全访问（`danger-full-access`）运行时，同一命令**全部成功**：
>   单测 44/44 + 11/11、生产构建 468 模块 3.25 秒、dev server 正常响应。
> - **不影响 install 的结果**：那 472 个依赖本来就已经装好了（`install` 的 EPERM 只发生在最后跑 esbuild postinstall 时，属于"已装好之后的收尾动作失败"）。
> - **也不需要替代方案**：我曾试图写一个"零依赖开发服务器"绕开 esbuild，但 Node 的原生类型剥离**不转换 JSX**，而本项目界面全是 `.tsx`，
>   所以那条路走不通，已删除，避免留下半成品代码。
> - **真正的代价只有一个**：我在这个会话里每次跑 dev/test/build，都需要你点一次授权提示；你自己在终端里跑则完全不受限。

### R4 · PowerShell 执行策略

`npm.ps1` 未签名 → 被 `RemoteSigned` 拦截。本项目统一用 `pnpm`，但如果你要用 npm，需 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 或改用 `npm.cmd`。

### M1 · 我的失误：把 EPERM 当成"沙箱禁止一切子进程"

实际只有 esbuild 服务模式受限，`tsc` 完全正常；而且**用完全访问跑时一切正常**。
这个误判让我以为"测试根本跑不了"，多花了不少时间，还差点写一个多余的替代服务器。

### M2 · 我的失误：用 PowerShell 的 `-replace` 改配置文件

`Get-Content -Raw` 按 GBK 读、`Set-Content` 按 UTF-8 写 → **中文注释全变乱码，且多行被并成一行**，
把 `pnpm-workspace.yaml` 写坏（`minimumReleaseAge: 0` 被併进注释）。已用文件工具重写修复。

### M3 · 我的失误：长任务空等

多次把 5~20 分钟的 `install` 放后台，然后反复 `job_output` 轮询。工具单次上限 600 秒、
网络又慢，大量时间耗在"等待"而不是"推进"上。

---

## 三、已修复（无需你处理）

| 项 | 状态 |
| --- | --- |
| `pnpm-workspace.yaml`：补 `allowBuilds: {esbuild: true}`、`verifyDepsBeforeRun: false`、超时与重试、`minimumReleaseAge: 0` | ✅ |
| `.npmrc`：只保留 registry，并修掉乱码 | ✅ |
| `scripts/install-retry.mjs`：反复 install 直到成功（已下载的包会复用，每轮都有推进） | ✅ |
| `scripts/verify.ps1`：绕开 `pnpm run` 直接调各包 `.bin` 做类型检查与测试 | ✅ |
| `packages/ui` 补 `@types/node`（已装上） | ✅ |
| 代码错误：core/data 测试相对路径 `../` → `./`、`Engine` 导入来源、platform 的 `../types`、未用变量 | ✅ |

---

## 四、需要你做的事（已缩减为 1 项）

### 【必做】决定由谁执行 dev / test / build

因为 R3（且已被实测确认），**涉及 Vite / Vitest 的命令在本会话的受限模式下会 EPERM**。两条路：

| 方式 | 操作 | 说明 |
| --- | --- | --- |
| **A. 你自己的终端**（推荐，零摩擦） | 打开 Windows Terminal / PowerShell，执行下面第五节命令 | 你的终端**没有沙箱限制**，不需要任何授权 |
| B. 让我来跑 | 每次我调用时你点一次授权提示 | 已在上一轮成功跑通（单测 + 构建 + dev server） |

### 【建议】初始化版本库（保护已完成的 M0 代码）

```powershell
cd path\to\jiwei
git init
git add .
git commit -m "M0: 单仓骨架 + 完整数据模型 + 课表周视图"
```

### 【不需要做】以下三项已确认无需处理

| 项 | 为什么不需要 |
| --- | --- |
| 解决 npm 网络 | 472 个依赖已装好、lockfile 完整；现有代码断网也能构建。只有"将来新增依赖"才需要（那时再按 `scripts/install-retry.mjs` 或多跑几轮即可） |
| 改 PowerShell 执行策略 | 本项目统一用 `pnpm` / `npm.cmd`，不受 `npm.ps1` 签名限制影响 |
| 安装原生开发环境 | M5 做闹钟时才需要（Android Studio / Xcode） |

---

## 五、可直接复制的命令

```powershell
cd path\to\jiwei

# 安装（仅在需要新增依赖时；已装好则可跳过）
pnpm install
# 网络不稳时改用（每轮都会往前推进）：
node scripts/install-retry.mjs 12

# 类型检查（5 个包）
pnpm typecheck

# 单元测试
pnpm test

# 生产构建（产出 PWA 静态资源到 apps/web/dist）
pnpm build

# 开发服务器
pnpm dev
#   → 本机 http://localhost:5273/
#   → 手机 http://<局域网IP>:5273/   （需同一 Wi-Fi；Windows 防火墙放行 Node）
```

---

## 六、本次实际达成（全部已验证）

| 项 | 结果 |
| --- | --- |
| 5 个包的类型检查（core / data / ui / platform / web） | ✅ 全部 exit=0 |
| `@jiwei/core` 单元测试（单双周 / 跳过周 / 连堂 / 调课 / 冲突 / 跨年 / 闰年） | ✅ **44 / 44 通过** |
| `@jiwei/data` 单元测试（迁移 / CRUD / Occurrence 幂等重建 / **重建后附件不丢**） | ✅ **11 / 11 通过** |
| 生产构建（Vite + PWA） | ✅ **468 模块，3.25 秒**；产出 `index-*.js` 485 KB、CSS 16.6 KB、`sw.js` + `manifest.webmanifest` |
| 开发服务器 | ✅ `http://localhost:5273/` 与局域网地址均返回 200，`/src/main.tsx` 已被正确转译 |
| 单仓骨架（6 个包 + 构建与测试链路） | ✅ 完成 |
| M0 前端代码（周视图、录课表单、课程清单、设置面板、深色模式、PWA） | ✅ 完成 |

**唯一仍需你亲手确认的一步**：在浏览器/手机上打开课表，添加一门课，看它是否出现在网格里。
自动化测试覆盖了时间计算与存储，但"界面看起来对不对"只能靠眼睛。
