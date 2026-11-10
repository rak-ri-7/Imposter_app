// src/shared/voice/VoiceBar.tsx
// 🎙️ The voice bubble that floats over every screen while you're in the
// group's voice chat. It shows whoever is talking (their pixel avatar with a
// green ring) and how many are in the call; tap it for the full list, Mute
// and "Leave voice".
//
// Like the mini player, you can drag it anywhere. It starts on the right
// edge, a little below the middle, clear of the headers and main buttons.
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PixelAvatar from "../avatars/PixelAvatar";
import { displaySemi } from "../theme/fonts";
import { useVoice, type VoicePerson } from "./VoiceProvider";

const GREEN = "#3DDC97";
const RED = "#E63946";
const EDGE = 8;
const dragged = { x: 0, y: 0 }; // where you left it, while the app is open

function Face({ p, size }: { p: VoicePerson; size: number }) {
  return (
    <View
      style={[
        styles.face,
        { width: size + 6, height: size + 6, borderRadius: 8, borderColor: p.speaking ? GREEN : "transparent" },
        p.speaking && styles.faceTalking,
      ]}
    >
      <PixelAvatar avatar={p.avatar ?? undefined} playerId={p.id} size={size} />
      {p.muted && (
        <View style={styles.mutedDot}>
          <Text style={styles.mutedText}>🔇</Text>
        </View>
      )}
    </View>
  );
}

export default function VoiceBar() {
  const v = useVoice();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Countdown for the "Still there?" prompt
  useEffect(() => {
    if (!v.prompt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [v.prompt]);

  // Dragging (same feel as the mini player)
  const size = useRef({ w: 160, h: 48 });
  const pos = useRef(new Animated.ValueXY({ x: dragged.x, y: dragged.y })).current;
  const top = Math.round(winH * 0.45); // its home spot
  const clamp = (x: number, y: number) => {
    const { w, h } = size.current;
    return {
      x: Math.min(0, Math.max(-(winW - w - 10 - EDGE), x)),
      y: Math.min(winH - top - h - insets.bottom - EDGE, Math.max(-(top - insets.top - EDGE), y)),
    };
  };
  const clampRef = useRef(clamp);
  clampRef.current = clamp;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        pos.setOffset({ x: dragged.x, y: dragged.y });
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        pos.flattenOffset();
        const to = clampRef.current(dragged.x + g.dx, dragged.y + g.dy);
        dragged.x = to.x;
        dragged.y = to.y;
        Animated.spring(pos, { toValue: to, friction: 7, tension: 80, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        pos.flattenOffset();
        Animated.spring(pos, { toValue: { x: dragged.x, y: dragged.y }, useNativeDriver: false }).start();
      },
    }),
  ).current;
  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  if (v.status === "off") return null;
  if (v.status === "error") {
    return (
      <View style={[styles.wrap, { top: insets.top + 6 }]}>
        <View style={styles.errPill}>
          <Text style={styles.errPillText} numberOfLines={3}>
            🎙️ {v.error ?? "Couldn't connect to voice."}
          </Text>
          <TouchableOpacity onPress={v.retry} hitSlop={8}>
            <Text style={styles.errRetry}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={v.dismissError} hitSlop={8} accessibilityLabel="Dismiss">
            <Text style={styles.errX}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const connecting = v.status === "connecting" || v.status === "reconnecting";
  const me = v.people.find((p) => p.isMe);
  const others = v.people.filter((p) => !p.isMe);
  // Talkers first, so whoever's speaking is always visible
  // Whoever is talking right now (someone else first, then you)
  const talker = others.find((p) => p.speaking) ?? (me?.speaking ? me : undefined);
  const secsLeft = v.prompt ? Math.max(0, Math.ceil((v.prompt.endsAt - now) / 1000)) : 0;

  return (
    <>
      <Animated.View
        style={[styles.wrap, { top, transform: pos.getTranslateTransform() }]}
        onLayout={onLayout}
        {...pan.panHandlers}
      >
        {/* The bubble: whoever's talking, or a mic; tap to open */}
        <Pressable
          style={[styles.bubble, talker && styles.bubbleTalking]}
          onPress={() => setOpen((o) => !o)}
          accessibilityLabel={`Voice chat, ${v.people.length} in the call. Tap for details.`}
        >
          {connecting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : talker ? (
            <PixelAvatar avatar={talker.avatar ?? undefined} playerId={talker.id} size={34} />
          ) : (
            <Text style={styles.bubbleIcon}>🎙️</Text>
          )}
          {!connecting && (
            <View style={styles.count}>
              <Text style={styles.countText}>{v.people.length}</Text>
            </View>
          )}
          {!v.micOn && !connecting && (
            <View style={styles.mutedBadge}>
              <Text style={styles.mutedBadgeText}>🔇</Text>
            </View>
          )}
        </Pressable>
        {connecting && <Text style={styles.connectingText}>{v.status === "reconnecting" ? "Reconnecting…" : "Joining voice…"}</Text>}

        {open && !connecting && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>
              VOICE · {v.people.length} in the call
            </Text>
            {me && (
              <View style={styles.row}>
                <Face p={me} size={26} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {me.name} <Text style={styles.you}>(you)</Text>
                </Text>
                <Text style={styles.rowState}>{me.muted ? "Muted" : me.speaking ? "Talking" : ""}</Text>
              </View>
            )}
            {others.map((p) => (
              <View key={p.id} style={styles.row}>
                <Face p={p} size={26} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.rowState}>{p.muted ? "Muted" : p.speaking ? "Talking" : ""}</Text>
              </View>
            ))}
            {others.length === 0 && <Text style={styles.alone}>Nobody else yet. They'll pop in when they tap 🎙️ Voice.</Text>}
            {!!v.error && <Text style={styles.err}>{v.error}</Text>}
            <View style={styles.panelBtns}>
              <TouchableOpacity style={[styles.pBtn, !v.micOn && styles.pBtnOn]} onPress={v.toggleMic}>
                <Text style={styles.pBtnText}>{v.micOn ? "🔇 Mute" : "🎤 Unmute"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pBtn, styles.leave]}
                onPress={() => {
                  setOpen(false);
                  v.leave();
                }}
              >
                <Text style={[styles.pBtnText, { color: "#fff" }]}>Leave voice</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>

      {/* "Still there?" — so a forgotten call doesn't run all night */}
      {v.prompt && (
        <View style={styles.promptWrap} pointerEvents="box-none">
          <View style={styles.prompt}>
            <Text style={styles.promptTitle}>{v.prompt.kind === "idle" ? "🎙️ Still there?" : "🎙️ Keep talking?"}</Text>
            <Text style={styles.promptText}>
              {v.prompt.kind === "idle"
                ? `It's been quiet for a while. Voice will hang up in ${secsLeft}s.`
                : `You've been on voice for 3 hours. Voice will hang up in ${secsLeft}s.`}
            </Text>
            <View style={styles.panelBtns}>
              <TouchableOpacity style={[styles.pBtn, styles.stay]} onPress={v.stillHere}>
                <Text style={[styles.pBtnText, { color: "#2A1800" }]}>I'm here</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pBtn, styles.leave]} onPress={v.leave}>
                <Text style={[styles.pBtnText, { color: "#fff" }]}>Hang up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 10, zIndex: 900, elevation: 30, alignItems: "flex-end" },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(42,18,54,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bubbleTalking: { borderColor: GREEN, transform: [{ scale: 1.06 }] },
  bubbleIcon: { fontSize: 22 },
  count: { position: "absolute", top: -4, left: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: GREEN, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  countText: { color: "#0B2A1C", fontSize: 11, ...displaySemi },
  mutedBadge: { position: "absolute", bottom: -4, right: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: RED, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  mutedBadgeText: { fontSize: 9 },
  face: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  faceTalking: { transform: [{ scale: 1.08 }] },
  mutedDot: { position: "absolute", right: -4, bottom: -4 },
  mutedText: { fontSize: 9 },
  connectingText: { color: "#fff", fontSize: 11, marginTop: 4, backgroundColor: "rgba(42,18,54,0.9)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden", ...displaySemi },
  panel: {
    marginTop: 6,
    width: 250,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EAEAEE",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  panelTitle: { color: "#6E6E80", fontSize: 11, letterSpacing: 1.5, marginBottom: 6, ...displaySemi },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  rowName: { flex: 1, color: "#1A1A2E", fontSize: 14, ...displaySemi },
  you: { color: "#9A9AAA", fontSize: 12 },
  rowState: { color: "#6E6E80", fontSize: 11 },
  alone: { color: "#6E6E80", fontSize: 12.5, lineHeight: 18, marginVertical: 4 },
  err: { color: RED, fontSize: 12.5, marginTop: 4 },
  panelBtns: { flexDirection: "row", gap: 8, marginTop: 10 },
  pBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "#F1F1F5" },
  pBtnOn: { backgroundColor: "#FFE1E3" },
  pBtnText: { color: "#1A1A2E", fontSize: 13.5, ...displaySemi },
  leave: { backgroundColor: RED },
  stay: { backgroundColor: "#FFC83D", borderBottomWidth: 3, borderBottomColor: "#D18F00" },
  errPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 340,
    backgroundColor: "#2A1236",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: "rgba(230,57,70,0.6)",
  },
  errPillText: { flexShrink: 1, color: "#fff", fontSize: 12.5, lineHeight: 17 },
  errRetry: { color: "#FFC83D", fontSize: 13, ...displaySemi },
  errX: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "700" },
  promptWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 28, zIndex: 950, elevation: 31 },
  prompt: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  promptTitle: { color: "#1A1A2E", fontSize: 19, textAlign: "center", ...displaySemi },
  promptText: { color: "#6E6E80", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 6 },
});
