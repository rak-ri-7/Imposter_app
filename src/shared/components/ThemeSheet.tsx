// src/shared/components/ThemeSheet.tsx
// 🎨 Pick the group's game-menu theme. Every tile is a live mini preview
// (the real wallpaper, shrunk, with the theme's own title and button
// colours). Picking one changes the menu for everyone and says so in chat.
import { memo, useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import type { Group } from "../types";
import { MENU_THEMES, type MenuTheme } from "../themes/menuThemes";
import { setGroupTheme } from "../firebase/groups";
import { sendChatMessage } from "../firebase/chat";
import { display } from "../theme/fonts";

type Props = { visible: boolean; onClose: () => void; group: Group; playerId: string };

// Each preview draws the wallpaper at phone size, then scales it down.
const FULL_W = 380;
const FULL_H = 680;

// Drawing all the wallpapers is heavy. Doing it while the sheet slides up
// froze the slide (the sheet just popped in), so the sheet arrives with each
// tile's plain colours first and the wallpapers fade in once it's up.
const Preview = memo(function Preview({ theme, w, h, showArt }: { theme: MenuTheme; w: number; h: number; showArt: boolean }) {
  const scale = w / FULL_W;
  const W = theme.Wallpaper;
  const c = theme.colors;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (showArt) Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [showArt]);
  return (
    <View style={{ width: w, height: h, borderRadius: 12, overflow: "hidden", backgroundColor: c.bg }}>
      {W && showArt && (
        <Animated.View
          pointerEvents="none"
          style={{
            opacity: fade,
            position: "absolute",
            width: FULL_W,
            height: FULL_H,
            // scaling happens around the centre: shift so the shrunk
            // wallpaper lines up with the tile's top-left corner
            left: (w - FULL_W) / 2,
            top: (FULL_H * scale - FULL_H) / 2,
            transform: [{ scale }],
          }}
        >
          <W w={FULL_W} h={FULL_H} />
        </Animated.View>
      )}
      {/* a tiny menu on top: title, a bar and two buttons in the theme's colours */}
      <View style={styles.mini}>
        <Text style={[styles.miniTitle, { color: c.text }]}>Game Menu</Text>
        <View style={[styles.miniBar, { backgroundColor: c.panel, borderColor: c.panelBorder }]}>
          <View style={[styles.miniBtn, { backgroundColor: c.accent }]} />
          <View style={[styles.miniBtn, { backgroundColor: c.accent }]} />
        </View>
        <View style={styles.miniCards}>
          <View style={styles.miniCard} />
          <View style={styles.miniCard} />
        </View>
      </View>
    </View>
  );
});

export default function ThemeSheet({ visible, onClose, group, playerId }: Props) {
  const { width } = useWindowDimensions();
  const cols = 3;
  const tileW = Math.floor((Math.min(width, 520) - 32 - (cols - 1) * 10) / cols);
  const tileH = Math.round(tileW * 1.55);
  const current = group.menuTheme ?? MENU_THEMES[0].id;
  const me = group.players.find((p) => p.id === playerId);

  // Wallpapers only after the slide-up has finished (see Preview).
  const [showArt, setShowArt] = useState(false);
  useEffect(() => {
    if (!visible) {
      setShowArt(false);
      return;
    }
    const t = setTimeout(() => setShowArt(true), 380);
    return () => clearTimeout(t);
  }, [visible]);

  const pick = (t: MenuTheme) => {
    onClose();
    if (t.id === current) return;
    setGroupTheme(group.id, t.id).catch(() => {});
    if (me)
      sendChatMessage(group.id, { id: me.id, name: me.name, avatar: me.avatar }, `🎨 changed the theme to ${t.emoji} ${t.name}`).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1, minHeight: 60 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>🎨 Group theme</Text>
              <Text style={styles.sub}>Changes the game menu for everyone in the group.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.grid}>
            {MENU_THEMES.map((t) => {
              const on = t.id === current;
              return (
                <TouchableOpacity key={t.id} style={[styles.tile, { width: tileW }]} onPress={() => pick(t)} accessibilityLabel={`${t.name}: ${t.vibe}`}>
                  <View style={[styles.frame, on && styles.frameOn]}>
                    <Preview theme={t} w={tileW - 6} h={tileH} showArt={showArt} />
                    {on && (
                      <View style={styles.check}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.name, on && { color: "#B08A3E" }]} numberOfLines={1}>
                    {t.emoji} {t.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const NAVY = "#1A1A2E";
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "88%", backgroundColor: "#F7F7FA", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 24 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#D5D5DE", marginTop: 10 },
  header: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, gap: 10 },
  title: { fontSize: 18, ...display, color: NAVY },
  sub: { fontSize: 13, color: "#888", marginTop: 2 },
  close: { fontSize: 18, color: "#888", fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 8 },
  tile: { alignItems: "center", gap: 6, marginBottom: 6 },
  frame: { padding: 2, borderRadius: 14, borderWidth: 1, borderColor: "transparent" },
  frameOn: { borderColor: "#C9A45C", borderWidth: 2, padding: 1 },
  check: { position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: "#C9A45C", alignItems: "center", justifyContent: "center" },
  checkText: { color: "#121110", fontSize: 12, fontWeight: "900" },
  name: { fontSize: 12, fontWeight: "800", color: NAVY },
  mini: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, padding: 8, gap: 6 },
  miniTitle: { fontSize: 11, fontWeight: "900", textAlign: "center", marginTop: 6 },
  miniBar: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 6, borderWidth: 1 },
  miniBtn: { flex: 1, height: 8, borderRadius: 3 },
  miniCards: { flexDirection: "row", gap: 4 },
  miniCard: { flex: 1, height: 38, borderRadius: 5, backgroundColor: "#FFFFFF" },
});
