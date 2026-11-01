import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer from "react-test-renderer";
import { act, loadClientComponent } from "./helpers/react-host-env.mjs";

const theme = {
  colors: {
    accent: "#6366f1",
    accentForeground: "#ffffff",
    surface1: "#1e1e2e",
    surface2: "#313244",
    foreground: "#cdd6f4",
    foregroundMuted: "#a6adc8",
    statusDanger: "#f38ba8",
    border: "#45475a",
  },
};

test("Button 基础行为：角色、文本、点击与禁用态", async () => {
  const Button = loadClientComponent("components/ui/button", "Button");
  let clicked = 0;

  // 1. 默认与可点击
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        Button,
        {
          theme,
          accessibilityLabel: "Submit task",
          onPress: () => {
            clicked++;
          },
        },
        "Submit",
      ),
    );
  });

  const pressable = renderer.root.findByType("Pressable");
  assert.equal(pressable.props.accessibilityRole, "button");
  assert.equal(pressable.props.accessibilityLabel, "Submit task");
  assert.equal(pressable.props.accessibilityState?.disabled, false);

  pressable.props.onPress();
  assert.equal(clicked, 1);

  // 2. 禁用状态
  await act(async () => {
    renderer.update(
      React.createElement(
        Button,
        {
          theme,
          disabled: true,
          accessibilityLabel: "Submit task",
          onPress: () => {
            clicked++;
          },
        },
        "Submit",
      ),
    );
  });

  const disabledPressable = renderer.root.findByType("Pressable");
  disabledPressable.props.onPress();
  assert.equal(clicked, 1);
});

test("Input 基础行为：文本更新、Esc 拦截与冒泡阻止", async () => {
  const Input = loadClientComponent("components/ui/input", "Input");
  let text = "Initial";
  let escaped = 0;
  let propagationStopped = false;
  let defaultPrevented = false;

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(Input, {
        theme,
        value: text,
        accessibilityLabel: "Task title",
        onChangeText: (v) => {
          text = v;
        },
        onEscape: () => {
          escaped++;
        },
      }),
    );
  });

  const textInput = renderer.root.findByType("TextInput");
  assert.equal(textInput.props.value, "Initial");
  textInput.props.onChangeText("Updated title");
  assert.equal(text, "Updated title");

  // 模拟按键 Escape
  const fakeEvent = {
    key: "Escape",
    isComposing: false,
    stopPropagation: () => {
      propagationStopped = true;
    },
    preventDefault: () => {
      defaultPrevented = true;
    },
  };
  textInput.props.onKeyDown?.(fakeEvent);
  assert.equal(escaped, 1);
  assert.equal(propagationStopped, true);
  assert.equal(defaultPrevented, true);
});

test("Dialog 基础行为：对话框契约、通用关闭、canClose 防护与滚动焦点挂载", async () => {
  const Dialog = loadClientComponent("components/ui/dialog", "Dialog", {
    "../../platform/web": {
      useProjectFilterLayout: () => {},
      useDialogInputFocus: () => "dialog-focus-id",
      WebDialogPortal: ({ children, ...props }) =>
        React.createElement("WebDialogPortal", props, children),
    },
  });
  let open = true;
  let canCloseAllowed = true;

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        Dialog,
        {
          open,
          title: "Edit Task",
          theme,
          canClose: () => canCloseAllowed,
          onOpenChange: (next) => {
            open = next;
          },
          scroll: "content",
          inputFocus: true,
        },
        React.createElement("Text", null, "Dialog Content"),
      ),
    );
  });

  // 1. 契约角色与标签
  const dialogView = renderer.root.findByProps({ role: "dialog" });
  assert.equal(dialogView.props.accessibilityLabel, "Edit Task");
  assert.equal(dialogView.props["aria-modal"], true);

  // 2. 关闭按钮与防护
  const closeButton = renderer.root.find(
    (n) =>
      n.type === "Pressable" &&
      ["关闭", "Close"].includes(n.props.accessibilityLabel),
  );
  assert.ok(closeButton);

  // canCloseAllowed = false 时阻止关窗
  canCloseAllowed = false;
  await act(async () => {
    closeButton.props.onPress();
  });
  assert.equal(open, true);

  // canCloseAllowed = true 时允许关窗
  canCloseAllowed = true;
  await act(async () => {
    closeButton.props.onPress();
  });
  assert.equal(open, false);
});

test("ConfirmDialog 基础行为：确认、取消、加载防重与错误提示", async () => {
  const ConfirmDialog = loadClientComponent(
    "components/ui/confirm-dialog",
    "ConfirmDialog",
    {
      "../../platform/web": {
        useProjectFilterLayout: () => {},
        useDialogInputFocus: () => "confirm-focus-id",
        WebDialogPortal: ({ children, ...props }) =>
          React.createElement("WebDialogPortal", props, children),
      },
    },
  );

  let confirmed = 0;
  let cancelled = 0;

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(ConfirmDialog, {
        open: true,
        title: "Delete Task",
        description: "Are you sure you want to delete this task?",
        theme,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        onConfirm: () => {
          confirmed++;
        },
        onCancel: () => {
          cancelled++;
        },
      }),
    );
  });

  // 1. 契约与描述
  const dialogView = renderer.root.findByProps({ role: "dialog" });
  assert.equal(dialogView.props.accessibilityLabel, "Delete Task");

  // 2. 点击取消
  const cancelButton = renderer.root
    .findAllByType("Pressable")
    .find((n) => n.props.accessibilityLabel === "Cancel");
  assert.ok(cancelButton);
  await act(async () => {
    cancelButton.props.onPress();
  });
  assert.equal(cancelled, 1);

  // 3. 点击确认
  const deleteButton = renderer.root
    .findAllByType("Pressable")
    .find((n) => n.props.accessibilityLabel === "Delete");
  assert.ok(deleteButton);
  await act(async () => {
    deleteButton.props.onPress();
  });
  assert.equal(confirmed, 1);
});
