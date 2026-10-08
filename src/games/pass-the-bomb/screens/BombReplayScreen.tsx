import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Modal,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import { startNextRound, endBombGame, toggleDisputeVote } from "../logic/game";
import BombAlleyScreen from "./BombAlleyScreen";
import MissionsButton from "./MissionsButton";
import BombBetSheet, { betPickLabel } from "./BombBetSheet";
import { settleBets } from "../logic/betEngine";
import { liarOffset } from "../logic/liarClock";

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
  // Callouts this player has dismissed ("Let it slide") — never prompted again.
  const [dismissedDisputes, setDismissedDisputes] = useState<number[]>([]);
  // One funky line per callout, picked once so it doesn't change on re-render.
  const funkyLineRef = useRef<Record<number, string>>({});
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
  const lie = liarOffset(gameState.roundNumber, gameState.passHistory.length);
  const lieText =
    lie > 0
      ? `it showed ${lie}s more than was really left`
      : `it showed ${-lie}s less than was really left`;

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

  const funkyCalloutLines = [
    "Chaos has entered the chat.",
    "The jury has been summoned.",
    "Time to pick a side.",
    "Drama o'clock.",
    "Someone's about to regret that pass.",
  ];

  //Effects
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
    const loop = Animated.loop(
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
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Same majority rule as the server: everyone except the accused can vote.
  const majorityNeeded = Math.floor((group.players.length - 1) / 2) + 1;

  // The live callout this player should be asked about, if any. Recomputed
  // on every snapshot, so the vote count is always current and the prompt
  // disappears by itself once the player has voted, dismissed it, or the
  // callout is withdrawn.
  const activePrompt = disputes.find(
    (d) =>
      !d.resolved &&
      d.voterIds.length > 0 &&
      d.accusedId !== playerId &&
      !d.voterIds.includes(playerId) &&
      !dismissedDisputes.includes(d.passIndex),
  );

  if (activePrompt && !funkyLineRef.current[activePrompt.passIndex]) {
    funkyLineRef.current[activePrompt.passIndex] =
      funkyCalloutLines[Math.floor(Math.random() * funkyCalloutLines.length)];
  }

  // Scroll the disputed pass into view when a new callout appears.
  useEffect(() => {
    if (!activePrompt) return;
    const y = itemOffsetsRef.current[activePrompt.passIndex];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
    }
  }, [activePrompt?.passIndex]);

  const dismissPrompt = (passIndex: number) =>
    setDismissedDisputes((prev) => [...prev, passIndex]);

  const joinCallout = (passIndex: number) => {
    dismissPrompt(passIndex); // close straight away; the vote follows
    handleCallout(passIndex);
  };

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
            {gameState.personalityEffect === "liar" && (
              <Text style={styles.liarReplayText}>
                🎭 At the end the clock was lying: {lieText}
              </Text>
            )}
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
                  {event.boomerang ? (
                    <>
                      <Text style={styles.journeyBoomerang}>
                        🪃 BOOMERANG — sent it straight back
                      </Text>
                      <Text
                        style={styles.journeyInstructionSkipped}
                        numberOfLines={1}
                      >
                        Instruction skipped: "{event.instruction}"
                      </Text>
                    </>
                  ) : event.usedFallback && event.fallback ? (
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

                  {event.boomerang ? (
                    <Text style={styles.boomerangTag}>
                      🪃 Fair play — a boomerang can't be called out
                    </Text>
                  ) : guiltyVerdict ? (
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
      {/* Live callout prompt — updates as votes come in, closes itself */}
      <Modal
        visible={!!activePrompt}
        transparent
        animationType="fade"
        onRequestClose={() =>
          activePrompt && dismissPrompt(activePrompt.passIndex)
        }
      >
        {activePrompt && (
          <View style={styles.calloutBackdrop}>
            <View style={styles.calloutCard}>
              <Text style={styles.calloutTitle}>🚨 Callout in progress</Text>
              <Text style={styles.calloutBody}>
                {getPlayerName(activePrompt.voterIds[0])} called out{" "}
                {getPlayerName(activePrompt.accusedId)}'s pass to{" "}
                {getPlayerName(
                  gameState.passHistory[activePrompt.passIndex]?.to ?? "",
                )}
                . {funkyLineRef.current[activePrompt.passIndex]}
              </Text>

              <Text style={styles.calloutTally}>
                {activePrompt.voterIds.length}/{majorityNeeded} votes
              </Text>
              <Text style={styles.calloutTallySub}>
                {majorityNeeded - activePrompt.voterIds.length === 1
                  ? "Your vote seals the verdict."
                  : `${majorityNeeded - activePrompt.voterIds.length} more needed for a guilty verdict.`}
              </Text>

              <View style={styles.calloutActions}>
                <TouchableOpacity
                  style={[styles.calloutActionBtn, styles.calloutSlideBtn]}
                  onPress={() => dismissPrompt(activePrompt.passIndex)}
                >
                  <Text style={styles.calloutSlideText}>😇 Let it slide</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.calloutActionBtn, styles.calloutGuiltyBtn]}
                  onPress={() => joinCallout(activePrompt.passIndex)}
                >
                  <Text style={styles.calloutGuiltyText}>😈 Guilty!</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
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

  journeyBoomerang: { color: "#4DD0E1", fontSize: 12, fontWeight: "700" },
  journeyInstructionSkipped: {
    color: "#555",
    fontSize: 11,
    fontStyle: "italic",
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  boomerangTag: { color: "#4DD0E1", fontSize: 11, marginTop: 6 },

  liarReplayText: {
    color: "#9B59B6",
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic",
  },

  calloutBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  calloutCard: {
    width: "100%",
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E63946",
    padding: 20,
  },
  calloutTitle: {
    color: "#E63946",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  calloutBody: {
    color: "#ddd",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  calloutTally: {
    color: "#FFD700",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  calloutTallySub: {
    color: "#999",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 18,
  },
  calloutActions: { flexDirection: "row", gap: 10 },
  calloutActionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  calloutSlideBtn: { backgroundColor: "#2A2A2A" },
  calloutSlideText: { color: "#aaa", fontSize: 14, fontWeight: "600" },
  calloutGuiltyBtn: { backgroundColor: "#E63946" },
  calloutGuiltyText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
