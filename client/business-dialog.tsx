import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { WebDialogPortal, useDialogInputFocus } from "./web";
import { useI18n } from "./i18n";

interface Props {
  title: string;
  icon?: ReactNode;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  canClose?: () => boolean;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  maxWidth?: number;
  viewportWidth?: number;
  /** Desktop height in viewport percent; compact/native sizing stays host-owned. */
  viewportHeight?: number;
  /** Content scrolls as a whole, or owns a bounded list/form and fixed footer. */
  scroll?: "content" | "contained";
  contentStyle?: StyleProp<ViewStyle>;
  inputFocus?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

/** Owns modal rendering policy; business children retain their distinct layouts. */
export function BusinessDialog({
  title,
  icon,
  open = true,
  onOpenChange,
  canClose = () => true,
  theme,
  compact,
  maxWidth = 520,
  viewportWidth,
  viewportHeight,
  scroll = "content",
  contentStyle,
  inputFocus = false,
  actions,
  children,
}: Props) {
  const { t } = useI18n();
  const colors = theme.colors;
  const inputFocusId = useDialogInputFocus(
    open && inputFocus ? colors.accent : undefined,
  );
  const changeOpen = (next: boolean) => {
    if (next || canClose()) onOpenChange(next);
  };
  const dismiss = () => changeOpen(false);
  const bodyStyle = [
    { padding: 24, gap: 16, minHeight: 0, flexShrink: 1 },
    contentStyle,
  ];
  if (!open) return null;
  if (compact || Platform.OS !== "web")
    return (
      <Modal title={title} icon={icon} open onOpenChange={changeOpen}>
        <Modal.Content
          scrollable={scroll === "content"}
          style={{ backgroundColor: colors.surface0 }}
          contentContainerStyle={bodyStyle}
        >
          {actions && (
            <View style={{ alignItems: "flex-start" }}>{actions}</View>
          )}
          {inputFocus ? (
            <View nativeID={inputFocusId} style={{ flex: 1, minHeight: 0 }}>
              {children}
            </View>
          ) : (
            children
          )}
        </Modal.Content>
      </Modal>
    );
  return (
    <WebDialogPortal onDismiss={dismiss}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessible={false}
          focusable={false}
        />
        <View
          role="dialog"
          aria-modal
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[
            styles.card,
            {
              maxWidth,
              width: viewportWidth
                ? (`${viewportWidth}vw` as DimensionValue)
                : "100%",
              height: viewportHeight
                ? (`${viewportHeight}vh` as DimensionValue)
                : undefined,
              backgroundColor: colors.surface1,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            {icon}
            <Text
              numberOfLines={1}
              style={[styles.title, { color: colors.foreground }]}
            >
              {title}
            </Text>
            {actions}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("laneManagement.close")}
              hitSlop={8}
              onPress={dismiss}
              disabled={!canClose()}
              style={({ pressed }) => [
                styles.close,
                pressed && { backgroundColor: colors.surface2 },
              ]}
            >
              <Icon name="X" size={18} color={colors.foregroundMuted} />
            </Pressable>
          </View>
          {scroll === "content" ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ flexShrink: 1, backgroundColor: colors.surface0 }}
              contentContainerStyle={bodyStyle}
            >
              {children}
            </ScrollView>
          ) : (
            <View
              nativeID={inputFocusId}
              style={[{ backgroundColor: colors.surface0 }, bodyStyle]}
            >
              {children}
            </View>
          )}
        </View>
      </View>
    </WebDialogPortal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    width: "100%",
    maxHeight: "85%",
    minHeight: 0,
    flexShrink: 1,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  title: { flexShrink: 1, minWidth: 0, fontSize: 16, fontWeight: "600" },
  close: { marginLeft: "auto", padding: 8, borderRadius: 8 },
});
