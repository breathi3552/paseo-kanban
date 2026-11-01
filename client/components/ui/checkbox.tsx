import type { ComponentProps } from "react";
import {
  Pressable,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
} from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
interface CheckboxInteractionState {
  pressed: boolean;
  hovered?: boolean;
}

export interface CheckboxProps extends Omit<
  ComponentProps<typeof Pressable>,
  "style" | "children"
> {
  checked?: boolean | "mixed";
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  theme: PluginSurfaceProps["theme"];
  accessibilityLabel?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  dataSet?: Record<string, string>;
  accessibilityRole?: "checkbox" | "none";
}

export function Checkbox({
  checked = false,
  onCheckedChange,
  disabled = false,
  theme,
  accessibilityLabel,
  size = 18,
  style,
  onPress,
  ...props
}: CheckboxProps) {
  const colors = theme.colors;
  const isChecked = checked === true;
  const isMixed = checked === "mixed";
  const isActive = isChecked || isMixed;

  const handlePress = (event: GestureResponderEvent) => {
    if (disabled) return;
    onPress?.(event);
    onCheckedChange?.(!isChecked);
  };

  const iconSize = Math.max(12, Math.round(size * 0.78));

  return (
    <Pressable
      {...props}
      accessibilityRole={
        props.accessibilityRole === "none"
          ? undefined
          : (props.accessibilityRole ?? "checkbox")
      }
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{
        checked,
        disabled,
      }}
      disabled={disabled}
      onPress={handlePress}
      style={(state: CheckboxInteractionState) => [
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: isActive ? colors.accent : colors.foregroundMuted,
          backgroundColor: isActive
            ? colors.accent
            : state.hovered
              ? colors.surface2
              : "transparent",
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {isChecked && (
        <Icon name="Check" size={iconSize} color={colors.accentForeground} />
      )}
      {isMixed && (
        <Icon name="Minus" size={iconSize} color={colors.accentForeground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
    }),
  },
});
