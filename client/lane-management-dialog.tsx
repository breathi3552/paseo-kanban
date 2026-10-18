import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { WebDialogPortal } from "./web";
import { useI18n } from "./i18n";

interface Props {
  title: string;
  onOpenChange: (open: boolean) => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  wide?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

export function LaneManagementDialog({
  title,
  onOpenChange,
  theme,
  compact,
  wide = false,
  actions,
  children,
}: Props) {
  const { t } = useI18n();
  const colors = theme.colors;
  const dismiss = () => onOpenChange(false);
  const contentStyle = { padding: compact ? 12 : 20, gap: 12 };
  if (compact || Platform.OS !== "web")
    return (
      <Modal title={title} open onOpenChange={onOpenChange}>
        <Modal.Content
          style={{ backgroundColor: colors.surface0 }}
          contentContainerStyle={contentStyle}
        >
          {actions && <View style={{ alignItems: "flex-end" }}>{actions}</View>}
          {children}
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
              maxWidth: wide ? 1120 : 520,
              backgroundColor: colors.surface1,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
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
              style={({ pressed }) => [
                styles.close,
                pressed && { backgroundColor: colors.surface2 },
              ]}
            >
              <Icon name="X" size={18} color={colors.foregroundMuted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexShrink: 1, backgroundColor: colors.surface0 }}
            contentContainerStyle={contentStyle}
          >
            {children}
          </ScrollView>
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
  },
  title: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: "600" },
  close: { padding: 8, borderRadius: 8 },
});
