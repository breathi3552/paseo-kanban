import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  openExternalUrl,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useI18n } from "../platform/i18n";

export function IssueLink({
  url,
  theme,
  iconOnly = false,
  disabled = false,
}: {
  url: string;
  theme: PluginSurfaceProps["theme"];
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [hovered, setHovered] = useState(false);
  const styles = useMemo(
    () => createIssueLinkStyles(theme.colors),
    [theme.colors],
  );
  return (
    <View style={iconOnly ? styles.iconWrapper : undefined}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t("external.open")}
        disabled={disabled}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={iconOnly ? styles.iconButton : styles.textButton}
        onPress={async (event) => {
          event.stopPropagation();
          try {
            await openExternalUrl(url);
          } catch {
            toast.error(t("external.failed"));
          }
        }}
      >
        {iconOnly ? (
          <Icon name="ExternalLink" size={16} color={theme.colors.accent} />
        ) : (
          <Text style={styles.linkText} selectable>
            {url}
          </Text>
        )}
      </Pressable>
      {iconOnly && hovered && (
        <Text style={styles.tooltipText}>{t("external.open")}</Text>
      )}
    </View>
  );
}

function createIssueLinkStyles(colors: PluginSurfaceProps["theme"]["colors"]) {
  return StyleSheet.create({
    iconWrapper: {
      alignSelf: "flex-start",
    },
    iconButton: {
      width: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    textButton: {
      paddingVertical: 6,
    },
    linkText: {
      color: colors.accent,
      textDecorationLine: "underline",
      flexShrink: 1,
    },
    tooltipText: {
      position: "absolute",
      right: 0,
      top: 20,
      padding: 6,
      backgroundColor: colors.surface2,
      color: colors.foreground,
      fontSize: 12,
      zIndex: 10,
    },
  });
}
