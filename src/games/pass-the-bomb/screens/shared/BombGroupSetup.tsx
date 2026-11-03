// 👥 Timer-mode setup: 3 quick questions about the group, so the bomb
// only deals instructions that make sense for the people playing.
// Answered once per group (remembered on the group), editable any time.
import { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import type { BombCrowd, BombGroupProfile, BombSpice, BombTasteId } from "../../../../shared/types";
import { TASTES, poolSizeFor } from "../../data/content";

export const CROWDS: { id: BombCrowd; emoji: string; label: string; sub: string; spice: BombSpice }[] = [
  { id: "friends", emoji: "👯", label: "Close friends", sub: "We know each other's secrets", spice: "savage" },
  { id: "family", emoji: "👨‍👩‍👧", label: "Family", sub: "Elders and kids might be around", spice: "wholesome" },
  { id: "couples", emoji: "💑", label: "Couples", sub: "A couples' night", spice: "cheeky" },
  { id: "colleagues", emoji: "💼", label: "Colleagues", sub: "Work friends, keep it friendly", spice: "wholesome" },
  { id: "justmet", emoji: "👋", label: "Just met", sub: "New faces, or a mixed crowd", spice: "cheeky" },
];

export const SPICES: { id: BombSpice; emoji: string; label: string; sub: string }[] = [
  { id: "wholesome", emoji: "😇", label: "Wholesome", sub: "Nothing anyone's grandma would mind" },
  { id: "cheeky", emoji: "😏", label: "Cheeky", sub: "A little teasing, nothing too personal" },
  { id: "savage", emoji: "😈", label: "No mercy", sub: "Exes, secrets, embarrassing phones" },
];

const TASTE_IDS = Object.keys(TASTES) as BombTasteId[];

// "👯 Close friends · 😈 No mercy · 🏏🎬🍕"
export const profileSummary = (p: BombGroupProfile): string => {
  const c = CROWDS.find((x) => x.id === p.crowd);
  const s = SPICES.find((x) => x.id === p.spice);
  const t = p.tastes.length ? ` · ${p.tastes.map((id) => TASTES[id].emoji).join("")}` : "";
  return `${c?.emoji} ${c?.label} · ${s?.emoji} ${s?.label}${t}`;
};

type Props = {
  visible: boolean;
  initial?: BombGroupProfile;
  onCancel: () => void;
  onDone: (p: BombGroupProfile) => void;
};

export default function BombGroupSetup({ visible, initial, onCancel, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [crowd, setCrowd] = useState<BombCrowd | null>(null);
  const [spice, setSpice] = useState<BombSpice>("cheeky");
  const [tastes, setTastes] = useState<BombTasteId[]>([]);

  // Start from the saved answers each time it opens.
  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setCrowd(initial?.crowd ?? null);
    setSpice(initial?.spice ?? "cheeky");
    setTastes(initial?.tastes ?? []);
  }, [visible]);

  const pickCrowd = (c: (typeof CROWDS)[number]) => {
    setCrowd(c.id);
    // Pre-select a sensible spice for a new choice of crowd.
    if (c.id !== initial?.crowd) setSpice(c.spice);
    setStep(1);
  };
  const toggleTaste = (id: BombTasteId) =>
    setTastes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const profile: BombGroupProfile = { crowd: crowd ?? "friends", spice, tastes };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.stepText}>{step < 3 ? `${step + 1} / 3` : "READY"}</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {step === 0 && (
            <>
              <Text style={styles.q}>Who's playing?</Text>
              <View style={styles.col}>
                {CROWDS.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.opt, crowd === c.id && styles.optOn]}
                    onPress={() => pickCrowd(c)}
                  >
                    <Text style={styles.optEmoji}>{c.emoji}</Text>
                    <View style={styles.optMid}>
                      <Text style={[styles.optLabel, crowd === c.id && styles.on]}>{c.label}</Text>
                      <Text style={styles.optSub}>{c.sub}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.q}>How savage?</Text>
              <Text style={styles.hint}>Spicier instructions still wait until round 2 or 3.</Text>
              <View style={styles.col}>
                {SPICES.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.opt, spice === s.id && styles.optOn]}
                    onPress={() => setSpice(s.id)}
                  >
                    <Text style={styles.optEmoji}>{s.emoji}</Text>
                    <View style={styles.optMid}>
                      <Text style={[styles.optLabel, spice === s.id && styles.on]}>{s.label}</Text>
                      <Text style={styles.optSub}>{s.sub}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.nav}>
                <TouchableOpacity style={styles.back} onPress={() => setStep(0)}>
                  <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.next} onPress={() => setStep(2)}>
                  <Text style={styles.nextText}>Next</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.q}>What does your group argue about?</Text>
              <Text style={styles.hint}>Pick the topics that split the room: some love them, some don't.</Text>
              <ScrollView style={styles.chipScroll} contentContainerStyle={styles.chips}>
                {TASTE_IDS.map((id) => {
                  const on = tastes.includes(id);
                  return (
                    <TouchableOpacity key={id} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleTaste(id)}>
                      <Text style={[styles.chipText, on && styles.on]}>
                        {TASTES[id].emoji} {TASTES[id].label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.nav}>
                <TouchableOpacity style={styles.back} onPress={() => setStep(1)}>
                  <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.next} onPress={() => setStep(3)}>
                  <Text style={styles.nextText}>{tastes.length ? "Next" : "Skip"}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.big}>{poolSizeFor(profile)}</Text>
              <Text style={styles.bigSub}>instructions picked for your group</Text>
              <Text style={styles.summary}>{profileSummary(profile)}</Text>
              {!tastes.length && <Text style={styles.hint}>No topics picked: we'll use a broad mix.</Text>}
              <View style={styles.nav}>
                <TouchableOpacity style={styles.back} onPress={() => setStep(2)}>
                  <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.next} onPress={() => onDone(profile)}>
                  <Text style={styles.nextText}>Let's go 💣</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#161616", borderRadius: 18, borderWidth: 1, borderColor: "#FF4500", padding: 20, maxHeight: "90%" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  stepText: { color: "#FF4500", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  close: { color: "#888", fontSize: 18, fontWeight: "800" },
  q: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 6 },
  hint: { color: "#999", fontSize: 13, marginBottom: 12 },
  col: { gap: 8, marginTop: 6 },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1F1F1F", borderRadius: 12, borderWidth: 2, borderColor: "#2A2A2A", padding: 12 },
  optOn: { borderColor: "#FF4500", backgroundColor: "#2A160D" },
  optEmoji: { fontSize: 26 },
  optMid: { flex: 1 },
  optLabel: { color: "#fff", fontSize: 16, fontWeight: "800" },
  optSub: { color: "#999", fontSize: 12, marginTop: 2 },
  on: { color: "#FF8A50" },
  chipScroll: { maxHeight: 320 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#1F1F1F", borderRadius: 999, borderWidth: 2, borderColor: "#2A2A2A", paddingVertical: 8, paddingHorizontal: 12 },
  chipOn: { borderColor: "#FF4500", backgroundColor: "#2A160D" },
  chipText: { color: "#ddd", fontSize: 14, fontWeight: "700" },
  nav: { flexDirection: "row", gap: 10, marginTop: 18 },
  back: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "#444", paddingVertical: 14, alignItems: "center" },
  backText: { color: "#bbb", fontSize: 15, fontWeight: "800" },
  next: { flex: 2, borderRadius: 12, backgroundColor: "#FF4500", paddingVertical: 14, alignItems: "center" },
  nextText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  big: { color: "#FFD700", fontSize: 56, fontWeight: "900", textAlign: "center", marginTop: 8 },
  bigSub: { color: "#ddd", fontSize: 15, textAlign: "center", marginBottom: 14 },
  summary: { color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center", marginBottom: 6 },
});
