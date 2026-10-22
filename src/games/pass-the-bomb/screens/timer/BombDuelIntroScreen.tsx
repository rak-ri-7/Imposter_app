import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  ScrollView,
  Alert,
} from "react-native";
import { Group, BombGameState } from "../../../../shared/types";
import { markDuelReady, setDuelMode, startDuel } from "../../logic/timer/game";
import DuelBetCard from "./DuelBetCard";
import { DuelAnnounceToast, HotPotatoMoodsToast } from "./DuelToasts";

type Props = {
  group: Group;
  playerId: string;
};

type DuelMode = "hot-potato" | "fastest-finger" | "hot-seat";
const DUEL_MODES: DuelMode[] = ["hot-potato", "fastest-finger", "hot-seat"];

// Shown on every phone: duellists and spectators read the same rules.
const DUEL_RULES: Record<DuelMode, { title: string; lines: string[] }> = {
  "hot-potato": {
    title: "🔥 HOT POTATO",
    lines: [
      "✂️ No wires this time. Holding it when it blows? Straight to heaven. 😇",
      "4–7 passes each or total — you'll find out which. Then you're stuck with it.",
      "The fuse is hidden, and the bomb hates how you play. Rush it, it gets angry. Hog it, it gets lazy. Bore it, it falls asleep.",
    ],
  },
  "fastest-finger": {
    title: "⚡ FASTEST FINGER",
    lines: [
      "A question pops up on both phones. Both of you can answer.",
      "Holding the bomb? Answer right, then tap Pass to send it over with a new question.",
      "Not holding it? Answer right before the holder does and they're stuck with it for 3s.",
      "Holder answers wrong: locked with the bomb for 3s.",
      "Nobody gets it in 8s? A new question appears.",
      "The fuse is hidden (25–45s). Holding it when it blows costs you a life.",
    ],
  },
  "hot-seat": {
    title: "🪑 HOT SEAT",
    lines: [
      "Only the player holding the bomb answers. The other one watches and sweats.",
      "Answer right, then tap Pass: the bomb and a fresh question go to your opponent.",
      "Wrong answer: that option is crossed out and you're locked out for 3s, then 5s, then 8s for each mistake on the same question.",
      "The fuse is hidden (25–45s). Holding it when it blows costs you a life.",
    ],
  },
};

export default function BombDuelIntroScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const activePlayers = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );
  const isFinalist = activePlayers.some((p) => p.id === playerId);
  const readyPlayers = gameState.duelReadyPlayers ?? [];
  const amReady = readyPlayers.includes(playerId);
  const allReady =
    activePlayers.length > 0 &&
    activePlayers.every((p) => readyPlayers.includes(p.id));
  const notReady = activePlayers.filter((p) => !readyPlayers.includes(p.id));
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);

  const isHost = group.hostId === playerId;
  const duelMode: DuelMode = gameState.duelMode ?? "hot-potato";
  const hostName =
    group.players.find((p) => p.id === group.hostId)?.name ?? "The host";

  // ── Full-screen cards: the announcement first, then (Hot Potato only)
  // the moods. The moods card comes back whenever the host switches to
  // Hot Potato, once per switch.
  const [toast, setToast] = useState<"announce" | "moods" | null>("announce");
  const moodsShownFor = useRef<string | null>(null);
  const roundKey = `${gameState.roundNumber}`;
  useEffect(() => {
    if (toast !== null) return; // the announcement (or another card) is up
    if (duelMode === "hot-potato" && moodsShownFor.current !== roundKey) {
      moodsShownFor.current = roundKey;
      setToast("moods");
    }
    if (duelMode !== "hot-potato") moodsShownFor.current = null;
  }, [toast, duelMode, roundKey]);

  const [scaleAnim] = useState(new Animated.Value(0.7));
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    Vibration.vibrate([100, 80, 100]);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const handleReady = async () => {
    if (amReady || submitting) return;
    setSubmitting(true);
    try {
      await markDuelReady(group, playerId);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (!allReady || starting) return;
    setStarting(true);
    try {
      await startDuel(group);
    } catch (e) {
      console.error(e);
      Alert.alert("Couldn't start the duel", "Tap Start Duel again to retry.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
    {toast === "announce" && (
      <DuelAnnounceToast
        round={gameState.duelRoundIndex ?? 1}
        duellists={activePlayers.map((p) => ({
          id: p.id,
          name: p.name,
          lives: gameState.lives[p.id] ?? 0,
        }))}
        viewerId={playerId}
        onClose={() => setToast(null)}
      />
    )}
    {toast === "moods" && <HotPotatoMoodsToast onClose={() => setToast(null)} />}
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Animated.Text
          style={[styles.duelTitle, { transform: [{ scale: pulseAnim }] }]}
        >
          ⚡ FINAL DUEL ⚡
        </Animated.Text>
        <Text style={styles.duelSubtitle}>Only one walks away</Text>

        <View style={styles.finalistsBox}>
          {activePlayers.map((p) => (
            <View key={p.id} style={styles.finalistRow}>
              <Text style={styles.finalistName}>
                {p.name}
                {p.id === playerId ? " (you)" : ""}
              </Text>
              <Text style={styles.finalistStatus}>
                {readyPlayers.includes(p.id) ? "✅ Ready" : "⏳ Reading rules..."}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.modeSelectLabel}>
          {isHost
            ? "DUEL MODE · TAP TO PICK"
            : `DUEL MODES · ${hostName.toUpperCase()} PICKS`}
        </Text>
        {DUEL_MODES.map((m) => {
          const picked = m === duelMode;
          const rules = DUEL_RULES[m];
          return (
            <TouchableOpacity
              key={m}
              activeOpacity={isHost ? 0.7 : 1}
              disabled={!isHost}
              onPress={() => setDuelMode(group.id, m).catch(console.error)}
              style={[styles.rulesBox, picked && styles.rulesBoxPicked]}
            >
              <View style={styles.rulesHeader}>
                <Text style={[styles.rulesTitle, !picked && styles.dimTitle]}>
                  {rules.title}
                </Text>
                {picked && <Text style={styles.pickedTag}>HOST'S PICK</Text>}
              </View>
              {rules.lines.map((line, i) => (
                <Text
                  key={i}
                  style={[
                    styles.rulesText,
                    picked && styles.rulesTextPicked,
                    picked && i === 0 && styles.rulesTextLead,
                  ]}
                >
                  • {line}
                </Text>
              ))}
            </TouchableOpacity>
          );
        })}

        <DuelBetCard group={group} playerId={playerId} />

        {isFinalist && (
          <TouchableOpacity
            style={[styles.readyBtn, amReady && styles.readyBtnDone]}
            onPress={handleReady}
            disabled={amReady || submitting}
          >
            <Text style={styles.readyBtnText}>
              {amReady ? "✅ You're Ready" : "I'M READY 💪"}
            </Text>
          </TouchableOpacity>
        )}

        {isHost ? (
          <TouchableOpacity
            style={[
              styles.startBtn,
              (!allReady || starting) && styles.startBtnOff,
            ]}
            onPress={handleStart}
            disabled={!allReady || starting}
          >
            <Text style={styles.readyBtnText}>
              {starting
                ? "Starting..."
                : allReady
                  ? "START DUEL ▶"
                  : `Waiting for ${notReady.map((p) => p.name).join(" & ")}...`}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.spectatorText}>
            {allReady
              ? `Both ready. Waiting for ${hostName} to start the duel...`
              : isFinalist
                ? "Read the rules, then tap I'M READY."
                : "👀 Watching from the sidelines..."}
          </Text>
        )}
      </Animated.View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0D0D0D" },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    paddingBottom: 40,
  },
  content: { alignItems: "center", width: "100%" },
  duelTitle: {
    color: "#FF4500",
    fontSize: 34,
    fontWeight: "bold",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 8,
  },
  duelSubtitle: {
    color: "#888",
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 28,
  },
  finalistsBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FF4500",
    marginBottom: 20,
    gap: 10,
  },
  finalistRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  finalistName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  finalistStatus: { color: "#888", fontSize: 13 },
  rulesText: {
    color: "#777",
    fontSize: 12,
    lineHeight: 18,
  },
  rulesTextPicked: { color: "#ddd", fontSize: 13, lineHeight: 19 },
  rulesBoxPicked: { borderColor: "#FF4500", backgroundColor: "#211410" },
  rulesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  dimTitle: { color: "#aaa" },
  pickedTag: {
    color: "#0D0D0D",
    backgroundColor: "#FF4500",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  startBtn: {
    backgroundColor: "#4CAF50",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    width: "100%",
    alignItems: "center",
    marginTop: 12,
  },
  startBtnOff: { backgroundColor: "#2A2A2A" },
  readyBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    width: "100%",
    alignItems: "center",
  },
  readyBtnDone: {
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  readyBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  spectatorText: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginTop: 14,
  },

  modeSelectLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: "center",
  },
  rulesBox: {
    width: "100%",
    backgroundColor: "#161616",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#333",
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  rulesTitle: {
    color: "#FFD700",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 2,
  },

  rulesTextLead: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
