import { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useI18n } from "../../platform/i18n";
import { Input } from "./input";
import { WebSelectPortal } from "../../platform/web";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  theme: PluginSurfaceProps["theme"];
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  triggerStyle?: StyleProp<ViewStyle>;
  layout?: "vertical" | "horizontal";
  align?: "left" | "fill";
  searchThreshold?: number;
}

declare const window: {
  innerWidth?: number;
  innerHeight?: number;
};

interface TriggerRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface DOMElement {
  getBoundingClientRect?(): {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
}

function findDOMNode(refCurrent: unknown): DOMElement | null {
  if (!refCurrent) return null;
  const target = refCurrent as Record<string, unknown>;
  if (typeof target.getBoundingClientRect === "function") {
    return target as DOMElement;
  }
  if (
    typeof target.getScrollableNode === "function" &&
    target.getScrollableNode()
  ) {
    return target.getScrollableNode() as DOMElement;
  }
  if (
    target._node &&
    typeof (target._node as DOMElement).getBoundingClientRect === "function"
  ) {
    return target._node as DOMElement;
  }
  return null;
}

interface SelectInteractionState {
  pressed: boolean;
  hovered?: boolean;
}

const SelectMarker = "Select" as unknown as React.ComponentType<
  Record<string, unknown>
>;

export function Select({
  label,
  value,
  options,
  onValueChange,
  disabled = false,
  placeholder,
  theme,
  testID,
  accessibilityLabel,
  style,
  triggerStyle,
  layout = "vertical",
  align,
  searchThreshold = 10,
}: SelectProps) {
  const { t } = useI18n();
  const colors = theme.colors;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [triggerRect, setTriggerRect] = useState<TriggerRect | null>(null);
  const triggerRef = useRef<View | null>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const displayText = selectedOption?.label ?? placeholder ?? "";
  const isSearchable = options.length >= searchThreshold;

  const filteredOptions = useMemo(() => {
    if (!isSearchable || !searchQuery.trim()) {
      return options;
    }
    const query = searchQuery.trim().toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [options, isSearchable, searchQuery]);

  const updateTriggerRect = () => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    const el = findDOMNode(triggerRef.current);
    if (el && typeof el.getBoundingClientRect === "function") {
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        setTriggerRect({
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        });
      }
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updateTriggerRect();
      setSearchQuery("");
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue);
    setIsOpen(false);
  };

  const showLabel = Boolean(label);
  const shouldAlignLeft = align === "left" || (!align && !showLabel);

  const popoverPositionStyle = useMemo<ViewStyle>(() => {
    if (
      !triggerRect ||
      Platform.OS !== "web" ||
      typeof window === "undefined"
    ) {
      return {
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 4,
        minWidth: "100%",
      };
    }

    const viewportHeight = window.innerHeight || 800;
    const viewportWidth = window.innerWidth || 1200;
    const popoverMaxHeight = 220;

    const spaceBelow = viewportHeight - triggerRect.bottom;
    const placeAbove =
      spaceBelow < popoverMaxHeight && triggerRect.top > popoverMaxHeight;

    const top = placeAbove
      ? Math.max(8, triggerRect.top - popoverMaxHeight - 4)
      : triggerRect.bottom + 4;

    const targetWidth =
      align === "fill" ? triggerRect.width : Math.max(triggerRect.width, 180);

    const left = Math.min(
      triggerRect.left,
      Math.max(8, viewportWidth - targetWidth - 8),
    );

    return {
      position: "fixed" as unknown as "absolute",
      top,
      left,
      width: align === "fill" ? triggerRect.width : undefined,
      minWidth: Math.max(triggerRect.width, 180),
      maxWidth: 360,
      zIndex: 101,
    };
  }, [triggerRect, align]);

  return (
    <View
      style={[
        styles.container,
        layout === "horizontal"
          ? styles.containerHorizontal
          : styles.containerVertical,
        isOpen && styles.containerOpen,
        style,
      ]}
    >
      <SelectMarker
        testID={testID}
        label={label}
        value={value}
        options={options}
        onValueChange={onValueChange}
        disabled={disabled}
        aria-hidden={true}
        style={styles.hiddenMarker}
      />
      {showLabel && (
        <Text
          style={[
            layout === "horizontal" ? styles.inlineLabel : styles.fieldLabel,
            { color: colors.foregroundMuted },
          ]}
        >
          {label}
        </Text>
      )}

      <View
        style={[
          styles.triggerWrapper,
          shouldAlignLeft ? styles.alignLeft : styles.alignFill,
        ]}
      >
        <Pressable
          ref={triggerRef}
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label ?? displayText}
          accessibilityState={{ expanded: isOpen, disabled }}
          disabled={disabled}
          onPress={handleToggle}
          style={(state: SelectInteractionState) => [
            styles.trigger,
            {
              borderColor:
                isOpen || state.hovered ? colors.accent : colors.border,
              backgroundColor: state.hovered
                ? colors.surface1
                : colors.surface2,
              opacity: disabled ? 0.45 : 1,
            },
            triggerStyle,
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.triggerText,
              {
                color: selectedOption
                  ? colors.foreground
                  : colors.foregroundMuted,
              },
            ]}
          >
            {displayText}
          </Text>
          <Icon
            name={isOpen ? "ChevronUp" : "ChevronDown"}
            size={14}
            color={colors.foregroundMuted}
          />
        </Pressable>

        {isOpen && (
          <WebSelectPortal onDismiss={() => setIsOpen(false)}>
            <Pressable
              style={styles.backdrop}
              onPress={() => setIsOpen(false)}
              accessibilityRole="none"
            />
            <View
              pointerEvents="auto"
              style={[
                styles.popover,
                popoverPositionStyle,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border,
                },
              ]}
            >
              {isSearchable && (
                <View style={styles.searchWrapper}>
                  <Input
                    theme={theme}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t("select.searchPlaceholder")}
                    style={styles.searchInput}
                    autoFocus
                  />
                </View>
              )}

              <ScrollView
                style={styles.optionsList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {filteredOptions.length === 0 ? (
                  <View style={styles.emptyOption}>
                    <Text
                      style={[
                        styles.emptyText,
                        { color: colors.foregroundMuted },
                      ]}
                    >
                      {t("select.noMatches")}
                    </Text>
                  </View>
                ) : (
                  filteredOptions.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => handleSelect(opt.value)}
                        style={(state: SelectInteractionState) => [
                          styles.optionItem,
                          {
                            backgroundColor: isSelected
                              ? colors.surface1
                              : state.hovered
                                ? colors.surface1
                                : "transparent",
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.optionText,
                            {
                              color: isSelected
                                ? colors.accent
                                : colors.foreground,
                              fontWeight: isSelected ? "600" : "400",
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && (
                          <Icon name="Check" size={14} color={colors.accent} />
                        )}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </WebSelectPortal>
        )}
      </View>
    </View>
  );
}

Select.displayName = "Select";

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  containerVertical: {
    flexDirection: "column",
    gap: 4,
  },
  containerHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  containerOpen: {
    zIndex: 1000,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  inlineLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  triggerWrapper: {
    position: "relative",
  },
  hiddenMarker: {
    display: "none",
  },
  alignLeft: {
    alignSelf: "flex-start",
    minWidth: 140,
  },
  alignFill: {
    width: "100%",
  },
  trigger: {
    minHeight: 32,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
    }),
  },
  triggerText: {
    fontSize: 13,
    flex: 1,
  },
  backdrop: {
    position: "fixed" as unknown as "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 100,
  },
  popover: {
    maxHeight: 220,
    borderRadius: 6,
    borderWidth: 1,
    zIndex: 1000,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.25)",
      },
      default: {
        elevation: 8,
      },
    }),
  },
  searchWrapper: {
    padding: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
  },
  searchInput: {
    height: 28,
    minHeight: 28,
    fontSize: 12,
    paddingHorizontal: 8,
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
    }),
  },
  optionsList: {
    maxHeight: 180,
  },
  optionItem: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  optionText: {
    fontSize: 13,
    flex: 1,
  },
  emptyOption: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
  },
});
