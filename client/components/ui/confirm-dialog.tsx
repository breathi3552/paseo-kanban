import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Dialog } from "./dialog";
import { Button, type ButtonVariant } from "./button";
import { useI18n } from "../../platform/i18n";

export interface ConfirmDialogProps {
  open?: boolean;
  title: string;
  description: ReactNode;
  theme: PluginSurfaceProps["theme"];
  confirmLabel?: string;
  cancelLabel?: string;
  retryLabel?: string;
  confirmVariant?: ButtonVariant;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  onRetry?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function ConfirmDialog({
  open = true,
  title,
  description,
  theme,
  confirmLabel,
  cancelLabel,
  retryLabel,
  confirmVariant = "destructive",
  loading = false,
  error,
  onConfirm,
  onCancel,
  onRetry,
  onOpenChange,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const colors = theme.colors;
  const resolvedConfirmLabel = confirmLabel ?? t("common.confirm");
  const resolvedCancelLabel = cancelLabel ?? t("common.cancel");
  const resolvedRetryLabel = retryLabel ?? t("common.retry");
  const handleOpenChange = (next: boolean) => {
    if (!next && !loading) {
      onCancel();
      onOpenChange?.(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={title}
      theme={theme}
      maxWidth={420}
      canClose={() => !loading}
      onOpenChange={handleOpenChange}
      scroll="contained"
      contentStyle={styles.content}
    >
      <View style={styles.body}>
        {typeof description === "string" ? (
          <Text style={[styles.description, { color: colors.foreground }]}>
            {description}
          </Text>
        ) : (
          description
        )}

        {error && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: colors.surface1,
                borderColor: colors.statusDanger,
              },
            ]}
          >
            <Text
              accessibilityRole="alert"
              style={[styles.errorText, { color: colors.statusDanger }]}
            >
              {error}
            </Text>
            {onRetry && (
              <Button
                theme={theme}
                size="sm"
                variant="outline"
                disabled={loading}
                accessibilityLabel={resolvedRetryLabel}
                onPress={onRetry}
              >
                {resolvedRetryLabel}
              </Button>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <Button
            theme={theme}
            variant="secondary"
            disabled={loading}
            accessibilityLabel={resolvedCancelLabel}
            onPress={onCancel}
          >
            {resolvedCancelLabel}
          </Button>
          <Button
            theme={theme}
            variant={confirmVariant}
            loading={loading}
            accessibilityLabel={resolvedConfirmLabel}
            onPress={() => {
              void onConfirm();
            }}
          >
            {resolvedConfirmLabel}
          </Button>
        </View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
  },
  body: {
    gap: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
});
