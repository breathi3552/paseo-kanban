import type { ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export type BadgeVariant = "default" | "secondary" | "outline";

export interface BadgeProps {
  children?: ReactNode;
  variant?: BadgeVariant;
  theme: PluginSurfaceProps["theme"];
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Badge({
  children,
  variant = "secondary",
  theme,
  style,
  textStyle,
  accessibilityLabel,
}: BadgeProps) {
  const colors = theme.colors;

  let backgroundColor: string;
  let borderColor: string = "transparent";
  let textColor: string = colors.foregroundMuted;

  if (variant === "default") {
    backgroundColor = colors.accent;
    textColor = colors.accentForeground;
  } else if (variant === "outline") {
    backgroundColor = "transparent";
    borderColor = colors.border;
  } else {
    backgroundColor = colors.surface2;
  }

  const isTextContent =
    typeof children === "string" || typeof children === "number";

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, { backgroundColor, borderColor }, style]}
    >
      {isTextContent ? (
        <Text
          numberOfLines={1}
          style={[styles.text, { color: textColor }, textStyle]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
  },
});
