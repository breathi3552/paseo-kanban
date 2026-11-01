import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "../platform/i18n";

export interface IssueLinkProps {
  url: string;
  theme: PluginSurfaceProps["theme"];
}

export function IssueLink({ url, theme }: IssueLinkProps) {
  const { t } = useI18n();
  const toast = useToast();

  return (
    <View style={styles.container}>
      <ExternalLink
        href={url}
        accessibilityLabel={t("external.open")}
        onError={() => toast.error(t("external.failed"))}
      >
        <Text
          style={[styles.linkText, { color: theme.colors.accent }]}
          selectable
        >
          {url}
        </Text>
      </ExternalLink>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
