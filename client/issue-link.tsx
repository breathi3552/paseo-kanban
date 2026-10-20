import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  openExternalUrl,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useI18n } from "./i18n";

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
  return (
    <View style={iconOnly ? { alignSelf: "flex-start" } : undefined}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t("external.open")}
        disabled={disabled}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={
          iconOnly
            ? {
                width: 20,
                height: 20,
                alignItems: "center",
                justifyContent: "center",
              }
            : { paddingVertical: 6 }
        }
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
          <Text
            style={{
              color: theme.colors.accent,
              textDecorationLine: "underline",
              flexShrink: 1,
            }}
            selectable
          >
            {url}
          </Text>
        )}
      </Pressable>
      {iconOnly && hovered && (
        <Text
          style={{
            position: "absolute",
            right: 0,
            top: 20,
            padding: 6,
            backgroundColor: theme.colors.surface2,
            color: theme.colors.foreground,
            fontSize: 12,
            zIndex: 10,
          }}
        >
          {t("external.open")}
        </Text>
      )}
    </View>
  );
}
