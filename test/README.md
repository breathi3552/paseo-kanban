# 看板插件测试环境与编写指南

本目录包含 Paseo 看板插件的单元测试与集成测试套件。

## 1. 测试架构与调度机制

- **运行环境**：Node.js 原生 Test Runner（`node --experimental-strip-types --test "test/*.test.mjs"`）。
- **React 调度器**：采用 `react-test-renderer@19.1.0` 作为最小纯 JS In-Memory Reconciler 与 Scheduler，在 Node 环境中真实驱动 React 19.1 组件挂载、更新、`useSyncExternalStore` 订阅与卸载生命周期。
- **React Native 宿主替身**：宿主 UI 原语（`View`、`Text`、`Pressable`、`ScrollView`、`StyleSheet`、`PanResponder`、`Animated`）抽离于 `test/helpers/react-host-env.mjs`，保证全局 React 单实例运行。
- **错误日志**：只过滤 `react-test-renderer is deprecated` 提示；未捕获异常、React 警告与 `act(...)` 告警仍使测试失败。

## 2. 测试工具与验收范围

- React 19 已弃用 `react-test-renderer`（见 [React 官方说明](https://react.dev/warnings/react-test-renderer)）。本套件用它驱动 Node 中的 React 生命周期；升级 React 时需重新评估测试调度器。
- 测试中的 React Native 组件是宿主替身。真实布局、硬件手势及 Paseo 插件桥接按 [宿主验收指南](../docs/development.md#3-宿主手工验收指南-manual-host-acceptance-guide) 检查。

## 3. 可控时间规范（Mock Timers）

在涉及长按、轻点与手势互斥锁的测试中，必须使用 Node 原生 `t.mock.timers`，遵循以下核心规则：

1. **避免模拟 `setImmediate`（重要）**：
   ```javascript
   // 正确用法：显式指定被测业务所需的计时 API
   t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
   ```
   **原因**：React 19 的 `act(async () => ...)` 内部依赖原生 `setImmediate`（通过 `enqueueTask` / `recursivelyFlushAsyncActWork`）自流转并发任务队列。如果无参调用 `t.mock.timers.enable()`，Node 将连带模拟 `setImmediate`，导致等待异步 `act` 的任务被冻结在事件循环中造成命令无限挂起。
2. **时间阈值基准**：
   - 触屏长按抓起阈值：`220ms`（见 `KanbanDragController.handlePointerDown` 与 ADR-0001）。
   - 鼠标长按抓起阈值：`260ms`（见 `KanbanDragController.handlePointerDown`）。
   - 拖拽与落位后互斥锁释放缓冲：`60ms`（见 `client/kanban-drag.ts`）。
   - 推进时间须在 `act(() => { t.mock.timers.tick(ms); })` 中执行，确保状态变更在 act 作用域内刷新。

## 4. 外部存储订阅与卸载释放验证规范

测试 `useSyncExternalStore` 的订阅清理时，直接观测监听器和清理函数：

- 卸载后渲染次数不增加，无法单独证明监听器已注销；卸载的 React 节点本身就不再渲染。
- **有效验证模式**：
  1. 通过 `instrumentControllerSubscriptions(controller)` 观测控制器公开的 `subscribe`、`subscribeSlot`、`subscribeDrop` 方法。
  2. 验证卸载时调用全部清理函数（`cleanupsCalled` 计数递增）。
  3. 卸载后对控制器触发手势与动画事件，断言已注销的订阅**没有收到任何回调派发**（`leakedDispatchesAfterUnmount === 0`）。
  4. 验证控制器公开订阅接口在独立调用取消函数后，不再接收后续通知派发。
  5. 必须能通过临时的“取消订阅 no-op 变异”（注释掉 `delete listener`）证明测试必然变红。

## 5. 拖拽卸载生命周期与责任收敛 (S4)

拖拽控制器负责以下卸载与异步资源清理：

1. **卡片 Pending 阶段卸载计时器收敛**：
   卡片在长按判定中（触屏 220ms / 鼠标 260ms）若被卸载，`binding.onUnmount` 调用 `controller.unregisterCard(laneId, taskId)`，由控制器内部统一清除挂起的 `pendingTimer` 与 `pendingOnPress`，推进时间不再激活拖拽、不触发点击、不产生落位提交。
2. **非活动卡片卸载隔离**：
   注销非活动卡片时保持当前拖拽手势。
3. **Hook/看板卸载与异步资源收敛**：
   `useKanbanDrag` 卸载时通过统一生命周期信号调用 `controller.teardown()`，取消内部挂起的定时器、中止未完成动画的落位，延迟回调不再通知废弃订阅、不再启动新保存。
4. **幂等落位与在途保存隔离**：
   落位提交与中止按 `operationId` 幂等处理；`lifecycleEpoch` 隔离已发出的保存，防止迟到的结果更新旧会话。
5. **React StrictMode 兼容性**：
   控制器在 teardown 后可复用，测试覆盖 React StrictMode 的 setup → cleanup → setup 及组件重新挂载。
