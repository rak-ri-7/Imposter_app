// src/shared/components/BackLink.tsx
// ← The one back link on the main screens, top left, always the same look.
//   "Leave" when it takes you out of the group (Party Group, Game Menu),
//   "Back" for every other screen. Pass-the-phone games keep their own
//   "Back to menu" link at the bottom of their setup screens.
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type TextStyle } from "react-native";

type Props = {
  label?: "Back" | "Leave";
  onPress: () => void;
  dark?: boolean;                     // on a dark screen
  textStyle?: StyleProp<TextStyle>;   // e.g. the group theme's label colour
};

export default function BackLink({ label = "Back", onPress, dark, textStyle }: Props) {
  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label === "Leave" ? "Leave group" : "Back"}
    >
      <Text style={[styles.text, dark && styles.textDark, textStyle]}>← {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", marginBottom: 12, paddingVertical: 2 },
  text: { color: "#888", fontSize: 14, fontWeight: "600" },
  textDark: { color: "#9AA0BC" },
});
