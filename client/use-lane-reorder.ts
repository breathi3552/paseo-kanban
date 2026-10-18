import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  type GestureResponderEvent,
} from "react-native";

interface Options {
  ids: string[];
  step: number;
  disabled: boolean;
  onChange: (ids: string[]) => void;
}
interface Gesture {
  id: string;
  source: number;
  target: number;
  dx: number;
  startX: number;
  startY: number;
  grantDx: number;
  claimed: boolean;
  startScroll: number;
  active: boolean;
  touch: boolean;
  dropping: boolean;
}

const spring = { stiffness: 260, damping: 26, mass: 1, useNativeDriver: false };

/** Horizontal lane gestures: shared visual language, no task ownership semantics. */
export function useLaneReorder(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const positions = useRef(new Map<string, Animated.Value>());
  const callbacks = useRef(new Map<string, () => void>());
  const responders = useRef(
    new Map<string, ReturnType<typeof PanResponder.create>>(),
  );
  const session = useRef<Gesture | null>(null);
  const scroll = useRef(0);
  const inputTouch = useRef<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const suppressPress = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const [feedback, setFeedback] = useState<{
    id: string;
    target: number;
  } | null>(null);

  const position = (id: string) => {
    let value = positions.current.get(id);
    if (!value) {
      value = new Animated.Value(
        latest.current.ids.indexOf(id) * latest.current.step,
      );
      positions.current.set(id, value);
    }
    return value;
  };
  const preview = (gesture: Gesture) => {
    const ids = latest.current.ids.filter((id) => id !== gesture.id);
    ids.splice(gesture.target, 0, gesture.id);
    return ids;
  };
  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const clearPressSuppression = () => {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      suppressPress.current = false;
      pressTimer.current = null;
    }, 0);
  };
  const cancel = () => {
    clearTimer();
    clearPressSuppression();
    session.current = null;
    animation.current?.stop?.();
    setFeedback(null);
    latest.current.ids.forEach((id, index) =>
      Animated.spring(position(id), {
        ...spring,
        toValue: index * latest.current.step,
      }).start(),
    );
  };
  const move = (dx: number, dy = 0) => {
    const gesture = session.current;
    if (!gesture || gesture.dropping) return;
    gesture.dx = dx;
    const delta = dx + scroll.current - gesture.startScroll;
    if (!gesture.active && gesture.touch) {
      if (Math.hypot(dx, dy) >= 5) {
        clearTimer();
        session.current = null;
        suppressPress.current = true;
      }
      return;
    }
    if (!gesture.active && Math.hypot(delta, dy) < 5) return;
    clearTimer();
    gesture.active = true;
    suppressPress.current = true;
    position(gesture.id).setValue(gesture.source * latest.current.step + delta);
    const target = Math.max(
      0,
      Math.min(
        latest.current.ids.length - 2,
        Math.round(gesture.source + delta / latest.current.step),
      ),
    );
    gesture.target = target;
    setFeedback({ id: gesture.id, target });
    preview(gesture).forEach((id, index) => {
      if (id !== gesture.id)
        Animated.spring(position(id), {
          ...spring,
          toValue: index * latest.current.step,
        }).start();
    });
  };
  const release = () => {
    clearTimer();
    clearPressSuppression();
    const gesture = session.current;
    if (!gesture || gesture.dropping) return;
    if (!gesture.active) {
      session.current = null;
      callbacks.current.get(gesture.id)?.();
      return;
    }
    gesture.dropping = true;
    animation.current = Animated.spring(position(gesture.id), {
      ...spring,
      toValue: gesture.target * latest.current.step,
    });
    animation.current.start(({ finished }) => {
      if (!alive.current || session.current !== gesture) return;
      if (!finished) {
        cancel();
        return;
      }
      const ids = preview(gesture);
      session.current = null;
      latest.current.onChange(ids);
      setFeedback(null);
    });
  };

  useEffect(() => {
    if (session.current) return;
    options.ids.forEach((id, index) => {
      let value = positions.current.get(id);
      if (!value) {
        value = new Animated.Value(index * options.step);
        positions.current.set(id, value);
      }
      Animated.spring(value, {
        ...spring,
        toValue: index * options.step,
      }).start();
    });
    for (const id of positions.current.keys()) {
      if (!options.ids.includes(id)) {
        positions.current.delete(id);
        responders.current.delete(id);
        callbacks.current.delete(id);
      }
    }
  }, [options.ids, options.step]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      session.current = null;
      if (timer.current !== null) clearTimeout(timer.current);
      if (pressTimer.current !== null) clearTimeout(pressTimer.current);
      animation.current?.stop?.();
    };
  }, []);

  const isTouch = (event: GestureResponderEvent) => {
    const native = event.nativeEvent as typeof event.nativeEvent & {
      pointerType?: string;
    };
    return native.pointerType
      ? native.pointerType !== "mouse"
      : (inputTouch.current ?? native.touches?.length > 0);
  };
  const begin = (
    id: string,
    event: GestureResponderEvent,
    claimed: boolean,
  ) => {
    if (latest.current.disabled || session.current) return;
    clearTimer();
    suppressPress.current = false;
    const source = latest.current.ids.indexOf(id);
    const touch = isTouch(event);
    const gesture: Gesture = {
      id,
      source,
      target: source,
      dx: 0,
      startX: event.nativeEvent.pageX,
      startY: event.nativeEvent.pageY,
      grantDx: 0,
      claimed,
      startScroll: scroll.current,
      active: false,
      touch,
      dropping: false,
    };
    session.current = gesture;
    if (touch)
      timer.current = setTimeout(() => {
        timer.current = null;
        if (
          !alive.current ||
          session.current !== gesture ||
          latest.current.disabled
        )
          return;
        gesture.active = true;
        move(0);
      }, 220);
  };
  const bind = (id: string, onPress: () => void) => {
    callbacks.current.set(id, onPress);
    let responder = responders.current.get(id);
    if (!responder) {
      responder = PanResponder.create({
        // Let PanResponder retain its native capture bookkeeping. Touch only
        // observes the initial contact; the ScrollView owns quick swipes.
        onStartShouldSetPanResponderCapture: (event) => {
          if (latest.current.disabled) return false;
          if (isTouch(event)) {
            begin(id, event, false);
            return false;
          }
          return true;
        },
        onStartShouldSetPanResponder: (event) =>
          !latest.current.disabled && !isTouch(event),
        onMoveShouldSetPanResponderCapture: () =>
          session.current?.id === id && session.current.active,
        onMoveShouldSetPanResponder: () =>
          session.current?.id === id && session.current.active,
        onPanResponderGrant: (event) => {
          const pending = session.current;
          if (pending?.id === id) {
            pending.claimed = true;
            // A long-pressed touch is claimed on its first move. PanResponder
            // resets dx at grant, so keep the displacement before that handoff.
            pending.grantDx = event.nativeEvent.pageX - pending.startX;
            move(pending.grantDx, event.nativeEvent.pageY - pending.startY);
          } else begin(id, event, true);
        },
        onShouldBlockNativeResponder: () => session.current?.active ?? false,
        onPanResponderMove: (_event, gesture) =>
          move(gesture.dx + (session.current?.grantDx ?? 0), gesture.dy),
        onPanResponderRelease: release,
        onPanResponderTerminate: () => {
          suppressPress.current = true;
          cancel();
        },
        onPanResponderTerminationRequest: () => !session.current?.active,
      });
      responders.current.set(id, responder);
    }
    return {
      ...responder.panHandlers,
      onTouchStart: (event: GestureResponderEvent) => begin(id, event, false),
      onTouchMove: (event: GestureResponderEvent) => {
        const pending = session.current;
        if (pending?.id === id && !pending.claimed)
          move(
            event.nativeEvent.pageX - pending.startX,
            event.nativeEvent.pageY - pending.startY,
          );
      },
      onTouchEnd: () => {
        if (session.current?.id === id && !session.current.claimed) release();
        else clearPressSuppression();
      },
      onTouchCancel: () => {
        if (session.current?.id === id) {
          suppressPress.current = true;
          cancel();
        }
      },
      onPointerDown: (event: { nativeEvent: { pointerType: string } }) => {
        inputTouch.current = event.nativeEvent.pointerType !== "mouse";
      },
      onPress: () => {
        if (!suppressPress.current && !latest.current.disabled)
          callbacks.current.get(id)?.();
      },
    };
  };

  return {
    bind,
    active: feedback !== null,
    slot: feedback?.target ?? null,
    onScroll: (x: number) => {
      scroll.current = x;
      if (session.current?.active) move(session.current.dx);
    },
    style: (id: string) => ({
      transform: [
        { translateX: position(id) },
        { translateY: feedback?.id === id ? -4 : 0 },
        { scale: feedback?.id === id ? 1.02 : 1 },
      ],
      zIndex: feedback?.id === id ? 10 : 0,
      elevation: feedback?.id === id ? 8 : 0,
      shadowColor: "#000",
      shadowOpacity: feedback?.id === id ? 0.2 : 0,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    }),
  };
}
