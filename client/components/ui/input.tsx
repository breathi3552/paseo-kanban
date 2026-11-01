import { useState, type ComponentProps } from "react";
import {
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export interface InputProps extends Omit<
  ComponentProps<typeof TextInput>,
  "style"
> {
  theme: PluginSurfaceProps["theme"];
  onEscape?: () => void;
  style?: StyleProp<TextStyle>;
  error?: boolean;
}

interface WebSyntheticKeyEvent {
  key?: string;
  keyCode?: number;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  stopPropagation?: () => void;
  preventDefault?: () => void;
}

export function Input({
  theme,
  onEscape,
  style,
  error = false,
  onFocus,
  onBlur,
  onKeyPress,
  ...props
}: InputProps) {
  const colors = theme.colors;
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (event: WebSyntheticKeyEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault?.();
      event.stopPropagation?.();
      onEscape?.();
    }
  };

  const borderColor = error
    ? colors.statusDanger
    : isFocused
      ? colors.accent
      : colors.border;

  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.foregroundMuted}
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      // Web 平台事件注入支持
      {...({
        onKeyDown: handleKeyDown,
      } as Record<string, unknown>)}
      onKeyPress={(
        e: NativeSyntheticEvent<TextInputKeyPressEventData> &
          WebSyntheticKeyEvent,
      ) => {
        handleKeyDown(e);
        onKeyPress?.(e);
      }}
      style={[
        styles.input,
        {
          backgroundColor: colors.surface1,
          borderColor,
          color: colors.foreground,
        },
        props.multiline && styles.multiline,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 36,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
});
