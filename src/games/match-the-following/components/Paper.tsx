// The exam sheet every screen sits on: cream paper, a red margin line, and
// a header row (question number on the left, the timer on the right).
import type { ReactNode } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { HAND, MF } from "../theme";

type Props = {
  kicker?: string;              // "Q3 of 5"
  right?: string;               // "0:42"
  urgent?: boolean;
  children: ReactNode;
  footer?: ReactNode;           // pinned under the scroll (buttons)
  scroll?: boolean;
};

export default function Paper({ kicker, right, urgent, children, footer, scroll = true }: Props) {
  const body = <View style={styles.body}>{children}</View>;
  return (
    <View style={styles.sheet}>
      <View style={styles.margin} pointerEvents="none" />
      <View style={styles.head}>
        <Text style={styles.kicker}>{kicker ?? ""}</Text>
        {right ? <Text style={[styles.timer, urgent && { color: MF.wrong }]}>{right}</Text> : null}
      </View>
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

export const clock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: MF.paper },
  margin: { position: "absolute", left: 26, top: 0, bottom: 0, width: 2, backgroundColor: MF.margin, opacity: 0.6 },
  head: {
    paddingTop: 52,
    paddingLeft: 40,
    paddingRight: 20,
    paddingBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: MF.rule,
  },
  kicker: { color: MF.ink, fontSize: 16, fontWeight: "800", fontFamily: HAND },
  timer: { color: MF.ink, fontSize: 20, fontWeight: "900" },
  scroll: { paddingBottom: 24 },
  body: { paddingLeft: 40, paddingRight: 18, paddingTop: 14, gap: 14 },
  footer: { paddingLeft: 40, paddingRight: 18, paddingTop: 10, paddingBottom: 22, borderTopWidth: 1, borderColor: MF.rule, backgroundColor: MF.paper },
});
