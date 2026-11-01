import type { ComponentProps, ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type GestureResponderEvent,
} from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export type ButtonVariant =
  "primary" | "secondary" | "destructive" | "outline" | "ghost";

export type ButtonSize = "default" | "sm" | "icon";

interface ButtonInteractionState {
  pressed: boolean;
  hovered?: boolean;
  focused?: boolean;
}

export interface ButtonProps extends Omit<
  ComponentProps<typeof Pressable>,
  "style" | "children"
> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void | Promise<unknown>;
  accessibilityLabel?: string;
  theme: PluginSurfaceProps["theme"];
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  dataSet?: Record<string, string>;
}

export function Button({
  children,
  variant = "secondary",
  size = "default",
  disabled = false,
  loading = false,
  icon,
  onPress,
  accessibilityLabel,
  theme,
  style,
  textStyle,
  ...restProps
}: ButtonProps) {
  const colors = theme.colors;
  const blocked = disabled || loading;

  const isPrimary = variant === "primary";
  const isDestructive = variant === "destructive";
  const isOutline = variant === "outline";
  const isGhost = variant === "ghost";

  let backgroundColor: string;
  let borderColor: string = "transparent";
  let textColor: string = colors.foreground;

  if (isPrimary) {
    backgroundColor = colors.accent;
    textColor = colors.accentForeground;
  } else if (isDestructive) {
    backgroundColor = colors.statusDanger;
    textColor = colors.accentForeground;
  } else if (isGhost) {
    backgroundColor = "transparent";
    textColor = colors.foreground;
  } else if (isOutline) {
    backgroundColor = "transparent";
    borderColor = colors.border;
    textColor = colors.foreground;
  } else {
    // secondary
    backgroundColor = colors.surface1;
    borderColor = colors.border;
    textColor = colors.foreground;
  }

  const label =
    accessibilityLabel ?? (typeof children === "string" ? children : undefined);

  return (
    <Pressable
      {...restProps}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={(event) => {
        if (!blocked && onPress) return onPress(event);
      }}
      style={(state: ButtonInteractionState) => {
        const isHovered = Boolean(state.hovered && !blocked);
        const isFocused = Boolean(state.focused && !blocked);
        const isPressed = Boolean(state.pressed && !blocked);
        let activeBg = backgroundColor;
        let activeBorder = borderColor;

        if (isFocused) {
          activeBorder = colors.accent;
        }

        if (isHovered) {
          if (isGhost || isOutline || variant === "secondary") {
            activeBg = colors.surface2;
          }
        }

        return [
          styles.base,
          size === "sm" && styles.sizeSm,
          size === "icon" && styles.sizeIcon,
          {
            backgroundColor: activeBg,
            borderColor: activeBorder,
            opacity: blocked
              ? 0.45
              : isPressed
                ? 0.85
                : isHovered && (isPrimary || isDestructive)
                  ? 0.92
                  : 1,
            ...(isPressed ? { transform: [{ scale: 0.98 }] } : {}),
          },
          style,
        ];
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon}
          {typeof children === "string" ? (
            <Text
              numberOfLines={1}
              style={[
                styles.text,
                size === "sm" && styles.textSm,
                { color: textColor },
                textStyle,
              ]}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 34,
  },
  sizeSm: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    minHeight: 28,
  },
  sizeIcon: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: "500",
  },
  textSm: {
    fontSize: 12,
  },
});
