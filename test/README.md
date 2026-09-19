# 看板插件测试环境与编写指南

本目录包含 Paseo 看板插件的单元测试与集成测试套件。

## 1. 测试架构与调度机制

- **运行环境**：Node.js 原生 Test Runner（`node --experimental-strip-types --test "test/*.test.mjs"`），纯 JS 规范，零本地原生编译依赖（如 `node-gyp`）。
- **React 调度器**：采用 `react-test-renderer@19.1.0` 作为最小纯 JS In-Memory Reconciler 与 Scheduler，在 Node 环境中真实驱动 React 19.1 组件挂载、更新、`useSyncExternalStore` 订阅与卸载生命周期。
- **React Native 宿主替身**：宿主 UI 原语（`View`、`Text`、`Pressable`、`ScrollView`、`StyleSheet`、`PanResponder`、`Animated`）抽离于 `test/helpers/react-host-env.mjs`，保证全局 React 单实例运行。
- **错误日志规范**：禁止全局吞没 `console.error`。仅精确过滤已知的 `react-test-renderer is deprecated` 废弃提示，所有未捕获异常、React 警告与 `act(...)` 告警均严格保留并使测试失败。

## 2. 工具弃用说明与宿主局限性

1. **React 19 工具弃用与升级风险**：
   - React 19 已官方弃用 `react-test-renderer`（参见 [React 官方说明](https://react.dev/warnings/react-test-renderer)）。
   - 本项目仅将其作为 Node 环境下最小无依赖调度器使用。未来升级至 React 20+ 时需评估迁移至基于轻量 DOM 的测试套件（如 `@testing-library/react` + happy-dom）或 Paseo 定制 Native 调度器。
2. **非原生宿主渲染声明**：
   - 本套件中的宿主组件均为测试替身，**不能替代真实宿主环境下的布局与手势 E2E 验收**。
   - Yoga Flexbox 真实像素布局计算、触屏与鼠标硬件手势竞争仲裁及 Paseo 宿主插件环境桥接需在宿主集成测试中验证。

## 3. 可控时间规范（Mock Timers）

在涉及长按、轻点与手势互斥锁的测试中，必须使用 Node 原生 `t.mock.timers`，遵循以下核心规则：

1. **避免模拟 `setImmediate`（重要）**：
   ```javascript
   // 正确用法：显式指定被测业务所需的计时 API
   t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
   ```
   **原因**：React 19 的 `act(async () => ...)` 内部依赖原生 `setImmediate`（通过 `enqueueTask` / `recursivelyFlushAsyncActWork`）自流转并发任务队列。如果无参调用 `t.mock.timers.enable()`，Node 将连带模拟 `setImmediate`，导致等待异步 `act` 的任务被冻结在事件循环中造成命令无限挂起。
2. **时间阈值基准**：
   - 触屏长按抓起阈值：`220ms`（核对 `client/kanban-drag.ts:479` 与 ADR-0001）。
   - 鼠标长按抓起阈值：`260ms`（核对 `client/kanban-drag.ts:479`）。
   - 拖拽与落位后互斥锁释放缓冲：`60ms`（核对 `client/kanban-drag.ts:879`、`901`、`932`）。
   - 推进时间须在 `act(() => { t.mock.timers.tick(ms); })` 中执行，确保状态变更在 act 作用域内刷新。

## 4. 外部存储订阅与卸载释放验证规范

测试 `useSyncExternalStore` 驱动的组件生命周期时，**严禁仅凭“卸载后 renderCount 不增加”作为订阅注销凭据**：

- **反模式**：React 天然不会重新渲染已卸载的 Fiber 节点，即使外部存储监听泄漏、持续派发回调，已卸载组件也不会再次调用组件函数，导致测试虚假通过。
- **有效验证模式**：
  1. 通过 `instrumentControllerSubscriptions(controller)` 观测控制器公开的 `subscribe`、`subscribeSlot`、`subscribeDrop` 方法。
  2. 验证 React 组件卸载时，`useSyncExternalStore` 严格执行了全部清理函数（`cleanupsCalled` 计数递增）。
  3. 卸载后对控制器触发手势与动画事件，断言已注销的订阅**没有收到任何回调派发**（`leakedDispatchesAfterUnmount === 0`）。
  4. 验证控制器公开订阅接口在独立调用取消函数后，不再接收后续通知派发。
  5. 必须能通过临时的“取消订阅 no-op 变异”（注释掉 `delete listener`）证明测试必然变红。

## 5. 拖拽卸载生命周期与责任收敛 (S4)

在 S4 阶段，已对拖拽卸载生命周期缺陷完成彻底修复与责任收敛：

1. **卡片 Pending 阶段卸载计时器收敛**：
   卡片在长按判定中（触屏 220ms / 鼠标 260ms）若被卸载，`binding.onUnmount` 调用 `controller.unregisterCard(laneId, taskId)`，由控制器内部统一清除挂起的 `pendingTimer` 与 `pendingOnPress`，推进时间不再激活拖拽、不触发点击、不产生落位提交。
2. **非活动卡片卸载隔离**：
   注销其他非活动卡片严格隔离，不取消当前正在进行的活动拖拽手势。
3. **Hook/看板卸载与异步资源收敛**：
   `useKanbanDrag` 卸载时通过统一生命周期信号调用 `controller.teardown()`，取消内部挂起的定时器、中止未完成动画的落位，延迟回调不再通知废弃订阅、不再启动新保存。
4. **幂等落位与在途保存隔离**：
   落位提交与中止完全幂等，迟到/重复的完成信号不产生新提交；已发出的在途保存基于 `lifecycleEpoch` 隔离，其异步完成严禁复活旧会话状态或污染新会话。
5. **React StrictMode 兼容性**：
   控制器在 teardown 后保持可复用就绪状态，无死锁标志，完美支持 React StrictMode 双重生命周期（setup -> cleanup -> setup）及组件重新挂载。
6. **架构收敛边界**：
   前期讨论的另一候选方案“KanbanDragOverlay 接口重构”暂不实施，避免推测性重构。既有几何排序、避让算法与 ADR-0001/0002 决策完全保持不变。
