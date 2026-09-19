# Paseo Kanban 架构设计文档

本文档详细分析 Paseo Kanban 插件的系统架构、分层设计、核心状态机、拖拽物理微交互与并发控制机制。

交互式架构可视化见配套交付工件：
- 架构规格源：`docs/architecture/paseo-kanban.architecture.json`
- 交互式架构图：`docs/architecture/paseo-kanban.architecture.html`（双击或在浏览器中打开，支持主题切换、缩放平移、端到端链路追踪及 5 个聚焦视角导航）。

---

## 1. 架构总览与核心设计哲学

Paseo Kanban 作为运行于 Paseo 原生客户端宿主环境的受信任本地插件，旨在提供极简、直观、高响应度的任务看板工作区。其架构建立在以下四项核心设计哲学之上：

1. **零本地原生编译依赖（Zero Native Modules Overhead）**：
   - 严禁引入依赖本地 C++ / iOS / Android 平台编译链接的原生动效库（如 Reanimated 或 Gesture Handler 原生绑定）；
   - 依托 React Native 官方内置的 `Animated` 引擎与 Flexbox 布局流，在纯 JS / TS 层面实现达到原生级 60fps 的动态避让（Dynamic Drop Spacer）与释放飞入吸附微交互。

2. **单一真实源与无冗余次序建模（Implicit Array Ordering）**：
   - 任务在看板泳道内的排序完全采用 `board.tasks` 的隐式原生数组下标表达；
   - 坚决不向持久化数据中注入浮点型 `order` 或序列 `rank` 字段，彻底根绝高频调整引起的浮点精度耗尽与全量次序重排雪崩，天然保持 Schema 向前与向后兼容。

3. **事务基准锁定与保守并发（Transaction Baseline Locking & Pessimistic Concurrency）**：
   - 用户触发拖拽抓起或打开编辑弹窗的瞬间，系统即刻捕获当前时点的看板快照（`baseBoard`）、版本号（`baseRevision`）与项目筛选状态，锁定为不可变的事务基准；
   - 严格遵循宿主乐观版本校验协议 `save(board, revision)`；当外部产生并发冲突时，拒绝自动模糊合并与盲目覆盖，保留本地草稿并引导用户主动刷新。

4. **响应式解耦与请求乱序防护（Order-Controlled Reactive Pipeline）**：
   - 项目工作区订阅采用带序号防护的控制器（`fetchProjectsWithOrderControl`），单调递增请求 ID 杜绝慢请求以旧盖新；
   - 即使外部项目服务发生临时故障或重命名，看板核心数据读写与正在进行的拖拽/编辑事务完全不受影响。

---

## 2. 系统分层与模块拓扑

系统自上而下严格划分为四层，组件间职责正交、单向依赖：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Paseo Host Runtime (宿主平台环境)                    │
│   [paseo-host] ──> [projects-service] ──> [settings-service]           │
└───────┬──────────────────────┬───────────────────────┬─────────────────┘
        │                      │                       │
        ▼ (引导加载)           ▼ (list/subscribe)      ▼ (useSettings/save)
┌──────────────────────┬───────────────────────────────┴─────────────────┐
│                      │  Client Layer (客户端交互与响应式接入)           │
│  [plugin-entry]      │  [reactive-projects] (useProjects 乱序防护)     │
│         │            │           │                                     │
│         ▼            │           ▼                                     │
│  [plugin-surface] ───┼───> [interaction-cards] (KanbanLane / Card)    │
│  (KanbanBoardView)   │           │                                     │
│         │            │           ▼                                     │
│         │            │     [drag-controller] (KanbanDragController)    │
│         │            │           │                    │                │
│         │            │           ▼                    ▼                │
│         │            │     [drag-overlay]        (落位提交)            │
└─────────┼────────────┴────────────────────────────────┼────────────────┘
          │                                             │
          ▼ (开启弹窗事务)                              │
┌───────────────────────────────────────────────────────┼────────────────┐
│   Transaction & Concurrency Layer (事务与并发控制)   │                │
│   [session-manager] (kanban-session.ts: Task/Lane Session, executeReorder)│
└──────────────────────────────┬────────────────────────┴────────────────┘
                               │
                               ▼ (纯函数状态转换)
┌────────────────────────────────────────────────────────────────────────┐
│   Domain & State Engine (纯领域模型与排序状态机: shared/kanban.ts)    │
│   [domain-model] (Zod Schema、reorderTask 相对锚点插值与自愈 No-Op)     │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 模块映射一览

| 模块名 | 对应源码文件 | 职责定位 | 关键技术实现 |
|---|---|---|---|
| **Paseo 宿主内核** | `@getpaseo/plugin` | 运行时扩展底座 | 提供受信任沙箱、`PluginClientContext` 与 `PluginServerContext` |
| **项目管理服务** | `paseo.projects` | 宿主多项目元数据 | `list()` 获取工作区项目、`subscribe()` 广播工程变更 |
| **设置存储服务** | `paseo.settings` | 宿主持久化键值存储 | `useSettings(schema)` 订阅、`save(data, revision)` 乐观并发保存 |
| **插件引导入口** | `index.client.tsx` / `index.server.ts` | 扩展点注册声明 | 注册 `kanban` surface 视图、侧边栏导航入口与 Server 端设置契约 |
| **响应式项目总线** | `client/use-projects.ts` | 项目流聚合与乱序拦截 | 单调递增 `latestRequestId` 防乱序、卸载自注销、名称快速查找表 |
| **看板主工作区** | `client/kanban-board.tsx` | 视图编排与全局状态 | 响应式筛选管理、泳道水平滚动容器、并发冲突横幅、弹窗生命周期装配 |
| **泳道与卡片视图** | `client/kanban-lane.tsx` / `client/kanban-card.tsx` | 视图元素与几何上报 | 卡片 PanResponder 绑定、视口/泳道/卡片绝对坐标测量、动态展开占位槽 |
| **拖拽手势控制器** | `client/kanban-drag.ts` | 交互编排与物理引擎 | 桌面/触屏手势分流、8px 迟滞死区命中测试、左右 48px 边缘自适应自动滚动 |
| **悬浮吸附渲染层** | `client/kanban-overlay.tsx` | 顶层动效表现通道 | 突破父容器裁剪（`overflow: hidden`）、`Animated.spring` 释放飞入目标占位槽 |
| **会话事务管理器** | `client/kanban-session.ts` | 事务基准与草稿隔离 | 锁定打开时刻的 `baseBoard` 与 `baseRevision`，维护独立草稿并原子提交 |
| **纯领域模型引擎** | `shared/kanban.ts` | 核心领域状态机 | Zod 强校验、引用一致性检查、`reorderTask` 纯函数算法 |

---

## 3. 核心机制深度剖析

### 3.1 拖拽全生命周期与双模手势分流

为适配桌面（鼠标）与移动端（触屏）截然不同的交互习惯，手势分流在 `KanbanDragController` 与 `KanbanCard` 中实现了统一且边界严格的状态分流机制：

```
[用户按下卡片]
     │
     ├── 是否点击左侧专属拖拽手柄？
     │      ├─ 是 ──> [立即抓起拖拽] (置位互斥锁 dragLock=true, 展开占位槽)
     │      └─ 否 ──> 开启微位移监测与长按定时器
     │
     ▼ (卡片主体事件流)
   桌面端 (Mouse):
     ├─ 移动位移 < 5px 释放 ──> [识别为轻点点击] ──> 打开任务详情编辑弹窗
     └─ 移动位移 >= 5px ──> [立即升级为拖拽] ──> 激活手势互斥锁，开始实时命中推导
   触屏端 (Touch):
     ├─ 220ms 内移动位移 >= 5px ──> [判定为列表滚动] ──> 取消拖拽意图，让渡给 ScrollView
     ├─ 220ms 内保持静止 ──> [触发长按抓起] ──> 震动反馈、抓取卡片、激活互斥锁
     └─ < 220ms 且无位移松手 ──> [识别为轻点] ──> 打开任务详情编辑弹窗
```

- **手势互斥锁（Lifecycle Mutex）**：一旦拖拽被激活，全局 `dragLock` 立即锁定，彻底屏蔽卡片底层的 `onPress` 冒泡；在落位飞入动画完全执行完毕后，延迟 150ms 解锁，坚决杜绝松手时的误触弹窗。

### 3.2 几何命中测试与 8px 迟滞防抖算法

为了在复杂的嵌套滚动（看板横向滚动、泳道纵向滚动）中精确判断指针落点，控制器维护了实时的坐标矩阵变换模型：
$$\text{ContentX} = \text{PointerX} - \text{ContainerX} + \text{ScrollX}$$
$$\text{ContentY} = \text{PointerY} - \text{ContainerY}$$

在计算泳道内垂直插入索引时，传统按卡片中线粗暴切分在临界位置极易因卡片高度变化或指针微颤引发“占位槽反复上下跳动”现象。系统引入 **8px 迟滞死区（Hysteresis Buffer）**：
- 设相邻卡片间阈值分界为 $Y_{threshold}$；
- 当指针处于 $[Y_{threshold} - 8\text{px}, Y_{threshold} + 8\text{px}]$ 缓冲带内时，算法优先保持上一帧判定的目标索引，只有指针明确越过临界边界才触发索引跳变；
- 占位槽展开动效（0 -> 实际卡片高度）采用纯粹的视觉占位，不反向干扰已计算出的卡片逻辑几何基准。

### 3.3 边缘自适应平滑水平滚动

跨屏远端拖拽时，当指针靠近视口左右边缘 48px 区间内：
- 速度矢量 $V \in [-1, 0)$ 或 $(0, 1]$：
  $$V_{left} = \frac{\text{RelX} - 48}{48}, \quad V_{right} = \frac{\text{RelX} - (\text{Width} - 48)}{48}$$
- 在 16ms 定时渲染帧驱动下，以 $V \times 14\text{px}$ 的动态步长触发宿主外层滚动容器平滑推移，极大改善了超宽多泳道看板的拖拽可用性。

### 3.4 释放吸附与操作幂等性（Drop Convergence）

用户释放手势时，流程并不直接闪烁切换数据，而是进入平滑收敛阶段：
1. **快照计算与唯一操作锁定**：生成唯一 `operationId`，锁定源坐标、目标占位槽矩形 `toX / toY`；
2. **三轨并行动画**：
   - `Animated.spring`：将悬浮卡片平滑投递至目标占位槽位置（摩擦力 8，张力 50）；
   - `Animated.timing`：将抓起时的微倾斜角度（rotate: 1 -> 0）与放大缩放（scale: 1.03 -> 1.0）复位；
3. **原子上报与防重保护**：仅当动画 `result.finished` 触发时，携带 `operationId` 请求 `reportDropComplete`，若会话中途被取消或被新会话接管，旧操作直接抛弃（No-Op），杜绝重复提交。

---

## 4. 排序算法与领域规则 (ADR-0001 & ADR-0002)

看板所有任务流转均汇聚到纯函数 `reorderTask` 中执行。该函数保证在任意非法入参或异常边界下具备绝对的数学确定性与不可变性。

### 4.1 可见锚点对齐（Visible Anchor Alignment）
在全局全量数据中夹杂着多项目任务。当用户开启项目筛选（如“项目 A”）时：
- 仅属于“项目 A”的任务可见；
- 拖拽卡片在可见视图中释放于索引 $K$ 处；
- 算法以目标泳道中可见的第 $K$ 个任务为基准锚点（Reference Task），在原始完整数组中定位该锚点的真实全局索引，执行原地前置/后置切片插入；
- 完美保持未筛选出的其他项目任务在同泳道内的相对排布顺序不被扰乱。

### 4.2 无可见锚点相对追加规则（No-Anchor Cross-lane Append）
- **场景**：跨泳道将任务移动到目标泳道，但目标泳道在当前筛选下没有任何可见任务，却包含属于其他项目的隐藏任务。
- **规则**：严禁以首位置或随机位置插入；系统将该任务**相对追加至目标泳道现有全部隐藏任务的最末端**，保障隐藏业务流程不受越级污染。

### 4.3 同泳道自身唯一可见原位不写入（Self-Only In-Place No-Op）
- **场景**：项目筛选下，某泳道仅有被拖拽卡片自身可见，用户在同泳道内拖拽并在唯一槽位释放。
- **规则**：此操作判定为原位操作（No-Op），`executeTaskReorder` 返回 `{ success: true, unchanged: true }`，直接跳过持久化保存，不向宿主发出多余的存储写入或网络请求。

---

## 5. 并发控制与会话基准锁定 (Transaction Baseline Locking)

### 5.1 乐观并发冲突模型

Paseo 宿主存储采用版本控制（`revision`）：
```typescript
interface HostSettings {
  values: KanbanBoard;
  revision: string;
  save: (board: KanbanBoard, revision: string) => Promise<boolean>;
}
```
当保存时传入的 `revision` 与服务端当前版本不匹配时，`save()` 返回 `false` 并中止写入。

### 5.2 事务基准锁定执行流程

```
[用户打开编辑弹窗 / 激活拖拽]
     │
     ▼
[openTaskSession / openLaneSession]
  ├─ 冻结 baseBoard = currentBoard
  ├─ 冻结 baseRevision = currentRevision
  └─ 初始化独立内存可变草稿 Draft (与外部状态完全隔离)
     │
     ├─ 用户持续修改标题、描述、增删子步骤...
     │    └─ 触发本地快照通知 UI 重新渲染弹窗，不污染主看板数据
     │
     ▼
[用户点击保存 / 拖拽释放]
     │
     ▼
[执行原子提交]
     ├─ 调用领域纯函数转换得到 nextBoard
     ├─ 发起 save(nextBoard, baseRevision)
     │
     ├── 成功 (return true) ──> 关闭弹窗 / 解锁拖拽，等待宿主响应式推送新数据
     │
     └── 失败 (return false / 抛出异常) ──>
            ├─ 严禁静默覆盖！
            ├─ 弹窗内保留用户已录入的全部草稿与子步骤
            ├─ 设置会话 error 状态，界面醒目提示“数据已被其他会话修改”
            └─ 主看板显示刷新横幅，引导用户刷新后基于最新版本重新提交
```

---

## 6. 交互式架构图工件说明

本目录下的两个交付工件遵循 Archify Showcase 级标准生成：

1. **`paseo-kanban.architecture.json`**：
   - 包含 11 个关键组件（3 个宿主外部系统、6 个客户端交互/动效节点、2 个事务与纯领域核心节点）；
   - 包含 12 条无交叉、无遮挡的正交语义连线；
   - 具备 5 个精细化的 Guided Views 视角。

2. **`paseo-kanban.architecture.html`**：
   - 自包含单文件交互式 HTML 视界，内嵌深浅色主题切换、矢量平移缩放、链路高亮追踪与视角演示模式；
   - 严格通过自动化真实浏览器检测（1440×900、1600×1000、1920×1080、2048×1320 全部无溢出，字号可读性通过）。
