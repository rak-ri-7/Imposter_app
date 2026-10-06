import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  FlatList,
} from "react-native";
import { Group, BombGameState } from "../../../shared/types";
import {
  cutPenaltyWire,
  closePenaltyAndReturnToReplay,
  invokeTrialByCombat,
} from "../logic/game";

type Props = {
  group: Group;
  playerId: string;
};

export default function BombPenaltyScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHost = group.hostId === playerId;
  const isAccused = gameState.penaltyPlayerId === playerId;
  const accusedName =
    group.players.find((p) => p.id === gameState.penaltyPlayerId)?.name ??
    "Someone";
  const [cutting, setCutting] = useState(false);
  const [invoking, setInvoking] = useState(false);
  const [showOpponentPicker, setShowOpponentPicker] = useState(false);
  const [flashAnim] = useState(new Animated.Value(0));

  const resolved = gameState.penaltyResult != null;
  const tbcInProgress = !!gameState.tbcChallenge;
  const myTbcTickets = gameState.tbcTickets?.[playerId] ?? 0;
  const accuserIds = gameState.penaltyAccuserIds ?? [];

  useEffect(() => {
    if (resolved || tbcInProgress) return;
    Vibration.vibrate([150, 80, 150]);
    Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [resolved, tbcInProgress]);

  const handleCut = async (wire: "red" | "blue") => {
    if (!isAccused || cutting || resolved) return;
    setCutting(true);
    try {
      await cutPenaltyWire(group, wire);
    } finally {
      setCutting(false);
    }
  };

  const handlePickOpponent = async (opponentId: string) => {
    if (invoking) return;
    setInvoking(true);
    try {
      const result = await invokeTrialByCombat(group, opponentId);
      if (result.success) {
        setShowOpponentPicker(false);
      }
    } finally {
      setInvoking(false);
    }
  };

  // Once a Trial by Combat has been invoked, control hands off entirely
  // to the TBC duel screen (routed from BombFlowScreen via
  // gameState.tbcChallenge) — this screen has nothing left to show.
  if (tbcInProgress) {
    return (
      <View style={styles.container}>
        <Text style={styles.verdictTag}>⚔️ TRIAL BY COMBAT</Text>
        <Text style={styles.waitingText}>Preparing the duel...</Text>
      </View>
    );
  }

  if (resolved) {
    const caught = gameState.penaltyResult === "caught";
    return (
      <View style={styles.container}>
        <Text style={styles.resultEmoji}>{caught ? "💥" : "🧯"}</Text>
        <Text
          style={[
            styles.resultTitle,
            { color: caught ? "#E63946" : "#4CAF50" },
          ]}
        >
          {caught ? "CAUGHT!" : "LUCKY ESCAPE!"}
        </Text>
        <Text style={styles.resultSubtitle}>
          {isAccused
            ? caught
              ? "The jury was right. That cost you a life."
              : "You cut the right wire — no penalty this time."
            : caught
              ? `${accusedName} got caught out. Justice served.`
              : `${accusedName} got lucky. No penalty.`}
        </Text>

        {isHost && (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => closePenaltyAndReturnToReplay(group.id)}
          >
            <Text style={styles.continueBtnText}>Back to Replay →</Text>
          </TouchableOpacity>
        )}
        {!isHost && (
          <Text style={styles.waitingText}>
            Waiting for host to continue...
          </Text>
        )}
      </View>
    );
  }

  // ── Opponent picker sub-view ─────────────────────────────────────
  if (showOpponentPicker) {
    return (
      <View style={styles.container}>
        <Text style={styles.verdictTag}>⚔️ CHOOSE YOUR OPPONENT</Text>
        <Text style={styles.subtitle}>
          Pick one of the players who voted you guilty
        </Text>
        <FlatList
          data={accuserIds}
          keyExtractor={(id) => id}
          renderItem={({ item }) => {
            const name =
              group.players.find((p) => p.id === item)?.name ?? "Unknown";
            return (
              <TouchableOpacity
                style={styles.opponentRow}
                onPress={() => handlePickOpponent(item)}
                disabled={invoking}
              >
                <Text style={styles.opponentRowText}>{name}</Text>
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setShowOpponentPicker(false)}
          disabled={invoking}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: flashAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ["#0D0D0D", "#2A0000"],
          }),
        },
      ]}
    >
      <Text style={styles.verdictTag}>🔨 GUILTY VERDICT</Text>
      <Text style={styles.title}>⚡ Emergency Defusal</Text>

      {isAccused ? (
        <>
          <Text style={styles.subtitle}>
            The group voted — that pass didn't hold up. Cut a wire, or stake a
            Trial by Combat ticket and fight your way out.
          </Text>
          <View style={styles.wireContainer}>
            <TouchableOpacity
              style={[styles.wire, styles.wireRed]}
              onPress={() => handleCut("red")}
              disabled={cutting}
            >
              <Text style={styles.wireText}>🔴</Text>
              <Text style={styles.wireLabelText}>CUT RED</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wire, styles.wireBlue]}
              onPress={() => handleCut("blue")}
              disabled={cutting}
            >
              <Text style={styles.wireText}>🔵</Text>
              <Text style={styles.wireLabelText}>CUT BLUE</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.tbcBtn, myTbcTickets <= 0 && styles.tbcBtnDisabled]}
            onPress={() => setShowOpponentPicker(true)}
            disabled={cutting || myTbcTickets <= 0}
          >
            <Text style={styles.tbcBtnText}>
              ⚔️ Trial by Combat ({myTbcTickets} ticket
              {myTbcTickets === 1 ? "" : "s"})
            </Text>
          </TouchableOpacity>
          {myTbcTickets <= 0 && (
            <Text style={styles.tbcHint}>
              No tickets — grab one from The Alley
            </Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>
            {accusedName} got called out — cutting a wire, or about to pick
            someone for Trial by Combat.
          </Text>
          <Text style={styles.watchingEmoji}>👀</Text>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0D0D0D",
  },
  verdictTag: {
    color: "#E63946",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  wireContainer: { flexDirection: "row", gap: 20, marginBottom: 20 },
  wire: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
  },
  wireRed: { backgroundColor: "#3A0000", borderColor: "#FF0000" },
  wireBlue: { backgroundColor: "#00003A", borderColor: "#0000FF" },
  wireText: { fontSize: 32, marginBottom: 4 },
  wireLabelText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  watchingEmoji: { fontSize: 64, marginTop: 8 },
  resultEmoji: { fontSize: 80, marginBottom: 16 },
  resultTitle: { fontSize: 30, fontWeight: "bold", marginBottom: 10 },
  resultSubtitle: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  continueBtn: {
    backgroundColor: "#FF4500",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  continueBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  waitingText: { color: "#888", fontSize: 13 },

  tbcBtn: {
    backgroundColor: "#2A1A00",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 1.5,
    borderColor: "#FFD700",
  },
  tbcBtnDisabled: { opacity: 0.35, borderColor: "#555" },
  tbcBtnText: { color: "#FFD700", fontSize: 14, fontWeight: "700" },
  tbcHint: { color: "#555", fontSize: 11, marginTop: 8 },

  opponentRow: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
    width: "100%",
  },
  opponentRowText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  backBtn: { marginTop: 10, padding: 10 },
  backBtnText: { color: "#888", fontSize: 13, fontWeight: "600" },
});
