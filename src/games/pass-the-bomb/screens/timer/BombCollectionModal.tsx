// Every bomb quirk combo this group has discovered — and the ??? still out
// there. Found ones show their full rules; missing ones only their kind.
import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { ACHIEVEMENTS, ALL_ACHIEVEMENTS, rewardText } from "../../data/achievements";
import { Group } from "../../../../shared/types";
import { ALL_QUIRK_VARIANTS, QUIRK_INFO } from "../../logic/timer/bombQuirks";

type Props = { group: Group; visible: boolean; onClose: () => void };

const KIND_LABEL = { crush: "💘 CRUSH", stranger: "🙅 STRANGER", lazy: "😴 LAZY" } as const;

export const collectionCount = (group: Group) =>
  ALL_QUIRK_VARIANTS.filter((v) => group.bombCollection?.[v]).length;

export default function BombCollectionModal({ group, visible, onClose }: Props) {
  const found = group.bombCollection ?? {};
  const nameOf = (id: string) => group.players.find((p) => p.id === id)?.name;
  const count = collectionCount(group);
  const [tab, setTab] = useState<"bombs" | "ach">("bombs");
  const achFound = group.achievementCollection ?? {};
  const achCount = ALL_ACHIEVEMENTS.filter((a) => achFound[a]).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>📖 Bomb Collection</Text>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === "bombs" && styles.tabOn]}
            onPress={() => setTab("bombs")}
          >
            <Text style={styles.tabText}>💣 Bombs {count}/{ALL_QUIRK_VARIANTS.length}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "ach" && styles.tabOn]}
            onPress={() => setTab("ach")}
          >
            <Text style={styles.tabText}>🏅 Achievements {achCount}/{ALL_ACHIEVEMENTS.length}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sub}>
          {tab === "bombs"
            ? "The bomb changes with how you play it…"
            : "Hidden. You'll know when you've earned one."}
        </Text>
        {tab === "ach" ? (
          <ScrollView contentContainerStyle={styles.list}>
            {ALL_ACHIEVEMENTS.map((id) => {
              const a = ACHIEVEMENTS[id];
              const f = achFound[id];
              return f ? (
                <View key={id} style={styles.card}>
                  <Text style={styles.name}>
                    {a.emoji} {a.name}
                  </Text>
                  <Text style={styles.explain}>
                    {a.how} {rewardText(a)}
                  </Text>
                  <Text style={styles.meta}>
                    First by {nameOf(f.foundBy) ?? "someone"} ·{" "}
                    {new Date(f.foundAt).toLocaleDateString()}
                  </Text>
                </View>
              ) : (
                <View key={id} style={[styles.card, styles.locked]}>
                  <Text style={styles.lockedName}>❓ ???</Text>
                  <Text style={styles.lockedHint}>Not unlocked yet</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(["crush", "stranger", "lazy"] as const).map((kind) => (
            <View key={kind} style={styles.group}>
              <Text style={styles.kind}>{KIND_LABEL[kind]}</Text>
              {ALL_QUIRK_VARIANTS.filter((v) => QUIRK_INFO[v].kind === kind).map((v) => {
                const info = QUIRK_INFO[v];
                const f = found[v];
                return f ? (
                  <View key={v} style={styles.card}>
                    <Text style={styles.name}>
                      {info.emoji} {info.name}
                    </Text>
                    <Text style={styles.explain}>{info.explain}</Text>
                    <Text style={styles.meta}>
                      Found by {nameOf(f.foundBy) ?? "someone"} ·{" "}
                      {new Date(f.foundAt).toLocaleDateString()}
                    </Text>
                  </View>
                ) : (
                  <View key={v} style={[styles.card, styles.locked]}>
                    <Text style={styles.lockedName}>❓ ??? BOMB</Text>
                    <Text style={styles.lockedHint}>Not discovered yet</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
        )}
        <TouchableOpacity style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D0D0D", padding: 20, paddingTop: 50 },
  title: { color: "#FFD700", fontSize: 26, fontWeight: "900", textAlign: "center" },
  sub: { color: "#999", fontSize: 13, textAlign: "center", marginTop: 6, marginBottom: 12 },
  list: { gap: 16, paddingBottom: 20 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 12 },
  tab: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    paddingVertical: 10,
    alignItems: "center",
  },
  tabOn: { borderColor: "#FFD700", backgroundColor: "#1E1A0A" },
  tabText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  group: { gap: 8 },
  kind: { color: "#888", fontSize: 12, letterSpacing: 2, fontWeight: "800" },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
    padding: 12,
    gap: 4,
  },
  name: { color: "#fff", fontSize: 16, fontWeight: "900" },
  explain: { color: "#ccc", fontSize: 13, lineHeight: 19 },
  meta: { color: "#777", fontSize: 11 },
  locked: { borderColor: "#333", opacity: 0.6 },
  lockedName: { color: "#888", fontSize: 15, fontWeight: "800" },
  lockedHint: { color: "#555", fontSize: 12 },
  close: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  closeText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
