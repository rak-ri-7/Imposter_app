import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from "react-native";
import { Group, ImposterGameState } from "../../../shared/types";
import { useImposterGame } from "../logic/useImposterGame";
import { imposterGuess } from "../logic/game";

type Props = {
  group: Group;
  playerId: string;
};

export default function VoteScreen({ group, playerId }: Props) {
  const {
    isHost,
    isImposter,
    allVoted,
    handleVote,
    handleEliminate,
    votingRound,
    activePlayers,
  } = useImposterGame(group, playerId);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const gameState = group.gameState as ImposterGameState;

  useEffect(() => {
    setMyVote(gameState.votes[playerId] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.votes, votingRound]);

  const amEliminated = gameState.eliminatedPlayers.includes(playerId);

  const onVote = async (suspectId: string) => {
    if (myVote) return Alert.alert("You already voted!");
    if (suspectId === playerId)
      return Alert.alert("You can't vote for yourself!");
    await handleVote(suspectId);
  };

  const onEliminate = async () => {
    if (!allVoted) {
      return Alert.alert(
        "Not everyone has voted yet!",
        "Wait for all players to vote before revealing.",
      );
    }
    await handleEliminate();
  };

  const handleGuess = async () => {
    if (!guess.trim()) return;
    await imposterGuess(group.id, guess, gameState.word);
  };

  const voteCounts: Record<string, number> = {};
  Object.values(gameState.votes).forEach((id) => {
    voteCounts[id] = (voteCounts[id] || 0) + 1;
  });

  const totalVotes = Object.keys(gameState.votes).length;
  const activePlayerCount = activePlayers.length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🗳️ Vote</Text>
      <Text style={styles.subtitle}>
        Round {votingRound} of {gameState.settings.imposterCount} — there{" "}
        {gameState.settings.imposterCount === 1 ? "is" : "are"}{" "}
        {gameState.settings.imposterCount} imposter
        {gameState.settings.imposterCount > 1 ? "s" : ""} among you
      </Text>

      <View style={styles.voteProgress}>
        <Text style={styles.voteProgressText}>
          {totalVotes} / {activePlayerCount} voted
        </Text>
        <View style={styles.voteBar}>
          <View
            style={[
              styles.voteBarFill,
              { width: `${(totalVotes / activePlayerCount) * 100}%` },
            ]}
          />
        </View>
      </View>

      <View style={styles.playerList}>
        {activePlayers.map((player) => {
          const isMe = player.id === playerId;
          const votedForThis = myVote === player.id;
          const voteCount = voteCounts[player.id] || 0;

          return (
            <TouchableOpacity
              key={player.id}
              style={[
                styles.playerRow,
                votedForThis && styles.playerRowVoted,
                isMe && styles.playerRowSelf,
              ]}
              onPress={() => onVote(player.id)}
              disabled={!!myVote || isMe}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {player.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.playerName}>
                {player.name}
                {isMe ? " (you)" : ""}
              </Text>
              {voteCount > 0 && (
                <View style={styles.voteCountBadge}>
                  <Text style={styles.voteCountText}>
                    {voteCount} {voteCount === 1 ? "vote" : "votes"}
                  </Text>
                </View>
              )}
              {votedForThis && (
                <View style={styles.myVoteBadge}>
                  <Text style={styles.myVoteText}>Your vote</Text>
                </View>
              )}
              {!myVote && !isMe && (
                <Text style={styles.tapHint}>Tap to vote</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {amEliminated && (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            You've been eliminated — watch how the rest plays out
          </Text>
        </View>
      )}

      {!myVote && !amEliminated && (
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Tap a player to vote them as the imposter
          </Text>
        </View>
      )}

      {myVote && !isHost && (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>
            Vote submitted! Waiting for others...
          </Text>
        </View>
      )}

      {isImposter && amEliminated && !gameState.imposterGuess && (
        <View style={styles.guessBox}>
          <Text style={styles.guessLabel}>
            You were caught! Guess the word to steal the win:
          </Text>
          <TextInput
            style={styles.guessInput}
            placeholder="Type your guess..."
            placeholderTextColor="#888"
            value={guess}
            onChangeText={setGuess}
          />
          <TouchableOpacity style={styles.guessBtn} onPress={handleGuess}>
            <Text style={styles.guessBtnText}>Submit Guess</Text>
          </TouchableOpacity>
        </View>
      )}

      {isHost && (
        <TouchableOpacity
          style={[styles.revealBtn, !allVoted && styles.revealBtnDisabled]}
          onPress={onEliminate}
        >
          <Text style={styles.revealBtnText}>
            {allVoted
              ? "Eliminate most voted player →"
              : `Waiting for votes... (${totalVotes}/${activePlayerCount})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 18,
  },
  voteProgress: { marginBottom: 24 },
  voteProgressText: {
    color: "#888",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "center",
  },
  voteBar: {
    height: 4,
    backgroundColor: "#16213E",
    borderRadius: 2,
    overflow: "hidden",
  },
  voteBarFill: { height: 4, backgroundColor: "#E63946", borderRadius: 2 },
  playerList: { flex: 1, gap: 10 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16213E",
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  playerRowVoted: { borderColor: "#E63946", backgroundColor: "#1E1028" },
  playerRowSelf: { opacity: 0.4 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  playerName: { color: "#fff", fontSize: 16, flex: 1 },
  voteCountBadge: {
    backgroundColor: "#E63946",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  voteCountText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  myVoteBadge: {
    backgroundColor: "#2D0A0E",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#E63946",
  },
  myVoteText: { color: "#E63946", fontSize: 12 },
  tapHint: { color: "#444", fontSize: 12 },
  hintBox: { padding: 16, alignItems: "center" },
  hintText: { color: "#888", fontSize: 13, textAlign: "center" },
  waitingBox: { padding: 16, alignItems: "center" },
  waitingText: { color: "#4CAF50", fontSize: 14, textAlign: "center" },
  guessBox: {
    backgroundColor: "#16213E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  guessLabel: {
    color: "#FFD700",
    fontSize: 13,
    marginBottom: 10,
    textAlign: "center",
  },
  guessInput: {
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  guessBtn: {
    backgroundColor: "#FFD700",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  guessBtnText: { color: "#1A1A2E", fontWeight: "bold", fontSize: 15 },
  revealBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  revealBtnDisabled: {
    backgroundColor: "#3A1A1E",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  revealBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
