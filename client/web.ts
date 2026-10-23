import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { createPortal } from "./generated/react-dom-portal.js";

interface KeyEvent {
  key: string;
  keyCode: number;
  shiftKey: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
interface WebElement {
  style: Record<string, string>;
  tabIndex: number;
  isConnected: boolean;
  appendChild(child: WebElement): void;
  remove(): void;
  focus(): void;
  contains(element: WebElement | null): boolean;
  closest(selector: string): WebElement | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  getClientRects(): { length: number };
  querySelectorAll(selector: string): ArrayLike<WebElement>;
  addEventListener(type: string, listener: (event: KeyEvent) => void): void;
  removeEventListener(type: string, listener: (event: KeyEvent) => void): void;
}
declare const document: {
  body: WebElement;
  activeElement: WebElement | null;
  createElement(tag: string): WebElement;
  addEventListener(
    type: string,
    listener: (event: MenuDocumentEvent) => void,
    capture?: boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: MenuDocumentEvent) => void,
    capture?: boolean,
  ): void;
};
interface MenuDocumentEvent {
  target: WebElement | null;
  key?: string;
  preventDefault(): void;
  stopPropagation(): void;
}
declare const window: {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

const focusable = (root: WebElement) =>
  Array.from(
    root.querySelectorAll(
      'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (node) =>
      node.getAttribute("disabled") === null &&
      node.getAttribute("aria-disabled") !== "true" &&
      node.getClientRects().length > 0,
  );

/** Own web surface, never a selector or mutation of the host's private DOM.
 * z=0 sits above app content by insertion order, below the host overlay plane
 * (z=1), leaving host Toasts and command dialogs visible and interactive. */
export function WebDialogPortal({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [container, setContainer] = useState<WebElement | null>(null);
  const ownedFocus = useRef<WebElement | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const previous = document.activeElement;
    const fallback = previous?.closest("[data-kanban-dialog]");
    const node = document.createElement("div");
    node.setAttribute("data-kanban-dialog", "");
    node.tabIndex = -1;
    Object.assign(node.style, {
      position: "fixed",
      inset: "0",
      zIndex: "0",
      display: "flex",
      flexDirection: "column",
    });
    document.body.appendChild(node);
    setContainer(node);
    return () => {
      const restore =
        node.contains(document.activeElement) ||
        document.activeElement === document.body;
      node.remove();
      if (restore) {
        if (previous?.isConnected) previous.focus();
        else if (fallback?.isConnected) fallback.focus();
      }
    };
  }, []);
  useEffect(() => {
    if (!container) return;
    if (!container.contains(document.activeElement))
      (focusable(container)[0] ?? container).focus();
    const onKeyDown = (event: KeyEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229)
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss.current();
      } else if (event.key === "Tab") {
        const targets = focusable(container);
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first) {
          event.preventDefault();
          container.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === container)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === container)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const rememberFocus = () => {
      ownedFocus.current = document.activeElement;
    };
    rememberFocus();
    container.addEventListener("focusin", rememberFocus);
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("focusin", rememberFocus);
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [container]);
  useLayoutEffect(() => {
    // Name confirmation/cancellation removes the focused input/button. Recover
    // inside after that commit, without stealing focus from a host overlay.
    if (
      !container ||
      (document.activeElement && document.activeElement !== document.body)
    )
      return;
    const previous = ownedFocus.current;
    const target =
      previous?.isConnected && container.contains(previous)
        ? previous
        : (focusable(container)[0] ?? container);
    target.focus();
  });
  return Platform.OS === "web" && container
    ? createPortal(children, container)
    : null;
}

/** Non-modal surface: no backdrop and no focus trap; host overlays stay above it. */
export function WebMenuPortal({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [container, setContainer] = useState<WebElement | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const previous = document.activeElement;
    const node = document.createElement("div");
    Object.assign(node.style, {
      position: "fixed",
      inset: "0",
      zIndex: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(node);
    setContainer(node);
    const outside = (event: MenuDocumentEvent) => {
      if (!node.contains(event.target)) dismiss.current();
    };
    const resize = () => dismiss.current();
    const keydown = (event: MenuDocumentEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      // Restore before default Tab navigation, so it continues from the card.
      if (previous?.isConnected && node.contains(document.activeElement))
        previous.focus();
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      dismiss.current();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", outside, true);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", outside, true);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", resize);
      const restore =
        node.contains(document.activeElement) ||
        document.activeElement === document.body;
      node.remove();
      if (restore && previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (container) focusable(container)[0]?.focus();
  }, [container]);
  return Platform.OS === "web" && container
    ? createPortal(children, container)
    : null;
}
