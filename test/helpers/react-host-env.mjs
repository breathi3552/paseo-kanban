/**
 * React 19 Real Scheduler Test Environment & Host Stubs
 *
 * Notice on react-test-renderer deprecation in React 19:
 * React 19 has officially deprecated react-test-renderer (see https://react.dev/warnings/react-test-renderer).
 * In this repository, react-test-renderer@19.1.0 is utilized solely as a minimal pure-JavaScript
 * in-memory reconciler and scheduler to execute real React 19 mount, update, useSyncExternalStore
 * subscription, and unmount lifecycles in Node.js without requiring browser DOM or native compiled addons.
 *
 * Limitations & Future Upgrade Risk:
 * - This test environment is NOT real native rendering. React Native native layouts (Yoga flexbox layout calculation)
 *   and platform touch responder lifecycles are test doubles. Real host layout and gesture flows must be validated
 *   via end-to-end host plugin tests.
 * - Future React versions (React 20+) are expected to remove react-test-renderer entirely. Future migration will
 *   require adopting @testing-library/react (with a lightweight virtual DOM) or a dedicated host test renderer.
 *
 * Console Error Policy:
 * We do NOT swallow console.error globally. Only the specific known deprecation notice
 * ("react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer") is precisely filtered,
 * while all other console.error messages (including act(...) warnings, unhandled errors, and unexpected warnings)
 * are strictly preserved.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

// Configure React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Precisely intercept ONLY the known react-test-renderer deprecation warning
const originalConsoleError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("react-test-renderer is deprecated")
  ) {
    return;
  }
  originalConsoleError(...args);
};

const require = createRequire(import.meta.url);
export const React = require("react");
export const TestRenderer = require("react-test-renderer");
export const { act } = TestRenderer;

export class MockAnimatedValue {
  constructor(val = 0) {
    this._value = val;
  }
  setValue(val) {
    this._value = val;
  }
  interpolate(_config) {
    return "0deg";
  }
}

export class MockAnimatedValueXY {
  constructor(val = { x: 0, y: 0 }) {
    this.x = typeof val?.x === "number" ? val.x : 0;
    this.y = typeof val?.y === "number" ? val.y : 0;
  }
  setValue(val) {
    if (val) {
      if (typeof val.x === "number") this.x = val.x;
      if (typeof val.y === "number") this.y = val.y;
    }
  }
}

export const mockReactNative = {
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: {
    create: (styles) => styles,
    flatten: (styles) =>
      Array.isArray(styles) ? Object.assign({}, ...styles) : styles || {},
  },
  PanResponder: {
    create: (handlers) => ({ panHandlers: handlers }),
  },
  Animated: {
    Value: MockAnimatedValue,
    ValueXY: MockAnimatedValueXY,
    timing: (val, config) => ({
      start: (cb) => {
        if (config?.toValue !== undefined && val?.setValue) {
          val.setValue(config.toValue);
        }
        cb?.({ finished: true });
      },
    }),
    spring: (val, config) => ({
      start: (cb) => {
        if (config?.toValue !== undefined && val?.setValue) {
          val.setValue(config.toValue);
        }
        cb?.({ finished: true });
      },
    }),
    parallel: (anims) => ({
      start: (cb) => {
        anims?.forEach?.((a) => a?.start?.());
        cb?.({ finished: true });
      },
    }),
    View: "AnimatedView",
  },
};

export function loadClientModule(file, moduleOverrides = {}) {
  // Keep one module graph per test host, including the entry and shared code.
  const cache = new Map();
  function load(modulePath) {
    const filePath = [modulePath, `${modulePath}.tsx`, `${modulePath}.ts`].find(
      (candidate) => existsSync(candidate),
    );
    if (!filePath) throw new Error(`Module not found: ${modulePath}`);
    if (cache.has(filePath)) return cache.get(filePath);

    const transpiled = ts.transpileModule(readFileSync(filePath, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;

    const exports = {};
    cache.set(filePath, exports);
    function resolveModule(id) {
      if (id in moduleOverrides) return moduleOverrides[id];
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return require("react/jsx-runtime");
      if (id === "react-native") return mockReactNative;
      if (id === "@getpaseo/plugin/client/react-native")
        return { Icon: "Icon" };
      if (id.startsWith("."))
        return load(path.resolve(path.dirname(filePath), id));
      return require(id);
    }

    new Function("require", "exports", transpiled)(resolveModule, exports);
    return exports;
  }
  return load(path.resolve(process.cwd(), "client", file));
}

/**
 * Instruments a KanbanDragController's public subscription methods to monitor
 * subscription registration, cleanup execution, and post-unmount callback dispatches.
 */
export function instrumentControllerSubscriptions(controller) {
  const cleanupsCalled = { subscribe: 0, subscribeSlot: 0, subscribeDrop: 0 };
  let leakedDispatchesAfterUnmount = 0;
  let isUnmounted = false;

  const wrapMethod = (method) => {
    const orig = controller[method];
    controller[method] = (listener) => {
      const wrappedListener = () => {
        if (isUnmounted) {
          leakedDispatchesAfterUnmount++;
        }
        return listener();
      };
      const origCleanup = orig.call(controller, wrappedListener);
      return () => {
        cleanupsCalled[method]++;
        origCleanup();
      };
    };
  };

  wrapMethod("subscribe");
  wrapMethod("subscribeSlot");
  wrapMethod("subscribeDrop");

  return {
    markUnmounted: () => {
      isUnmounted = true;
    },
    get cleanupsCalled() {
      return cleanupsCalled;
    },
    get leakedDispatchesAfterUnmount() {
      return leakedDispatchesAfterUnmount;
    },
  };
}

export function loadClientComponent(file, componentName, moduleOverrides = {}) {
  const exports = loadClientModule(file, moduleOverrides);
  return componentName ? exports[componentName] : exports;
}
