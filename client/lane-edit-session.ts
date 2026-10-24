import {
  addLane,
  updateLane,
  deleteLane,
  reorderLanes,
  LaneTitleError,
  type KanbanBoard,
} from "../shared/kanban";
import type { SaveFn } from "./kanban-session";
import type { TranslationKey } from "./i18n";

export interface LaneBoardSnapshot {
  board: KanbanBoard;
  revision: string;
}

type NameEditor = { kind: "add" } | { kind: "rename"; id: string };
type Command =
  | { kind: "add"; id: string; title: string }
  | { kind: "rename"; id: string; title: string }
  | { kind: "delete"; id: string; confirmed: boolean }
  | { kind: "order"; ids: string[] };

interface Options {
  initial: LaneBoardSnapshot;
  current: () => LaneBoardSnapshot | null;
  load: () => Promise<LaneBoardSnapshot>;
  save: SaveFn;
  translate: (key: TranslationKey) => string;
  notify: (key: TranslationKey, success: boolean) => void;
}

export interface LaneEditSnapshot {
  lanes: KanbanBoard["lanes"];
  order: string[];
  dirty: boolean;
  editing: NameEditor | null;
  title: string;
  deleteId: string | null;
  isSaving: boolean;
  error: string | null;
}

/** Owns a management draft and any submitted operation, independently of its view. */
export function openLaneEditSession(options: Options) {
  let snapshot: LaneEditSnapshot = {
    lanes: options.initial.board.lanes,
    order: options.initial.board.lanes.map((lane) => lane.id),
    dirty: false,
    editing: null,
    title: "",
    deleteId: null,
    isSaving: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<LaneEditSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    snapshot.dirty = snapshot.order.some(
      (id, index) => snapshot.lanes[index]?.id !== id,
    );
    listeners.forEach((listener) => listener());
  };
  const reset = (board: KanbanBoard) =>
    update({
      lanes: board.lanes,
      order: board.lanes.map((lane) => lane.id),
      editing: null,
      title: "",
      deleteId: null,
      error: null,
    });
  const available = () => !snapshot.isSaving;
  const canEdit = () =>
    available() && !snapshot.dirty && !snapshot.editing && !snapshot.deleteId;
  const failure = (key: TranslationKey = "notification.laneSaveFailed") =>
    new Error(options.translate(key));

  const run = async (command: Command) => {
    if (!available()) return;
    update({ isSaving: true });
    try {
      let latest = options.current();
      let failedRevision: string | undefined;
      for (let attempt = 0; ; attempt++) {
        if (!latest) throw failure();
        if (!sameLanes(snapshot.lanes, latest.board.lanes))
          throw failure("laneManagement.conflict");
        if (failedRevision === latest.revision) throw failure();
        if (
          command.kind === "delete" &&
          !command.confirmed &&
          latest.board.tasks.some(
            (task) => !task.completed && task.laneId === command.id,
          )
        ) {
          // A closed view cannot request new destructive authorization.
          if (listeners.size === 0) throw failure();
          update({ deleteId: command.id });
          return;
        }
        const next =
          command.kind === "add"
            ? addLane(latest.board, command)
            : command.kind === "rename"
              ? updateLane(latest.board, command.id, command)
              : command.kind === "delete"
                ? deleteLane(latest.board, command.id)
                : reorderLanes(latest.board, command.ids);
        const unchanged =
          command.kind === "rename" &&
          latest.board.lanes.find((lane) => lane.id === command.id)?.title ===
            command.title.trim();
        if (unchanged || (await options.save(next, latest.revision))) {
          reset(next);
          if (!unchanged)
            options.notify(
              command.kind === "add"
                ? "notification.laneCreated"
                : command.kind === "rename"
                  ? "notification.laneRenamed"
                  : command.kind === "delete"
                    ? "notification.laneDeleted"
                    : "laneManagement.orderSaved",
              true,
            );
          return;
        }
        if (attempt >= 2) throw failure();
        failedRevision = latest.revision;
        latest = await options.load();
      }
    } catch (reason) {
      if (reason instanceof LaneTitleError) {
        update({
          error: options.translate(
            reason.reason === "empty"
              ? "laneManagement.empty"
              : "laneManagement.duplicate",
          ),
        });
      } else {
        update({
          error:
            reason instanceof Error
              ? reason.message
              : options.translate("notification.laneSaveFailed"),
        });
        options.notify(
          command.kind === "delete"
            ? "notification.laneDeleteFailed"
            : "notification.laneSaveFailed",
          false,
        );
      }
    } finally {
      update({ isSaving: false });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beginAdd() {
      if (canEdit())
        update({ editing: { kind: "add" }, title: "", error: null });
    },
    beginRename(id: string) {
      const lane = snapshot.lanes.find((lane) => lane.id === id);
      if (canEdit() && lane)
        update({
          editing: { kind: "rename", id },
          title: lane.title,
          error: null,
        });
    },
    setTitle(title: string) {
      if (available() && snapshot.editing) update({ title });
    },
    cancelName() {
      if (available()) update({ editing: null, title: "", error: null });
    },
    saveName() {
      if (!snapshot.editing) return;
      return run(
        snapshot.editing.kind === "add"
          ? {
              kind: "add",
              id: `lane_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
              title: snapshot.title,
            }
          : { kind: "rename", id: snapshot.editing.id, title: snapshot.title },
      );
    },
    previewOrder(ids: string[]) {
      if (available() && !snapshot.editing && !snapshot.deleteId) {
        // Keep completion identity, membership and validation in the domain module.
        const board = reorderLanes(
          { lanes: snapshot.lanes, tasks: [] },
          ids.slice(0, -1),
        );
        update({ order: board.lanes.map((lane) => lane.id) });
      }
    },
    move(index: number, delta: number) {
      if (!available() || snapshot.editing || snapshot.deleteId) return;
      const order = [...snapshot.order];
      const target = index + delta;
      if (
        index < 0 ||
        target < 0 ||
        index >= order.length - 1 ||
        target >= order.length - 1
      )
        return;
      [order[index], order[target]] = [order[target], order[index]];
      update({ order });
    },
    restoreOrder() {
      if (available()) update({ order: snapshot.lanes.map((lane) => lane.id) });
    },
    saveOrder() {
      if (snapshot.dirty && !snapshot.editing && !snapshot.deleteId)
        return run({ kind: "order", ids: snapshot.order.slice(0, -1) });
    },
    remove(id: string) {
      if (canEdit()) return run({ kind: "delete", id, confirmed: false });
    },
    confirmDelete() {
      if (snapshot.deleteId)
        return run({ kind: "delete", id: snapshot.deleteId, confirmed: true });
    },
    cancelDelete() {
      if (available()) update({ deleteId: null });
    },
    async reload() {
      if (!available()) return;
      update({ isSaving: true });
      try {
        reset((await options.load()).board);
      } catch (reason) {
        update({
          error:
            reason instanceof Error
              ? reason.message
              : options.translate("notification.laneSaveFailed"),
        });
        options.notify("notification.laneSaveFailed", false);
      } finally {
        update({ isSaving: false });
      }
    },
  };
}

export type LaneEditSession = ReturnType<typeof openLaneEditSession>;

function sameLanes(left: KanbanBoard["lanes"], right: KanbanBoard["lanes"]) {
  return (
    left.length === right.length &&
    left.every((lane, index) => {
      const other = right[index];
      return (
        lane.id === other.id &&
        lane.title === other.title &&
        lane.isCompletionLane === other.isCompletionLane
      );
    })
  );
}
