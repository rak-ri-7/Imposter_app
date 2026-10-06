import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../../../App";
import { words } from "../data/words";
import {
  getLocalSession,
  updateLocalScores,
} from "../../../shared/utils/localSession";

type Props = {
  navigation: NativeStackNavigationProp<
    RootStackParamList,
    "ImposterQuickPlay"
  >;
};

type Player = {
  name: string;
  isImposter: boolean;
  hasVoted: boolean;
  votedFor: string | null;
};

type Phase =
  | "setup"
  | "loading"
  | "cover"
  | "reveal"
  | "describe-cover"
  | "describe"
  | "vote-cover"
  | "vote"
  | "imposter-guess-cover"
  | "imposter-guess"
  | "result";

const pickRandomWord = (): string => {
  const allWords = Object.values(words).flat();
  return allWords[Math.floor(Math.random() * allWords.length)];
};

export default function ImposterPassThePhoneScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [playerNames, setPlayerNames] = useState<string[]>(["", ""]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [word, setWord] = useState("");
  const [imposterIndex, setImposterIndex] = useState(-1);
  const [timer, setTimer] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [imposterGuess, setImposterGuess] = useState("");
  const [imposterGuessCorrect, setImposterGuessCorrect] = useState<
    boolean | null
  >(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            handleDescribeDone();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  useEffect(() => {
    loadSessionAndStart();
  }, []);

  const loadSessionAndStart = async () => {
    const session = await getLocalSession();
    if (!session || session.players.length < 2) {
      Alert.alert("No session found", "Please set up players first.");
      navigation.goBack();
      return;
    }
    initGame(session.players.map((p) => p.name));
  };

  const initGame = (validNames: string[]) => {
    const selectedWord = pickRandomWord();
    const selectedImposterIndex = Math.floor(Math.random() * validNames.length);

    const initialPlayers: Player[] = validNames.map((name) => ({
      name,
      isImposter: false,
      hasVoted: false,
      votedFor: null,
    }));
    initialPlayers[selectedImposterIndex].isImposter = true;

    setWord(selectedWord);
    setImposterIndex(selectedImposterIndex);
    setPlayers(initialPlayers);
    setCurrentIndex(0);
    goToPhase("cover");
  };

  const fadeIn = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  const goToPhase = (p: Phase) => {
    setPhase(p);
    fadeIn();
  };

  const addPlayer = () => {
    if (playerNames.length >= 8) return;
    setPlayerNames([...playerNames, ""]);
  };

  const removePlayer = (index: number) => {
    if (playerNames.length <= 2) return;
    setPlayerNames(playerNames.filter((_, i) => i !== index));
  };

  const updatePlayerName = (index: number, name: string) => {
    const updated = [...playerNames];
    updated[index] = name;
    setPlayerNames(updated);
  };

  const handleStartGame = () => {
    const validNames = playerNames
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (validNames.length < 2) {
      return Alert.alert("Need at least 2 players");
    }
    const hasDuplicates = new Set(validNames).size !== validNames.length;
    if (hasDuplicates) {
      return Alert.alert("Player names must be unique");
    }

    const selectedWord = pickRandomWord();
    const selectedImposterIndex = Math.floor(Math.random() * validNames.length);

    const initialPlayers: Player[] = validNames.map((name) => ({
      name,
      isImposter: false,
      hasVoted: false,
      votedFor: null,
    }));
    initialPlayers[selectedImposterIndex].isImposter = true;

    setWord(selectedWord);
    setImposterIndex(selectedImposterIndex);
    setPlayers(initialPlayers);
    setCurrentIndex(0);
    goToPhase("cover");
  };

  const handleReveal = () => {
    goToPhase("reveal");
  };

  const handleRevealDone = () => {
    const next = currentIndex + 1;
    if (next >= players.length) {
      setCurrentIndex(0);
      goToPhase("describe-cover");
    } else {
      setCurrentIndex(next);
      goToPhase("cover");
    }
  };

  const handleDescribeStart = () => {
    setTimer(30);
    setTimerRunning(true);
    goToPhase("describe");
  };

  const handleDescribeDone = () => {
    clearInterval(timerRef.current);
    setTimerRunning(false);
    const next = currentIndex + 1;
    if (next >= players.length) {
      setCurrentIndex(0);
      goToPhase("vote-cover");
    } else {
      setCurrentIndex(next);
      goToPhase("describe-cover");
    }
  };

  const handleVote = async (suspectName: string) => {
    if (suspectName === players[currentIndex].name) {
      return Alert.alert("You can't vote for yourself!");
    }
    const updatedPlayers = [...players];
    updatedPlayers[currentIndex].votedFor = suspectName;
    updatedPlayers[currentIndex].hasVoted = true;
    setPlayers(updatedPlayers);

    const next = currentIndex + 1;
    if (next >= players.length) {
      // all votes cast — check if imposter was caught
      const voteCounts: Record<string, number> = {};
      updatedPlayers.forEach((p) => {
        if (p.votedFor) {
          voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
        }
      });
      const mostVoted = Object.entries(voteCounts).sort(
        (a, b) => b[1] - a[1],
      )[0];
      const mostVotedName = mostVoted ? mostVoted[0] : null;
      const caught = mostVotedName === imposterName;

      if (caught) {
        goToPhase("imposter-guess-cover");
      } else {
        await writeScores(false);
        goToPhase("result");
      }
    } else {
      setCurrentIndex(next);
      goToPhase("vote-cover");
    }
  };

  const handleImposterGuess = async () => {
    if (!imposterGuess.trim()) {
      return Alert.alert("Enter your guess first!");
    }
    const correct =
      imposterGuess.trim().toLowerCase() === word.trim().toLowerCase();
    setImposterGuessCorrect(correct);
    await writeScores(true, correct);
    goToPhase("result");
  };

  const calculateWinner = () => {
    const voteCounts: Record<string, number> = {};
    players.forEach((p) => {
      if (p.votedFor) {
        voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
      }
    });
    const mostVoted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0];
    return mostVoted ? mostVoted[0] : null;
  };

  const imposterName = players[imposterIndex]?.name ?? "";
  const mostVotedName = calculateWinner();
  const caughtCorrectly = mostVotedName === imposterName;

  const handlePlayAgain = async () => {
    const session = await getLocalSession();
    if (!session) return;
    setImposterGuess("");
    setImposterGuessCorrect(null);
    initGame(session.players.map((p) => p.name));
  };

  const POINTS = {
    PLAYER_WIN: 1,
    IMPOSTER_ESCAPE: 1,
    IMPOSTER_GUESS: 1,
  };

  const writeScores = async (
    caughtCorrectly: boolean,
    guessedCorrectly?: boolean,
  ) => {
    const pointsMap: Record<string, number> = {};
    if (caughtCorrectly) {
      players.forEach((p) => {
        if (!p.isImposter) {
          pointsMap[p.name] = POINTS.PLAYER_WIN;
        }
      });
      if (guessedCorrectly) {
        pointsMap[imposterName] = POINTS.IMPOSTER_GUESS;
      }
    } else {
      pointsMap[imposterName] = POINTS.IMPOSTER_ESCAPE;
    }
    await updateLocalScores(pointsMap);
  };
  // SETUP PHASE
  if (phase === "loading") {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator size="large" color="#E63946" />
      </View>
    );
  }
  // if (phase === "setup") {
  //   return (
  //     <View style={styles.container}>
  //       <TouchableOpacity
  //         style={styles.backBtn}
  //         onPress={() => navigation.goBack()}
  //       >
  //         <Text style={styles.backText}>← Back</Text>
  //       </TouchableOpacity>

  //       <Text style={styles.title}>🕵️ Imposter</Text>
  //       <Text style={styles.subtitle}>Pass the Phone Mode</Text>
  //       <Text style={styles.sectionLabel}>ENTER PLAYER NAMES</Text>

  //       <ScrollView
  //         style={styles.nameList}
  //         showsVerticalScrollIndicator={false}
  //       >
  //         {playerNames.map((name, index) => (
  //           <View key={index} style={styles.nameRow}>
  //             <View style={styles.nameAvatar}>
  //               <Text style={styles.nameAvatarText}>{index + 1}</Text>
  //             </View>
  //             <TextInput
  //               style={styles.nameInput}
  //               placeholder={`Player ${index + 1}`}
  //               placeholderTextColor="#888"
  //               value={name}
  //               onChangeText={(text) => updatePlayerName(index, text)}
  //               maxLength={16}
  //             />
  //             {playerNames.length > 2 && (
  //               <TouchableOpacity onPress={() => removePlayer(index)}>
  //                 <Text style={styles.removeBtn}>✕</Text>
  //               </TouchableOpacity>
  //             )}
  //           </View>
  //         ))}

  //         {playerNames.length < 8 && (
  //           <TouchableOpacity style={styles.addPlayerBtn} onPress={addPlayer}>
  //             <Text style={styles.addPlayerText}>+ Add Player</Text>
  //           </TouchableOpacity>
  //         )}
  //       </ScrollView>

  //       <TouchableOpacity style={styles.startBtn} onPress={handleStartGame}>
  //         <Text style={styles.startBtnText}>Start Game →</Text>
  //       </TouchableOpacity>
  //     </View>
  //   );
  // }

  // COVER SCREEN — shown before each private reveal
  if (phase === "cover") {
    return (
      <Animated.View
        style={[styles.container, styles.coverContainer, { opacity: fadeAnim }]}
      >
        <Text style={styles.coverEmoji}>📱</Text>
        <Text style={styles.coverTitle}>Pass the phone to</Text>
        <Text style={styles.coverName}>{players[currentIndex]?.name}</Text>
        <Text style={styles.coverHint}>Make sure nobody else is looking!</Text>
        <TouchableOpacity style={styles.readyBtn} onPress={handleReveal}>
          <Text style={styles.readyBtnText}>I'm ready, show my role →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => navigation.replace("QuickPlay")}
        >
          <Text style={styles.menuBtnText}>Back to Menu</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ROLE REVEAL — private per player
  if (phase === "reveal") {
    const currentPlayer = players[currentIndex];
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <Text style={styles.revealGreeting}>Hey {currentPlayer.name}!</Text>

        {currentPlayer.isImposter ? (
          <View style={styles.roleBox}>
            <Text style={styles.roleEmoji}>🕵️</Text>
            <Text style={styles.roleLabel}>YOU ARE THE</Text>
            <Text style={[styles.roleName, { color: "#E63946" }]}>
              IMPOSTER
            </Text>
            <Text style={styles.roleHint}>
              You don't know the word.{"\n"}
              Listen to others and blend in!{"\n"}
              Try to guess the word from clues.
            </Text>
          </View>
        ) : (
          <View style={styles.roleBox}>
            <Text style={styles.roleEmoji}>👤</Text>
            <Text style={styles.roleLabel}>YOU ARE A</Text>
            <Text style={[styles.roleName, { color: "#4CAF50" }]}>PLAYER</Text>
            <View style={styles.wordBox}>
              <Text style={styles.wordLabel}>THE WORD IS</Text>
              <Text style={styles.wordText}>{word}</Text>
            </View>
            <Text style={styles.roleHint}>
              Describe it without saying the word directly.{"\n"}
              Find the imposter!
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.doneBtn} onPress={handleRevealDone}>
          <Text style={styles.doneBtnText}>Got it! Pass the phone →</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // DESCRIBE COVER — shown before each describe turn
  if (phase === "describe-cover") {
    return (
      <Animated.View
        style={[styles.container, styles.coverContainer, { opacity: fadeAnim }]}
      >
        <Text style={styles.coverEmoji}>🎤</Text>
        <Text style={styles.coverTitle}>Pass the phone to</Text>
        <Text style={styles.coverName}>{players[currentIndex]?.name}</Text>
        <Text style={styles.coverHint}>
          You have 30 seconds to describe the word!
        </Text>
        <TouchableOpacity style={styles.readyBtn} onPress={handleDescribeStart}>
          <Text style={styles.readyBtnText}>Start my timer →</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // DESCRIBE PHASE — timer counts down
  if (phase === "describe") {
    const isUrgent = timer <= 10;
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <Text style={styles.describeTitle}>
          {players[currentIndex]?.name}'s turn
        </Text>

        <View
          style={[styles.timerCircle, isUrgent && styles.timerCircleUrgent]}
        >
          <Text style={[styles.timerText, isUrgent && styles.timerTextUrgent]}>
            {timer}
          </Text>
          <Text style={styles.timerSec}>sec</Text>
        </View>

        {players[currentIndex]?.isImposter ? (
          <Text style={styles.describeHint}>
            You don't know the word!{"\n"}
            Give a vague but convincing clue 😈
          </Text>
        ) : (
          <View style={styles.wordPeekBox}>
            <Text style={styles.wordPeekLabel}>The word is</Text>
            <Text style={styles.wordPeekText}>{word}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.doneBtn} onPress={handleDescribeDone}>
          <Text style={styles.doneBtnText}>Done describing →</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // VOTE COVER — shown before each vote
  if (phase === "vote-cover") {
    return (
      <Animated.View
        style={[styles.container, styles.coverContainer, { opacity: fadeAnim }]}
      >
        <Text style={styles.coverEmoji}>🗳️</Text>
        <Text style={styles.coverTitle}>Pass the phone to</Text>
        <Text style={styles.coverName}>{players[currentIndex]?.name}</Text>
        <Text style={styles.coverHint}>
          Time to vote! Who do you think is the imposter?
        </Text>
        <TouchableOpacity
          style={styles.readyBtn}
          onPress={() => goToPhase("vote")}
        >
          <Text style={styles.readyBtnText}>Cast my vote →</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // IMPOSTER GUESS COVER
  if (phase === "imposter-guess-cover") {
    return (
      <Animated.View
        style={[styles.container, styles.coverContainer, { opacity: fadeAnim }]}
      >
        <Text style={styles.coverEmoji}>🕵️</Text>
        <Text style={styles.coverTitle}>Pass the phone to</Text>
        <Text style={styles.coverName}>{imposterName}</Text>
        <Text style={styles.coverHint}>
          You were caught!{"\n"}
          Guess the word to steal the win!
        </Text>
        <TouchableOpacity
          style={styles.readyBtn}
          onPress={() => goToPhase("imposter-guess")}
        >
          <Text style={styles.readyBtnText}>I'm ready →</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // IMPOSTER GUESS PHASE
  if (phase === "imposter-guess") {
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <Text style={styles.voteTitle}>What's the word, {imposterName}?</Text>
        <Text style={styles.voteSubtitle}>
          You were caught! Guess the word correctly to steal the win.
        </Text>

        <View style={styles.guessBox}>
          <TextInput
            style={styles.guessInput}
            placeholder="Type your guess..."
            placeholderTextColor="#888"
            value={imposterGuess}
            onChangeText={setImposterGuess}
            autoCapitalize="none"
            autoFocus
          />
          <TouchableOpacity
            style={styles.guessBtn}
            onPress={handleImposterGuess}
          >
            <Text style={styles.guessBtnText}>Submit Guess →</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.guessHint}>
          Listen back to everyone's clues...{"\n"}what do you think the word
          was?
        </Text>
      </Animated.View>
    );
  }

  // VOTE PHASE
  if (phase === "vote") {
    const currentPlayer = players[currentIndex];
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <Text style={styles.voteTitle}>
          {currentPlayer.name}, who is the imposter?
        </Text>
        <Text style={styles.voteSubtitle}>Tap to vote</Text>

        <ScrollView style={styles.voteList}>
          {players.map((player) => {
            const isSelf = player.name === currentPlayer.name;
            return (
              <TouchableOpacity
                key={player.name}
                style={[styles.voteRow, isSelf && styles.voteRowSelf]}
                onPress={() => handleVote(player.name)}
                disabled={isSelf}
              >
                <View style={styles.voteAvatar}>
                  <Text style={styles.voteAvatarText}>
                    {player.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.votePlayerName}>{player.name}</Text>
                {isSelf && <Text style={styles.selfTag}>you</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
    );
  }

  // RESULT PHASE
  if (phase === "result") {
    const voteCounts: Record<string, number> = {};
    players.forEach((p) => {
      if (p.votedFor) {
        voteCounts[p.votedFor] = (voteCounts[p.votedFor] || 0) + 1;
      }
    });

    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <Text style={styles.resultEmoji}>{caughtCorrectly ? "🎉" : "😈"}</Text>
        <Text style={styles.resultTitle}>
          {!caughtCorrectly
            ? "Imposter wins!"
            : imposterGuessCorrect
              ? "Imposter steals the win!"
              : "Players win!"}
        </Text>
        <Text style={styles.resultSubtitle}>
          {!caughtCorrectly
            ? "The imposter fooled everyone!"
            : imposterGuessCorrect
              ? "Caught but guessed the word correctly!"
              : "The imposter was found out!"}
        </Text>

        <View style={styles.resultCard}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>THE IMPOSTER WAS</Text>
            <Text style={styles.resultValue}>{imposterName} 🕵️</Text>
            {imposterGuessCorrect !== null && (
              <Text
                style={[
                  styles.guessResult,
                  imposterGuessCorrect
                    ? styles.guessCorrect
                    : styles.guessWrong,
                ]}
              >
                {imposterGuessCorrect
                  ? `✓ Guessed correctly: "${imposterGuess}"`
                  : `✗ Wrong guess: "${imposterGuess}"`}
              </Text>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>THE WORD WAS</Text>
            <Text style={[styles.resultValue, { color: "#FFD700" }]}>
              {word}
            </Text>
          </View>
          <View style={styles.divider} />

          <Text style={styles.votesTitle}>VOTES</Text>
          {players.map((player) => {
            const count = voteCounts[player.name] || 0;
            const isImposter = player.name === imposterName;
            return (
              <View key={player.name} style={styles.voteResultRow}>
                <Text style={styles.voteResultName}>
                  {player.name}
                  {isImposter ? " 🕵️" : ""}
                </Text>
                <View style={styles.voteResultBar}>
                  <View
                    style={[
                      styles.voteResultFill,
                      {
                        width: `${(count / players.length) * 100}%`,
                        backgroundColor: isImposter ? "#E63946" : "#0F3460",
                      },
                    ]}
                  />
                </View>
                <Text style={styles.voteResultCount}>{count}</Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={handlePlayAgain}>
          <Text style={styles.startBtnText}>Play Again 🎮</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => navigation.replace("QuickPlay")}
        >
          <Text style={styles.menuBtnText}>Back to Menu</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    padding: 24,
    paddingTop: 60,
  },
  backBtn: {
    marginBottom: 16,
  },
  backText: {
    color: "#888",
    fontSize: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#FFD700",
    textAlign: "center",
    marginBottom: 28,
    letterSpacing: 1,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
  },
  nameList: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  nameAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  nameAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  nameInput: {
    flex: 1,
    backgroundColor: "#16213E",
    color: "#fff",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  removeBtn: {
    color: "#E63946",
    fontSize: 16,
    padding: 4,
  },
  addPlayerBtn: {
    borderWidth: 1,
    borderColor: "#0F3460",
    borderRadius: 10,
    borderStyle: "dashed",
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  addPlayerText: {
    color: "#888",
    fontSize: 14,
  },
  startBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 16,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  coverContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  coverEmoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  coverTitle: {
    color: "#888",
    fontSize: 16,
    marginBottom: 8,
  },
  coverName: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  coverHint: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 20,
  },
  readyBtn: {
    backgroundColor: "#E63946",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    width: "100%",
  },
  readyBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  revealGreeting: {
    color: "#888",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  roleBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  roleEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  roleLabel: {
    color: "#888",
    fontSize: 12,
    letterSpacing: 3,
    marginBottom: 8,
  },
  roleName: {
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: 4,
    marginBottom: 24,
  },

  guessBox: {
    backgroundColor: "#16213E",
    borderRadius: 16,
    padding: 20,
    marginTop: 32,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  guessInput: {
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    padding: 14,
    color: "#fff",
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  guessBtn: {
    backgroundColor: "#FFD700",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  guessBtnText: {
    color: "#1A1A2E",
    fontWeight: "bold",
    fontSize: 15,
  },
  guessHint: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 22,
  },
  guessResult: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  guessCorrect: {
    color: "#4CAF50",
  },
  guessWrong: {
    color: "#E63946",
  },
  wordBox: {
    backgroundColor: "#16213E",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#4CAF50",
    width: "100%",
  },
  wordLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  wordText: {
    color: "#4CAF50",
    fontSize: 32,
    fontWeight: "bold",
  },
  roleHint: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 22,
  },
  doneBtn: {
    backgroundColor: "#16213E",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E63946",
  },
  doneBtnText: {
    color: "#E63946",
    fontSize: 16,
    fontWeight: "600",
  },
  describeTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 32,
  },
  timerCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: "#4CAF50",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 32,
  },
  timerCircleUrgent: {
    borderColor: "#E63946",
  },
  timerText: {
    color: "#4CAF50",
    fontSize: 48,
    fontWeight: "bold",
  },
  timerTextUrgent: {
    color: "#E63946",
  },
  timerSec: {
    color: "#888",
    fontSize: 14,
  },
  describeHint: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  wordPeekBox: {
    backgroundColor: "#16213E",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "#0F3460",
  },
  wordPeekLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  wordPeekText: {
    color: "#FFD700",
    fontSize: 24,
    fontWeight: "bold",
  },
  voteTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  voteSubtitle: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 24,
  },
  voteList: {
    flex: 1,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16213E",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  voteRowSelf: {
    opacity: 0.4,
  },
  voteAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0F3460",
    alignItems: "center",
    justifyContent: "center",
  },
  voteAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  votePlayerName: {
    color: "#fff",
    fontSize: 16,
    flex: 1,
  },
  selfTag: {
    color: "#888",
    fontSize: 12,
  },
  resultEmoji: {
    fontSize: 64,
    textAlign: "center",
    marginBottom: 12,
  },
  resultTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  resultSubtitle: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  resultCard: {
    flex: 1,
    backgroundColor: "#16213E",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  resultRow: {
    alignItems: "center",
    marginBottom: 16,
  },
  resultLabel: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  resultValue: {
    color: "#E63946",
    fontSize: 24,
    fontWeight: "bold",
  },
  divider: {
    height: 0.5,
    backgroundColor: "#0F3460",
    marginVertical: 12,
  },
  votesTitle: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 12,
  },
  voteResultRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  voteResultName: {
    color: "#fff",
    fontSize: 13,
    width: 80,
  },
  voteResultBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#0F3460",
    borderRadius: 4,
    overflow: "hidden",
  },
  voteResultFill: {
    height: 8,
    borderRadius: 4,
  },
  voteResultCount: {
    color: "#888",
    fontSize: 13,
    width: 20,
    textAlign: "right",
  },
  menuBtn: {
    alignItems: "center",
    padding: 14,
    marginTop: 8,
  },
  menuBtnText: {
    color: "#888",
    fontSize: 15,
  },
});
