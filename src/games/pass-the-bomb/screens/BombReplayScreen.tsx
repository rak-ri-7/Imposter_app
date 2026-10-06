import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Alert,
  Modal,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { startNextRound, endBombGame, toggleDisputeVote } from "../logic/game";
import BombAlleyScreen from "./BombAlleyScreen";
import MissionsButton from "./MissionsButton";
import { debugStartGhostTournament } from "../logic/ghostTournament";
import BombBetSheet, { betPickLabel } from "./BombBetSheet";
import { settleBets } from "../logic/betEngine";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombReplayScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const [fadeAnim] = useState(new Animated.Value(0));
  const scrollRef = useRef<ScrollView>(null);
  const itemOffsetsRef = useRef<Record<number, number>>({});
  const promptedDisputesRef = useRef<Set<number>>(new Set());
  const [pulseAnim] = useState(new Animated.Value(0));
  const [loading, setLoading] = useState(false);
  const [showAlley, setShowAlley] = useState(false);
  const [showBets, setShowBets] = useState(false);
  const [expandedPasses, setExpandedPasses] = useState<Record<number, boolean>>(
    {},
  );

  const activePlayers = group.players.filter(
    (p) => !gameState.ghosts.includes(p.id),
  );
  const gameOver = activePlayers.length <= 1;
  const disputes = gameState.disputes ?? [];

  // Host settles any open bets that this replay can decide. Safe to repeat.
  const openBetCount = (gameState.matchBets ?? []).filter(
    (b) => b.status === "open",
  ).length;
  useEffect(() => {
    if (isHost && openBetCount > 0) settleBets(group);
  }, [
    isHost,
    openBetCount,
    gameState.roundNumber,
    gameState.everGhosted?.length,
  ]);

  const settledThisRound = (gameState.matchBets ?? []).filter(
    (b) => b.status !== "open" && b.settledRound === gameState.roundNumber,
  );

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, []);

  const funkyCalloutLines = [
    "Chaos has entered the chat.",
    "The jury has been summoned.",
    "Time to pick a side.",
    "Drama o'clock.",
    "Someone's about to regret that pass.",
  ];

  useEffect(() => {
    for (const dispute of disputes) {
      if (dispute.resolved) continue;
      if (dispute.accusedId === playerId) continue;
      if (dispute.voterIds.includes(playerId)) continue;
      if (promptedDisputesRef.current.has(dispute.passIndex)) continue;

      promptedDisputesRef.current.add(dispute.passIndex);

      const accuserName = getPlayerName(dispute.voterIds[0]);
      const accusedName = getPlayerName(dispute.accusedId);
      const passEvent = gameState.passHistory[dispute.passIndex];
      const targetName = passEvent ? getPlayerName(passEvent.to) : "someone";
      const eligibleCount = group.players.length - 1;
      const majorityNeeded = Math.floor(eligibleCount / 2) + 1;
      const funkyLine =
        funkyCalloutLines[Math.floor(Math.random() * funkyCalloutLines.length)];

      const y = itemOffsetsRef.current[dispute.passIndex];
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
      }

      Alert.alert(
        "🚨 CALLOUT IN PROGRESS!",
        `${accuserName} just called out ${accusedName}'s pass to ${targetName}. ${funkyLine}\n\n${dispute.voterIds.length}/${majorityNeeded} votes needed for a guilty verdict.`,
        [
          { text: "😇 Let it slide", style: "cancel" },
          {
            text: "😈 I'm in — guilty!",
            onPress: () => handleCallout(dispute.passIndex),
          },
        ],
      );

      break; // one popup at a time even if multiple disputes are somehow live
    }
  }, [disputes]);

  const getPlayerName = (id: string) =>
    group.players.find((p) => p.id === id)?.name ?? "Unknown";

  const handleNext = async () => {
    setLoading(true);
    try {
      if (gameOver) {
        await endBombGame(group);
      } else {
        await startNextRound(group);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCallout = async (passIndex: number) => {
    await toggleDisputeVote(group, passIndex, playerId);
  };

  const finalInstruction = gameState.explodedPlayerId
    ? gameState.instructions[gameState.explodedPlayerId]
    : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          🎬 Round {gameState.roundNumber} Replay
        </Text>
        <View style={styles.iconGroup}>
          <MissionsButton />
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowBets(true)}
          >
            <Text style={styles.iconBtnText}>🎲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowAlley(true)}
          >
            <Text style={styles.iconBtnText}>🕯️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        {/* Bomb personality */}
        <View style={styles.personalityCard}>
          <Text style={styles.personalityEmoji}>
            {gameState.personalityEmoji}
          </Text>
          <View>
            <Text style={styles.personalityName}>
              {gameState.personalityName}
            </Text>
            <Text style={styles.correctWireText}>
              Safe wire was:{" "}
              {gameState.correctWire === "red" ? "🔴 RED" : "🔵 BLUE"}
            </Text>
          </View>
        </View>

        {/* Pass journey */}
        <Text style={styles.sectionLabel}>BOMB'S JOURNEY</Text>
        <ScrollView
          ref={scrollRef}
          style={styles.journeyList}
          showsVerticalScrollIndicator={false}
        >
          {gameState.passHistory.map((event, index) => {
            const dispute = disputes.find((d) => d.passIndex === index);
            const iVoted = dispute?.voterIds.includes(playerId) ?? false;
            const iAmAccused = event.from === playerId;
            const eligibleCount = group.players.length - 1; // everyone except accused
            const majorityNeeded = Math.floor(eligibleCount / 2) + 1;
            const voteCount = dispute?.voterIds.length ?? 0;
            const guiltyVerdict = dispute?.guilty ?? false;
            const isLive = !!dispute && !dispute.resolved && voteCount > 0;

            return (
              <View
                key={index}
                style={styles.journeyStep}
                onLayout={(e) => {
                  itemOffsetsRef.current[index] = e.nativeEvent.layout.y;
                }}
              >
                <View style={styles.journeyLeft}>
                  <View style={styles.journeyDot} />
                  <View style={styles.journeyLine} />
                </View>
                <Animated.View
                  style={[
                    styles.journeyContent,
                    isLive && styles.journeyContentLive,
                    isLive && {
                      borderColor: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["#E63946", "#FFD700"],
                      }),
                    },
                  ]}
                >
                  <Text style={styles.journeyFrom}>
                    <Text style={styles.journeyName}>
                      {getPlayerName(event.from)}
                    </Text>
                    {" → "}
                    <Text style={styles.journeyName}>
                      {getPlayerName(event.to)}
                    </Text>
                  </Text>
                  {event.usedFallback && event.fallback ? (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() =>
                        setExpandedPasses((prev) => ({
                          ...prev,
                          [index]: !prev[index],
                        }))
                      }
                    >
                      <Text
                        style={styles.journeyInstruction}
                        numberOfLines={expandedPasses[index] ? undefined : 1}
                      >
                        "{event.instruction}"
                      </Text>
                      <Text
                        style={styles.journeyFallback}
                        numberOfLines={expandedPasses[index] ? undefined : 2}
                      >
                        🪂 Fallback: "{event.fallback}"
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.journeyInstruction}>
                      "{event.instruction}"
                    </Text>
                  )}

                  {isLive && (
                    <Text style={styles.liveCalloutBanner}>
                      🔥 LIVE CALLOUT — CAST YOUR VOTE
                    </Text>
                  )}

                  {guiltyVerdict ? (
                    <View style={styles.guiltyTag}>
                      <Text style={styles.guiltyTagText}>
                        🔨 Found guilty — paid the price
                      </Text>
                    </View>
                  ) : !iAmAccused ? (
                    <TouchableOpacity
                      style={[
                        styles.calloutBtn,
                        iVoted && styles.calloutBtnActive,
                      ]}
                      onPress={() => handleCallout(index)}
                    >
                      <Text
                        style={[
                          styles.calloutBtnText,
                          iVoted && styles.calloutBtnTextActive,
                        ]}
                      >
                        {iVoted ? "✓ You called this out" : "😤 Call It Out"}
                      </Text>
                      {voteCount > 0 && (
                        <Text style={styles.calloutCount}>
                          {voteCount}/{majorityNeeded} needed
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : voteCount > 0 ? (
                    <Text style={styles.underFireText}>
                      🔥 {voteCount}/{majorityNeeded} think this pass was wrong
                    </Text>
                  ) : null}
                </Animated.View>
              </View>
            );
          })}

          {/* Final instruction — the one the exploded player had but never
              completed. This was previously missing entirely: each pass
              entry above shows the PASSER's instruction (why they sent it
              onward), never the FINAL holder's own instruction, since by
              definition they never made a successful pass to trigger one
              of those entries. Shown as its own step, directly feeding
              into the explosion marker below it. */}
          {gameState.explodedPlayerId && (
            <View style={styles.journeyStep}>
              <View style={styles.journeyLeft}>
                <View style={styles.journeyDot} />
                <View style={styles.journeyLine} />
              </View>
              <View style={styles.journeyContent}>
                <Text style={styles.journeyFrom}>
                  <Text style={styles.journeyName}>
                    {getPlayerName(gameState.explodedPlayerId)}
                  </Text>
                  {" was holding when it happened"}
                </Text>
                {finalInstruction ? (
                  <Text style={styles.journeyInstruction}>
                    "{finalInstruction}"
                  </Text>
                ) : (
                  <Text style={styles.journeyInstruction}>
                    (no instruction on record)
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Explosion */}
          <View style={styles.journeyStep}>
            <View style={styles.journeyLeft}>
              <View style={[styles.journeyDot, styles.journeyDotBoom]} />
            </View>
            <View style={styles.journeyContent}>
              <Text style={styles.journeyBoom}>
                {gameState.defused
                  ? `🧯 ${getPlayerName(gameState.explodedPlayerId ?? "")} DEFUSED IT!`
                  : `💥 ${getPlayerName(gameState.explodedPlayerId ?? "")} EXPLODED!`}
              </Text>
              {gameState.wireChoice && (
                <Text style={styles.journeyWire}>
                  Cut {gameState.wireChoice === "red" ? "🔴 RED" : "🔵 BLUE"}
                  {" — "}
                  {gameState.defused ? "Correct!" : "Wrong!"}
                </Text>
              )}
            </View>
          </View>
        </ScrollView>

        {settledThisRound.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>🎲 BET RESULTS</Text>
            <View style={styles.betResults}>
              {settledThisRound.slice(0, 4).map((b) => (
                <Text
                  key={b.id}
                  style={[
                    styles.betResultLine,
                    b.status === "won" && styles.betResultWon,
                    b.status === "lost" && styles.betResultLost,
                  ]}
                >
                  {getPlayerName(b.bettorId)} ·{" "}
                  {betPickLabel(b.pick, group.players, playerId)} · {b.stake} FP{" "}
                  {b.status === "won"
                    ? `✅ +${(b.payout ?? 0) - b.stake} FP`
                    : b.status === "lost"
                      ? `❌ −${b.stake} FP`
                      : "↩️ refunded"}
                </Text>
              ))}
              {settledThisRound.length > 4 && (
                <Text style={styles.betResultMore}>
                  …and {settledThisRound.length - 4} more
                </Text>
              )}
            </View>
          </>
        )}

        {/* Lives summary */}
        <Text style={styles.sectionLabel}>LIVES AFTER THIS ROUND</Text>
        <View style={styles.livesGrid}>
          {group.players.map((player) => {
            const lives = gameState.lives[player.id] ?? 0;
            const isElim = gameState.ghosts.includes(player.id);
            return (
              <View key={player.id} style={styles.livesCard}>
                <Text style={styles.livesPlayerName}>{player.name}</Text>
                {isElim ? (
                  <Text style={styles.ghostTag}>👻</Text>
                ) : (
                  <View style={styles.livesRow}>
                    {[1, 2, 3].map((i) => (
                      <Text key={i} style={styles.heart}>
                        {i <= lives ? "❤️" : "🖤"}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </Animated.View>
      {isHost && (
        <TouchableOpacity
          style={styles.debugBtn}
          onPress={() => debugStartGhostTournament(group)}
        >
          <Text style={styles.debugBtnText}>
            🧪 Test Ghost Challenge (temporary)
          </Text>
        </TouchableOpacity>
      )}
      {isHost && (
        <TouchableOpacity
          style={[styles.nextBtn, gameOver && styles.nextBtnEnd]}
          onPress={handleNext}
          disabled={loading}
        >
          <Text style={styles.nextBtnText}>
            {loading
              ? "Loading..."
              : gameOver
                ? "See Final Results 🏆"
                : "Next Round 💣"}
          </Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <Text style={styles.waitingText}>
          Waiting for host to start next round...
        </Text>
      )}

      <Modal
        visible={showBets}
        animationType="slide"
        onRequestClose={() => setShowBets(false)}
      >
        <BombBetSheet
          group={group}
          playerId={playerId}
          onClose={() => setShowBets(false)}
          onOpenAlley={() => {
            setShowBets(false);
            setTimeout(() => setShowAlley(true), 350);
          }}
        />
      </Modal>

      {/* Alley — same independent full-screen Modal pattern as BombPlayScreen */}
      <Modal
        visible={showAlley}
        animationType="slide"
        onRequestClose={() => setShowAlley(false)}
      >
        <BombAlleyScreen
          group={group}
          playerId={playerId}
          onClose={() => setShowAlley(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    padding: 20,
    paddingTop: 60,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
    marginLeft: 118, // balances the icon button on the right so the title stays visually centered
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  iconBtnText: { fontSize: 15 },
  personalityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#FF4500",
  },
  personalityEmoji: { fontSize: 28 },
  personalityName: { color: "#FF4500", fontSize: 14, fontWeight: "600" },
  correctWireText: { color: "#888", fontSize: 12, marginTop: 2 },
  sectionLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 10,
  },
  journeyList: { flex: 1, marginBottom: 12 },
  journeyStep: { flexDirection: "row", gap: 12, marginBottom: 4 },
  journeyLeft: { alignItems: "center", width: 20 },
  journeyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF4500",
    marginTop: 4,
  },
  journeyDotBoom: {
    backgroundColor: "#4CAF50",
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  journeyLine: { flex: 1, width: 2, backgroundColor: "#333", marginTop: 2 },
  journeyContent: { flex: 1, paddingBottom: 12 },
  journeyFrom: { color: "#888", fontSize: 13, marginBottom: 2 },
  journeyName: { color: "#fff", fontWeight: "600" },
  journeyInstruction: { color: "#555", fontSize: 11, fontStyle: "italic" },
  journeyBoom: { color: "#FF4500", fontSize: 14, fontWeight: "bold" },
  journeyWire: { color: "#888", fontSize: 12, marginTop: 2 },
  calloutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#333",
  },
  calloutBtnActive: {
    borderColor: "#E63946",
    backgroundColor: "#2D0A0E",
  },
  calloutBtnText: { color: "#888", fontSize: 11, fontWeight: "600" },
  calloutBtnTextActive: { color: "#E63946" },
  calloutCount: { color: "#555", fontSize: 10 },
  underFireText: { color: "#E63946", fontSize: 11, marginTop: 6 },
  guiltyTag: {
    backgroundColor: "#2D0A0E",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  guiltyTagText: { color: "#E63946", fontSize: 11, fontWeight: "700" },
  livesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  livesCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    minWidth: 80,
  },
  livesPlayerName: { color: "#888", fontSize: 11, marginBottom: 4 },
  livesRow: { flexDirection: "row", gap: 2 },
  heart: { fontSize: 12 },
  ghostTag: { fontSize: 16 },
  nextBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  nextBtnEnd: { backgroundColor: "#FFD700" },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  waitingText: { color: "#888", fontSize: 14, textAlign: "center" },

  journeyContentLive: {
    borderRadius: 10,
    borderWidth: 2,
    padding: 8,
    backgroundColor: "#2A0A0A",
    marginTop: 2,
  },
  liveCalloutBanner: {
    color: "#FFD700",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 2,
  },
  debugBtn: { padding: 10, alignItems: "center", marginBottom: 8 },
  debugBtnText: { color: "#555", fontSize: 12 },

  journeyInstructionDim: { opacity: 0.6 },
  journeyFallback: {
    color: "#888",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 2,
  },
  iconGroup: { flexDirection: "row", gap: 8 },

  betResults: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "#333",
  },
  betResultLine: { color: "#aaa", fontSize: 11 },
  betResultWon: { color: "#4CAF50" },
  betResultLost: { color: "#E63946" },
  betResultMore: { color: "#555", fontSize: 10 },
});
