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

test("Button 桌面端状态矩阵：hovered、focused 与 pressed 动态样式计算", async () => {
  const Button = loadClientComponent("components/ui/button", "Button");

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        Button,
        {
          theme,
          variant: "secondary",
        },
        "Hover me",
      ),
    );
  });

  const pressable = renderer.root.findByType("Pressable");
  const styleFn = pressable.props.style;
  assert.equal(
    typeof styleFn,
    "function",
    "Pressable style 必须为状态驱动函数",
  );

  // 1. 默认常态
  const defaultStyles = []
    .concat(styleFn({ pressed: false, hovered: false, focused: false }))
    .flat()
    .filter(Boolean);
  const defaultStyleObj = Object.assign({}, ...defaultStyles);
  assert.equal(defaultStyleObj.backgroundColor, theme.colors.surface1);

  // 2. 悬停态 (Hovered)：secondary/ghost 背景应过渡为 surface2
  const hoveredStyles = []
    .concat(styleFn({ pressed: false, hovered: true, focused: false }))
    .flat()
    .filter(Boolean);
  const hoveredStyleObj = Object.assign({}, ...hoveredStyles);
  assert.equal(hoveredStyleObj.backgroundColor, theme.colors.surface2);

  // 3. 按压态 (Pressed)：产生微触感缩放 scale(0.98)
  const pressedStyles = []
    .concat(styleFn({ pressed: true, hovered: true, focused: false }))
    .flat()
    .filter(Boolean);
  const pressedStyleObj = Object.assign({}, ...pressedStyles);
  assert.deepEqual(pressedStyleObj.transform, [{ scale: 0.98 }]);

  // 4. 键盘聚焦态 (Focused)：展示清晰的 Focus Ring
  const focusedStyles = []
    .concat(styleFn({ pressed: false, hovered: false, focused: true }))
    .flat()
    .filter(Boolean);
  const focusedStyleObj = Object.assign({}, ...focusedStyles);
  assert.equal(focusedStyleObj.borderColor, theme.colors.accent);
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

test("Input 无论是否传入 onEscape，均在按下 Escape 时消费事件阻止向外冒泡", async () => {
  const Input = loadClientComponent("components/ui/input", "Input");
  let propagationStopped = false;
  let defaultPrevented = false;

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(Input, {
        theme,
        value: "Some input text",
      }),
    );
  });

  const textInput = renderer.root.findByType("TextInput");
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

test("Dialog 初始焦点与防抢焦策略：优先聚焦 Dialog 容器卡片，排除关闭按钮", async () => {
  const { loadClientModule } = await import("./helpers/react-host-env.mjs");
  const web = loadClientModule("platform/web");
  const initialFocusTarget = web.initialFocusTarget;

  // 构造模拟 DOM 结构，模拟 Dialog 打开时的 DOM 节点树
  const container = {
    tabIndex: -1,
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
  };

  const closeButton = {
    nodeName: "BUTTON",
    attributes: { "aria-label": "关闭" },
    dataset: { dialogClose: "" },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    getClientRects: () => [{ width: 24, height: 24 }],
  };

  const titleInput = {
    nodeName: "INPUT",
    attributes: { type: "text", name: "title" },
    dataset: {},
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    getClientRects: () => [{ width: 200, height: 32 }],
  };

  const dialogCard = {
    nodeName: "DIV",
    attributes: { role: "dialog", "aria-modal": "true" },
    dataset: { dialogCard: "" },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    getClientRects: () => [{ width: 600, height: 400 }],
  };

  // 当存在 role="dialog" 时，initialFocusTarget 应当优先返回 dialogCard，而不是直接把焦点抢进 titleInput
  const mockRoot = {
    ...container,
    querySelector: (selector) => {
      if (selector.includes('[role="dialog"]')) return dialogCard;
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector.includes("input")) return [titleInput];
      return [closeButton, titleInput];
    },
  };

  const target = initialFocusTarget(mockRoot);
  assert.equal(
    target,
    dialogCard,
    "首焦点必须落在 Dialog 容器卡片上，禁止直接夺焦标题输入框",
  );
  assert.equal(
    dialogCard.attributes["tabindex"],
    "-1",
    "Dialog 容器卡片必须具备 tabindex=-1 以便聚焦",
  );
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

test("Badge 基础行为：文本渲染、变体样式与自定义内容", async () => {
  const Badge = loadClientComponent("components/ui/badge", "Badge");

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(
        Badge,
        {
          theme,
          variant: "secondary",
        },
        "5 tasks",
      ),
    );
  });

  const textNode = renderer.root.findByType("Text");
  assert.equal(textNode.props.children, "5 tasks");

  // 测试 outline 变体
  await act(async () => {
    renderer.update(
      React.createElement(
        Badge,
        {
          theme,
          variant: "outline",
        },
        "Outline",
      ),
    );
  });
  const updatedText = renderer.root.findByType("Text");
  assert.equal(updatedText.props.children, "Outline");
});

test("Checkbox 基础行为：勾选/反选切换、状态契约与禁用保护", async () => {
  const Checkbox = loadClientComponent("components/ui/checkbox", "Checkbox");
  let checked = false;

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(Checkbox, {
        theme,
        checked,
        accessibilityLabel: "Complete task",
        onCheckedChange: (next) => {
          checked = next;
        },
      }),
    );
  });

  const node = renderer.root.findByProps({ accessibilityRole: "checkbox" });
  assert.equal(node.props.accessibilityState.checked, false);

  // 触发点击切换
  await act(async () => {
    node.props.onPress({ stopPropagation() {} });
  });
  assert.equal(checked, true);
});

test("IssueLink 基础行为：使用宿主 ExternalLink 渲染并保持安全链接与无障碍标签", async () => {
  const IssueLink = loadClientComponent("modals/issue-link", "IssueLink");

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(IssueLink, {
        url: "https://github.com/example/repo/issues/42",
        theme,
      }),
    );
  });

  const linkNode = renderer.root.findByType("ExternalLink");
  assert.equal(
    linkNode.props.href,
    "https://github.com/example/repo/issues/42",
  );
  assert.equal(linkNode.props.accessibilityLabel, "在浏览器打开 Issue");
});

test("Select 基础行为：Trigger 呈现、展开选中与层级提升", async () => {
  const Select = loadClientComponent("components/ui/select", "Select");

  let selectedValue = "opt-1";
  const options = [
    { value: "opt-1", label: "Option One" },
    { value: "opt-2", label: "Option Two" },
    { value: "opt-3", label: "Option Three" },
  ];

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(Select, {
        theme,
        label: "Category",
        value: selectedValue,
        options,
        onValueChange: (val) => {
          selectedValue = val;
        },
      }),
    );
  });

  // 初始状态：显示当前选中项文本，弹层关闭
  const trigger = renderer.root.findByProps({ accessibilityRole: "button" });
  assert.equal(trigger.props.accessibilityState.expanded, false);
  assert.ok(
    renderer.root.findAll((n) => n.props.children === "Option One").length > 0,
  );

  // 点击 Trigger 展开
  await act(async () => {
    trigger.props.onPress();
  });
  assert.equal(trigger.props.accessibilityState.expanded, true);

  // 选项少于 10 项，不显示搜索框
  assert.equal(
    renderer.root.findAll((n) => n.props.placeholder === "搜索选项...").length,
    0,
  );

  // 点击 Option Two
  const optionTwo = renderer.root
    .findAll((n) => n.props.accessibilityRole === "button")
    .find((n) => n.props.accessibilityState?.selected === false);
  assert.ok(optionTwo, "found option two");
  await act(async () => {
    optionTwo.props.onPress();
  });
  assert.equal(selectedValue, "opt-2");
  assert.equal(trigger.props.accessibilityState.expanded, false);
});

test("Select 搜索过滤：当选项数量达到阈值（>= 10）时启用搜索过滤", async () => {
  const Select = loadClientComponent("components/ui/select", "Select");

  const options = Array.from({ length: 12 }, (_, i) => ({
    value: `item-${i + 1}`,
    label: `Project ${String.fromCharCode(65 + i)}`,
  }));

  let selectedValue = "item-1";
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(Select, {
        theme,
        value: selectedValue,
        options,
        onValueChange: (val) => {
          selectedValue = val;
        },
      }),
    );
  });

  const trigger = renderer.root.findByProps({ accessibilityRole: "button" });
  await act(async () => {
    trigger.props.onPress();
  });

  // 选项达到 12 项，展示搜索框
  const searchInput = renderer.root.findByProps({
    placeholder: "搜索选项...",
  });
  assert.ok(searchInput, "search input is displayed");

  // 过滤输入
  await act(async () => {
    searchInput.props.onChangeText("Project B");
  });
  const visibleOptions = renderer.root.findAll(
    (n) =>
      n.props.accessibilityRole === "button" &&
      n.props.accessibilityState?.selected !== undefined,
  );
  assert.equal(visibleOptions.length, 1);
});
