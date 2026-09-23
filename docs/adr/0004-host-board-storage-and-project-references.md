# 宿主存储整板与项目引用

看板以一份 Paseo host-scope 设置存储泳道和任务；任务仅保存 Paseo 项目 ID，项目数据由 Paseo 拥有。项目筛选是对同一看板的视图，不创建各项目独立看板。这样跨项目排序、泳道管理共享一份数据，避免多份看板之间的状态同步；代价是不同项目的编辑共用整板版本，写入冲突由宿主的 `save(board, revision)` 乐观校验处理。项目暂时不可读取或被删除时，任务关联仍保留原 ID，展示可回退为该 ID。

实现入口：`shared/kanban.ts` 的 `kanbanSettings`、`index.server.ts` 的设置注册、`client/kanban-board.tsx` 的订阅与保存。排序及冲突时的交互规则见 [ADR-0002](./0002-task-reordering-and-drag-lifecycle-convergence.md)。
