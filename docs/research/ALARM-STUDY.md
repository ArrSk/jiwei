# 几微 · 闹钟可行性研究：为什么纯网页做不到，我们怎么做

> 历史参考：记录当时的方案与环境，不代表现在仍存在同样问题。执行前核对当前代码和环境；当前开发入口见 [文档导航](../README.md)。

> 这是整个项目**唯一一个"架构必须提前决定、事后无法补救"**的技术点。
> 结论：**闹钟必须依托原生外壳（Capacitor）**；网页端只能提供"应用内提醒"和"系统日历提醒"。

---

## 1. 需求拆解：闹钟 ≠ 提醒

用户说的"闹钟"通常包含三个隐含要求，难度递增：

| 级别 | 要求 | 纯 Web 能否做到 |
| --- | --- | --- |
| N1 **应用内提醒** | 网页开着时弹提示/响一声 | ✅ 能（`Notification` API + Web Audio） |
| N2 **后台通知** | 网页关掉后仍收到提醒 | ⚠️ 部分能（Web Push，见下） |
| N3 **闹钟** | 到点**在锁屏状态响铃/震动**，且**必须响** | ❌ **不能** |

N3 是"闹钟"与"提醒"的分水岭。用户对闹钟的预期是"手机在兜里、屏幕锁着，它也要响"。

---

## 2. 为什么 Web 做不到 N3

三层原因，逐层递进：

### 2.1 后台定时器会被冻结
浏览器为省电会把后台标签页/Service Worker 的定时器降频甚至完全挂起（Chrome 的 intensive throttling、iOS Safari 更激进）。`setTimeout` / `setInterval` 到点不执行是常态，「精确到分钟的闹钟」根本无从谈起。

### 2.2 Web Push 不是闹钟
- Web Push 依赖厂商推送通道（FCM/APNs），**延迟不保证**，从数秒到数分钟；系统会做批量合并（batching）以省电。
- Web Push **不能指定"响铃"**：不能长响、不能震动、不能绕过静音/勿扰，只能发一条普通通知。
- iOS 的 Web Push 还要求：iOS ≥ 16.4、用户必须**把网页"添加到主屏幕"**、且需用户手势授权；限制明显多于原生。

### 2.3 没有系统级调度权限
真正的闹钟 API（Android `AlarmManager.setAlarmClock` / iOS 本地通知的 sound + critical alert）**只对已安装的原生应用开放**。网页拿不到这个权限，这是平台安全模型决定的，不是技术实现问题。

> 参考社区结论：[Your PWA can't wake the phone](https://dev.to/vladifedorov/your-pwa-cant-wake-the-phone-alarms-and-notifications-for-plain-html-without-android-studio-5h22)

---

## 3. 方案对比

| 方案 | 网页可用 | 后台提醒 | 真闹钟 | 成本 | 评价 |
| --- | --- | --- | --- | --- | --- |
| **A. 纯 Web + iCal 导出** | ✅ | 靠系统日历 | 借用系统日历闹钟 | 极低 | 课表/日程够用，闹钟体验是"跳转到日历"，割裂 |
| **B. PWA + Web Push** | ✅ | Android 好、iOS 勉强 | ❌ | 中（需服务器） | 还得为此上线一台服务器，iOS 仍不可靠 |
| **C. React Native / Flutter 重写** | 需另写 Web | ✅ | ✅ | 极高（两套 UI） | 与"网页可访问"的目标冲突 |
| **D. Capacitor 外壳（推荐）** | ✅ 同一份代码 | ✅ | ✅ | 中 | **Web 与原生共用一套 UI 与逻辑，原生只补能力** |

### 为什么推荐 D

Capacitor 把已经写好的 Web 应用装进一个原生容器，同时暴露原生 API：

- 同一份 `apps/web` 代码，同时产出 **PWA** 与 **Android/iOS 安装包**；
- 通过 [`@capacitor/local-notifications`](https://capacitorjs.com/docs/apis/local-notifications) 在**原生侧**排定通知（由系统调度，应用不在前台也准时）；
- Android 侧走 `AlarmManager` 通道，可做到**精确到分钟、响铃/震动、锁屏可见**；
- 需要时还能调用：本地文件、后台任务、角标、震动、开机自启。

代价与注意点：

- 上架应用商店需要开发者账号（Android 一次性费用、iOS 年费）；自己用则可以只打 APK 侧载（无需商店）。
- iOS 的"必响闹钟"（Critical Alerts）需要向 Apple 单独申请权限；普通本地通知在**静音/专注模式**下可能不响——这是 iOS 的系统限制，任何 App 都一样。
- Android 各家 ROM（小米/华为/OPPO）有省电管理，需要引导用户把应用加入**电池优化白名单**，否则后台调度可能被杀。

---

## 4. 对架构的硬性要求（现在就落地）

即使 M5 才做闹钟，M1 就必须满足以下约束，否则将来要返工：

| 要求 | 具体做法 | 落在哪 |
| --- | --- | --- |
| **UI 与平台能力解耦** | 业务代码只调用 `platform.notifications.*` / `platform.alarm.*` 接口，**禁止直接写 `new Notification(...)`** | `packages/platform` |
| **能力探测而非假设** | `platform.capabilities` 返回 `{ canAlarm, canBackgroundPush, canVibrate, canBadge }`，UI 据此降级展示 | `packages/platform` |
| **稳定的时间锚点** | 闹钟挂到 `occurrenceId`（确定性 ID），实例重建后闹钟不丢 | `@jiwei/core` |
| **提醒与事件解耦** | `Alert` 是通用实体，挂 `occurrence`/`block`/`note`，与"是课还是日程"无关 | `@jiwei/core` |
| **原生可打包** | 不用只有 Node 才有的 API；文件/权限走 platform 层；构建产物是纯静态资源 | `apps/web` |
| **能优雅降级** | Web 端把"闹钟"显示为"提醒 + 一键写入系统日历"，而不是假装能响 | `features/alarms` |

---

## 5. 各平台实现路径（M5 执行）

```
用户设置闹钟
   │
   ▼
Alert { ownerType:'occurrence', ownerId, leadMinutes, channels:['alarm'] }
   │
   ├── Web / PWA ──► 通道降级：
   │                  ① 应用内计时器（页面开着时，精确）
   │                  ② Web Push（有服务器时；Android 优先）
   │                  ③ 一键导出到系统日历（含闹钟偏移）→ 最可靠
   │
   └── Native (Capacitor) ──► LocalNotifications.schedule({
                                at: 真实时刻,
                                sound: 'alarm.wav',
                                // Android: allowWhileIdle 走 AlarmManager
                              })
                              + 请求通知权限 + 引导关闭电池优化
```

**关键实现细节**

1. **排程而非轮询**：原生侧一次性把未来 N 天的闹钟全部 `schedule()` 进系统，不依赖应用运行。
2. **幂等重建**：课程/学期变更 → 重建 `occurrence` → 用确定性 ID 重排闹钟（先 `cancel` 旧 ID 再 `schedule`）。
3. **每次上课都响会烦**：闹钟默认**按 occurrence 逐个开关**，并支持"仅本周""长期"两种范围。
4. **电量与配额**：iOS 对单个应用待排通知数量有上限（64 条），超出部分需分批滚动排程（应用打开时补排）。
5. **验证手段**：Android 真机测试"杀掉应用后是否仍响"；iOS 测试"静音模式下是否响"（预期不响，需在 UI 说明）。

---

## 6. 结论与建议

1. **M1 不做闹钟**，但**必须**落地 `packages/platform` 能力层与 `capabilities` 探测（成本很小，收益是将来零返工）。
2. **Web 端永远不承诺"必响闹钟"**，产品文案要诚实：Web = 提醒 + 日历；原生 App = 闹钟。
3. 若"闹钟"是**核心诉求**（不是附属），建议把原生外壳的里程碑提前到 M3~M4 之后，因为它是闹钟的前置条件。
4. 如果最终决定**永远只做网页**，那么产品上应把"闹钟"改称"提醒"，并主打 iCal 系统日历订阅 —— 这条路能覆盖 80% 场景，且零原生开发成本。
