// src/shared/hooks/useSafeBottom.ts
// 📱 Keeps buttons clear of the phone's own bottom bar (the back / home /
// recent buttons, or the gesture handle). Phones now draw apps behind that
// bar, so each screen adds the bar's height to its bottom padding: the
// screen's colour still runs to the very bottom, but nothing tappable sits
// under the bar.
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the phone's bottom bar (0 when there isn't one). */
export function useBottomInset(): number {
  return useSafeAreaInsets().bottom;
}

/** The style's own bottom padding plus the bar's height. */
export function padBottom(style: StyleProp<ViewStyle>, inset: number): ViewStyle {
  const f = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const base = f.paddingBottom ?? f.paddingVertical ?? f.padding ?? 0;
  return { paddingBottom: (typeof base === "number" ? base : 0) + inset };
}
