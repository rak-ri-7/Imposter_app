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
import { Group, BombGameState } from "../../../shared/types";
import {
  lockInWire,
  resolvePanicOutcome,
  startPanicCountdown,
  endGhostWindow,
  passBomb,
  forceEndRound,
  placeBet,
  computePanicRemaining,
  declineBet,
  PANIC_THRESHOLD,
  FAILSAFE_GRACE_MS,
  FAILSAFE_RETRY_MS,
  GHOST_WINDOW_MAX_MS,
  GHOST_WINDOW_MIN_MS,
  activateWireRevealer,
} from "../logic/game";
import {
  playSound,
  pickPanicStartSound,
  pickGhostPresenceSound,
  stopSound,
} from "../../../shared/sounds/soundManager";

type Props = {
  group: Group;
  playerId: string;
};

// Shown on every phone that isn't currently deciding a bet. Deliberately
// neutral: nothing on it hints whether a ghost is lurking. Each phone
// shuffles its own order, so neighbours see different lines.
const PREP_LINES: { emoji: string; text: string }[] = [
  { emoji: "🧰", text: "Bribing the bomb squad with samosas" },
  { emoji: "📖", text: "Finding the manual. It's in Swedish" },
  { emoji: "💣", text: "Asking the bomb how its day was" },
  { emoji: "✂️", text: "Warming up the pliers" },
  { emoji: "🔢", text: "Counting the wires. Still two. Probably" },
  { emoji: "🧶", text: "Untangling the red from the blue" },
  { emoji: "🐈", text: "Asking the cat to leave the room" },
  { emoji: "📜", text: "Reading the terms and conditions" },
  { emoji: "🎬", text: "Rehearsing a slow-motion walk away" },
  { emoji: "📞", text: "Putting the bomb on speakerphone" },
  { emoji: "🔮", text: "Checking the bomb's horoscope" },
  { emoji: "🧤", text: "Wiping fingerprints off the detonator" },
  { emoji: "🎻", text: "Cueing the dramatic music" },
  { emoji: "🙏", text: "Saying a small prayer to the wire gods" },
  { emoji: "🥤", text: "Fetching snacks for the aftermath" },
  { emoji: "🪫", text: "Charging the suspense meter" },
];

const PREP_LINE_MS = 1800;

const shuffled = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Three dots that bounce one after another, like someone typing.
function WaitingDots() {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        150,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(d, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.delay(300),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.dotsRow}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              opacity: d.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
              transform: [
                {
                  translateY: d.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -8],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

// Neutral "getting ready" screen: a quirky line that cross-fades to a new
// one every couple of seconds, with the bouncing dots underneath.
function PrepOverlay({ subtitle }: { subtitle?: string }) {
  const [lines] = useState(() => shuffled(PREP_LINES));
  const [index, setIndex] = useState(0);
  const [fade] = useState(new Animated.Value(1));

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setIndex((i) => (i + 1) % lines.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }, PREP_LINE_MS);
    return () => clearInterval(interval);
  }, []);

  const line = lines[index];
  return (
    <View style={[styles.overlay, styles.overlayPrep]}>
      <Animated.View style={{ opacity: fade, alignItems: "center" }}>
        <Text style={styles.overlayEmoji}>{line.emoji}</Text>
        <Text style={styles.overlayTitle}>{line.text}</Text>
      </Animated.View>
      <WaitingDots />
      {!!subtitle && <Text style={styles.overlaySubtitle}>{subtitle}</Text>}
    </View>
  );
}

function TypewriterText({ text, style }: { text: string; style?: any }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [text]);
  return <Text style={style}>{shown}</Text>;
}

export default function BombPanicScreen({ group, playerId }: Props) {
  const gameState = group.gameState as BombGameState;
  const isHolder = gameState.currentHolderId === playerId;
  const isHost = group.hostId === playerId;
  const isGhost = gameState.ghosts.includes(playerId);
  const [locking, setLocking] = useState(false);
  const [passing, setPassing] = useState(false);
  const [betting, setBetting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(PANIC_THRESHOLD);
  const [flashAnim] = useState(new Animated.Value(0));
  const holderName =
    group.players.find((p) => p.id === gameState.currentHolderId)?.name ??
    "Someone";

  // Latest snapshot, read by the watchdog's interval without restarting it.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const groupLatestRef = useRef(group);
  groupLatestRef.current = group;

  const [clingyRemaining, setClingyRemaining] = useState(0);
  const isClingyLocked =
    gameState.clingy?.holderId === playerId && clingyRemaining > 0;
  const lastAlertedClingyUntilRef = useRef<number | null>(null);

  // ── PANIC STAGES ────────────────────────────────────────────────
  // 1. Ghost window — ghosts with a ticket decide privately. Everyone
  //    else sees the neutral "getting the room ready" screen.
  // 2. Ghost reveal — ONLY if at least one ghost accepted. Everyone
  //    except the accepting ghosts sees the eerie intro; the accepting
  //    ghosts see the neutral screen. Same fixed length on every phone.
  // 3. Countdown — the real 5 seconds, identical everywhere.
  // If no ghost accepts, stage 2 is skipped and nobody learns a ghost
  // was ever asked.
  const inGhostWindow = !!gameState.ghostWindowEndsAt;
  const inGhostReveal =
    !gameState.ghostWindowEndsAt &&
    !gameState.panicStartedAt &&
    !!gameState.ghostRevealEndsAt;
  const countdownRunning =
    !gameState.ghostWindowEndsAt && !!gameState.panicStartedAt;

  const [ghostWindowRemaining, setGhostWindowRemaining] = useState(0);
  const myBet = gameState.activeBets?.[playerId];
  const myBettingTickets = gameState.bettingTickets?.[playerId] ?? 0;
  const myResponded = (gameState.ghostResponded ?? []).includes(playerId);
  const acceptedGhostCount = Object.keys(gameState.activeBets ?? {}).length;
  const iCanBet =
    inGhostWindow && isGhost && myBettingTickets > 0 && !myResponded && !myBet;

  const activePlayers = group.players.filter(
    (player) => !gameState.ghosts.includes(player.id),
  );
  const canPassTo = (id: string) =>
    id !== playerId &&
    !gameState.ghosts.includes(id) &&
    !(
      gameState.personalityEffect === "chain" &&
      gameState.chainPassed.includes(id)
    );

  // ── Ghost window countdown — shown only on the betting ghost's prompt.
  useEffect(() => {
    if (!gameState.ghostWindowEndsAt) {
      setGhostWindowRemaining(0);
      return;
    }
    const endsAt = gameState.ghostWindowEndsAt;
    const tick = () => {
      setGhostWindowRemaining(Math.max(0, (endsAt - Date.now()) / 1000));
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [gameState.ghostWindowEndsAt]);

  // ── Panic watchdog — every phone. Moves panic through its stages:
  // ghost window → (ghost reveal, only if someone accepted) → 5s
  // countdown → resolution. The host acts on each deadline; everyone
  // else steps in only if the host is FAILSAFE_GRACE_MS late. Every call
  // is guarded server-side, so an early or duplicate call does nothing.
  useEffect(() => {
    const graceMs = isHost ? 0 : FAILSAFE_GRACE_MS;
    let lastAttempt = 0;

    const attempt = (now: number, action: () => void) => {
      if (now - lastAttempt < FAILSAFE_RETRY_MS) return;
      lastAttempt = now;
      action();
    };

    const check = () => {
      const gs = gameStateRef.current;
      const g = groupLatestRef.current;
      if (gs.phase !== "panic") return;
      const now = Date.now();

      if (gs.ghostWindowEndsAt) {
        // Stage 1: ghost window — the floor if everyone has responded,
        // otherwise the cap. endGhostWindow re-checks the floor itself,
        // so asking early is harmless. It either starts the reveal (a
        // ghost accepted) or goes straight to the countdown (nobody did).
        const eligible = gs.ghosts.filter(
          (id) => (gs.bettingTickets?.[id] ?? 0) > 0,
        );
        const responded = gs.ghostResponded ?? [];
        const allResponded = eligible.every((id) => responded.includes(id));
        const target = allResponded
          ? gs.ghostWindowEndsAt - (GHOST_WINDOW_MAX_MS - GHOST_WINDOW_MIN_MS)
          : gs.ghostWindowEndsAt;
        if (now >= target + graceMs) attempt(now, () => endGhostWindow(g.id));
      } else if (!gs.panicStartedAt) {
        // Stage 2: the ghost reveal has run its course.
        const revealEndsAt = gs.ghostRevealEndsAt ?? 0;
        if (now >= revealEndsAt + graceMs)
          attempt(now, () => startPanicCountdown(g.id));
      } else {
        // Stage 3: the real countdown has run out.
        if (now >= gs.panicStartedAt + PANIC_THRESHOLD * 1000 + graceMs)
          attempt(now, () => resolvePanicOutcome(g));
      }
    };

    check();
    const interval = setInterval(check, 250);
    return () => clearInterval(interval);
  }, [isHost, group.id]);

  // ── Flash — every player, one loop for the whole countdown. Keyed on
  // countdownRunning (not panicStartedAt), so passes during panic don't
  // stack extra loops on the same value. Stopped on unmount. ───────────
  useEffect(() => {
    if (!countdownRunning) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false, // backgroundColor can't use the native driver
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      flashAnim.setValue(0);
    };
  }, [countdownRunning]);

  // ── Buzz — every player, once per countdown start (including the fresh
  // 5s after each pass). Cancelled if the screen leaves mid-buzz. ──────
  useEffect(() => {
    if (!countdownRunning) return;
    Vibration.vibrate([200, 100, 200, 100, 200]);
    return () => Vibration.cancel();
  }, [gameState.panicStartedAt, countdownRunning]);

  // ── Countdown display — every phone computes it locally from
  // panicStartedAt. No host sync, no per-second writes. ────────────────
  useEffect(() => {
    if (!countdownRunning) return;
    const tick = () => setTimeLeft(computePanicRemaining(gameState));
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [countdownRunning, gameState.panicStartedAt]);

  useEffect(() => {
    if (!gameState.clingy || gameState.clingy.holderId !== playerId) {
      setClingyRemaining(0);
      return;
    }
    const clingyTick = () => {
      const remaining = Math.max(
        0,
        (gameState.clingy!.until - Date.now()) / 1000,
      );
      setClingyRemaining(remaining);
    };
    clingyTick();
    const interval = setInterval(clingyTick, 100);
    return () => clearInterval(interval);
  }, [gameState.clingy]);

  useEffect(() => {
    if (
      gameState.clingy &&
      gameState.clingy.holderId === playerId &&
      lastAlertedClingyUntilRef.current !== gameState.clingy.until
    ) {
      lastAlertedClingyUntilRef.current = gameState.clingy.until;
      Alert.alert(
        "Oh no, Clingy Bomb! 🔒",
        `Wrong guess — the bomb clings to you for ${gameState.clingy.penaltySeconds}s. No passing, no cutting, even now!`,
      );
    }
  }, [gameState.clingy, playerId]);

  // ── Sounds ─────────────────────────────────────────────────────────
  // Eerie music only when the reveal actually happens, and not on the
  // accepting ghosts' own phones (they're on the neutral screen).
  useEffect(() => {
    if (gameState.ghostRevealEndsAt && !myBet)
      playSound(pickGhostPresenceSound());
  }, [gameState.ghostRevealEndsAt]);

  useEffect(() => {
    if (!gameState.panicStartedAt || !isHolder) return;
    playSound(pickPanicStartSound());
    return () => {
      stopSound("panic-start1");
      stopSound("panic-start2");
    };
  }, [gameState.panicStartedAt, isHolder]);

  // Bet confirmation sound — only on the ghost's own phone. Playing it
  // everywhere would leak that a ghost accepted before the reveal.
  const hadBetRef = useRef(false);
  useEffect(() => {
    if (myBet && !hadBetRef.current) playSound("ghost-bet-placed");
    hadBetRef.current = !!myBet;
  }, [!!myBet]);

  const handleLockIn = async (wire: "red" | "blue") => {
    if (!isHolder || locking || gameState.wireChoice) return;
    if (isClingyLocked) {
      Alert.alert(
        "Still stuck! 🔒",
        `The bomb won't let you commit for ${Math.ceil(clingyRemaining)}s more.`,
      );
      return;
    }
    setLocking(true);
    try {
      const result = await lockInWire(group, playerId, wire);
      if (result.locked) playSound("wire-lock-in");
      if (result.blocked) {
        Alert.alert(
          "Still stuck! 🔒",
          "The bomb is clingy — try again in a moment.",
        );
      }
    } finally {
      setLocking(false);
    }
  };

  const handlePass = async (toId: string) => {
    if (!isHolder || passing || gameState.wireChoice || !canPassTo(toId))
      return;
    if (isClingyLocked) {
      Alert.alert(
        "Still stuck! 🔒",
        `The bomb won't leave your hands for ${Math.ceil(clingyRemaining)}s more.`,
      );
      return;
    }
    setPassing(true);
    try {
      await passBomb(group, playerId, toId);
    } finally {
      setPassing(false);
    }
  };

  const handleBet = async (wire: "red" | "blue") => {
    if (betting || myBet || myResponded) return;
    setBetting(true);
    try {
      const result = await placeBet(group, playerId, wire);
      if (
        !result.success &&
        !["window-closed", "already-bet"].includes(result.reason ?? "")
      ) {
        Alert.alert("Couldn't place bet", "Try again quickly!");
      }
    } finally {
      setBetting(false);
    }
  };

  const handleDecline = async () => {
    if (betting || myResponded || myBet) return;
    setBetting(true);
    try {
      await declineBet(group, playerId);
    } finally {
      setBetting(false);
    }
  };

  const showBombInfo = () => {
    Alert.alert(gameState.personalityName, gameState.personalityDescription);
  };

  const handleForceEnd = () => {
    Alert.alert(
      "Force end this round?",
      "This skips straight to the replay screen. No lives will be lost or gained — you can start the next round right after.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Round",
          style: "destructive",
          onPress: () => forceEndRound(group),
        },
      ],
    );
  };

  const lockedWire = gameState.wireChoice;

  // ── Wire Revealer ("The Snitch") ──────────────────────────────────
  const myRevealers = gameState.revealerItems?.[playerId] ?? [];
  const myHint = gameState.revealerHints?.[playerId];
  const holderUsedRevealer =
    !!gameState.revealerHints?.[gameState.currentHolderId];
  const [revealing, setRevealing] = useState(false);

  const handleReveal = async () => {
    if (
      !isHolder ||
      revealing ||
      myHint ||
      lockedWire ||
      myRevealers.length === 0
    )
      return;
    setRevealing(true);
    try {
      const result = await activateWireRevealer(group, playerId);
      if (result.success) playSound("wire-lock-in"); // swap for a "whisper" sound if you add one
    } finally {
      setRevealing(false);
    }
  };

  // ── Which full-screen overlay (if any) this phone shows before the
  // countdown starts. ─────────────────────────────────────────────────
  type Overlay =
    | { kind: "bet" }
    | { kind: "intro"; title: string; subtitle: string }
    | { kind: "prep"; subtitle?: string };

  const getOverlay = (): Overlay | null => {
    if (countdownRunning) return null;

    // The betting ghost's private decision.
    if (iCanBet) return { kind: "bet" };

    // The reveal — everyone except the ghosts who accepted.
    if (inGhostReveal && !myBet) {
      const many = acceptedGhostCount > 1;
      return {
        kind: "intro",
        title: many
          ? "The shadows have something to say..."
          : "A spectral shadow looms nearby...",
        subtitle: isHolder
          ? many
            ? "They're circling you now. 👻👻"
            : "It has taken an interest in you. 👻"
          : many
            ? `${acceptedGhostCount} spirits are watching ${holderName}'s hands.`
            : `Something is watching ${holderName}'s hands.`,
      };
    }

    // Everyone else, and the accepting ghosts during the reveal.
    return {
      kind: "prep",
      subtitle: myBet
        ? `Your bet: ${myBet.guessedWire === "red" ? "🔴 RED" : "🔵 BLUE"}`
        : undefined,
    };
  };

  const overlay = getOverlay();

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
      {/* Compact header — stays visible above the overlays */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.warning}>⚠️ FUSE CRITICAL</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {isHolder
              ? lockedWire
                ? "Locked in — holding our breath..."
                : countdownRunning
                  ? "Make your move!"
                  : "Hold tight..."
              : `${holderName} is deciding...`}
          </Text>
        </View>
        <Text
          style={[
            styles.timer,
            countdownRunning && timeLeft <= 2 && styles.timerUrgent,
          ]}
        >
          {countdownRunning ? `${Math.ceil(timeLeft)}s` : "⏳"}
        </Text>
        {isHost && (
          <TouchableOpacity style={styles.iconBtn} onPress={handleForceEnd}>
            <Text style={styles.iconBtnText}>⏹</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconBtn} onPress={showBombInfo}>
          <Text style={styles.iconBtnText}>ℹ️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {isClingyLocked && (
          <View style={styles.clingyBox}>
            <Text style={styles.clingyText}>
              🔒 Clingy Bomb! Stuck for {Math.ceil(clingyRemaining)}s
            </Text>
          </View>
        )}

        {isHolder ? (
          <>
            {/* Instruction — compact, single line-ish, not a huge block */}
            <View style={styles.instructionBox}>
              <Text style={styles.instructionText} numberOfLines={2}>
                {gameState.instructions[playerId] ?? "Pass the bomb quickly!"}
              </Text>
            </View>

            {!countdownRunning ? (
              <View style={styles.waitingBox}>
                <Text style={styles.waitingText}>Hold tight...</Text>
              </View>
            ) : lockedWire ? (
              <View style={styles.lockedInBox}>
                <Text style={styles.lockedInEmoji}>
                  {lockedWire === "red" ? "🔴" : "🔵"}
                </Text>
                <Text style={styles.lockedInText}>
                  Locked in {lockedWire === "red" ? "RED" : "BLUE"} — no take
                  backs. Waiting for the clock...
                </Text>
              </View>
            ) : (
              <>
                {myHint ? (
                  <View style={styles.hintBox}>
                    <Text style={styles.hintText}>
                      👁 The Snitch says{" "}
                      {myHint.wire === "red" ? "🔴 RED" : "🔵 BLUE"} ·{" "}
                      {myHint.accuracy}% sure
                    </Text>
                  </View>
                ) : myRevealers.length > 0 ? (
                  <TouchableOpacity
                    style={[
                      styles.revealBtn,
                      (revealing || isClingyLocked) && styles.revealBtnDisabled,
                    ]}
                    onPress={handleReveal}
                    disabled={revealing || isClingyLocked}
                  >
                    <Text style={styles.revealBtnText}>
                      👁 Use The Snitch ({myRevealers[0]}%)
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Equal-priority split: pass list left, wires right */}
                <View style={styles.actionSplit}>
                  <View style={styles.passColumn}>
                    <Text style={styles.actionLabel}>PASS TO</Text>
                    <ScrollView
                      style={styles.passList}
                      contentContainerStyle={styles.passListContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {activePlayers
                        .filter((player) => player.id !== playerId)
                        .map((player) => {
                          const blocked = !canPassTo(player.id);
                          return (
                            <TouchableOpacity
                              key={player.id}
                              style={[
                                styles.passBtn,
                                (blocked || isClingyLocked) &&
                                  styles.passBtnDisabled,
                              ]}
                              onPress={() => handlePass(player.id)}
                              disabled={blocked || passing || isClingyLocked}
                            >
                              <Text
                                style={styles.passBtnText}
                                numberOfLines={1}
                              >
                                {player.name}
                                {blocked ? " 🔗" : ""}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </ScrollView>
                  </View>

                  <View style={styles.wireColumn}>
                    <Text style={styles.actionLabel}>CUT A WIRE</Text>
                    <View style={styles.wireStack}>
                      <TouchableOpacity
                        style={[
                          styles.wire,
                          styles.wireRed,
                          myHint?.wire === "red" && styles.wireHinted,
                          isClingyLocked && styles.wireDisabled,
                        ]}
                        onPress={() => handleLockIn("red")}
                        disabled={locking || isClingyLocked}
                      >
                        <Text style={styles.wireText}>🔴</Text>
                        <Text style={styles.wireLabelText}>RED</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.wire,
                          styles.wireBlue,
                          myHint?.wire === "blue" && styles.wireHinted,
                          isClingyLocked && styles.wireDisabled,
                        ]}
                        onPress={() => handleLockIn("blue")}
                        disabled={locking || isClingyLocked}
                      >
                        <Text style={styles.wireText}>🔵</Text>
                        <Text style={styles.wireLabelText}>BLUE</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <Text style={styles.panicHint}>
                  {isClingyLocked
                    ? "The clock is still running — you're just stuck holding it."
                    : "Locking in a wire doesn't reveal the outcome until the clock runs out."}
                </Text>
              </>
            )}
          </>
        ) : (
          <View style={styles.watcherBox}>
            {gameState.personalityEffect === "liar" && (
              <Text style={styles.liarWarning}>
                🎭 The lying stops here — these last 5 seconds are real.
              </Text>
            )}
            {holderUsedRevealer && (
              <Text style={styles.snitchNotice}>
                👁 {holderName} paid The Snitch for a tip...
              </Text>
            )}
            <Text style={styles.watchingEmoji}>👀</Text>
            <Text style={styles.watcherSubtitle}>
              {lockedWire
                ? `${holderName} locked in a wire. Hold your breath...`
                : countdownRunning
                  ? "Hold your breath..."
                  : "Hold tight..."}
            </Text>
          </View>
        )}

        {/* ── Pre-countdown overlays ─────────────────────────────── */}
        {overlay?.kind === "prep" && (
          <PrepOverlay subtitle={overlay.subtitle} />
        )}

        {overlay?.kind === "intro" && (
          <View style={[styles.overlay, styles.overlayEerie]}>
            <Text style={styles.overlayEmoji}>👻</Text>
            <TypewriterText
              text={overlay.title}
              style={[styles.overlayTitle, styles.overlayTitleEerie]}
            />
            <TypewriterText
              text={overlay.subtitle}
              style={styles.overlaySubtitle}
            />
          </View>
        )}

        {overlay?.kind === "bet" && (
          <View style={[styles.overlay, styles.overlayEerie]}>
            <Text style={styles.overlayEmoji}>👻</Text>
            <TypewriterText
              text={`${holderName} is about to cut a wire...`}
              style={[styles.overlayTitle, styles.overlayTitleEerie]}
            />
            <Text style={styles.overlaySubtitle}>
              Bet a ticket on which wire is actually safe. Guess right, and if{" "}
              {holderName} guesses wrong, you can challenge your way back in.
            </Text>
            <View style={styles.betRow}>
              <TouchableOpacity
                style={[styles.betBtn, styles.betBtnRed]}
                onPress={() => handleBet("red")}
                disabled={betting}
              >
                <Text style={styles.betBtnText}>🔴 Bet Red</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.betBtn, styles.betBtnBlue]}
                onPress={() => handleBet("blue")}
                disabled={betting}
              >
                <Text style={styles.betBtnText}>🔵 Bet Blue</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={handleDecline}
              disabled={betting}
            >
              <Text style={styles.declineBtnText}>Sit this one out</Text>
            </TouchableOpacity>
            <Text style={styles.betTimer}>
              {ghostWindowRemaining.toFixed(1)}s
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 50,
  },
  body: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  headerLeft: { flex: 1 },
  warning: {
    color: "#FF4500",
    fontSize: 15,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  headerSub: {
    color: "#888",
    fontSize: 11,
    marginTop: 1,
  },
  timer: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
  },
  timerUrgent: { color: "#FF0000" },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { fontSize: 13 },

  clingyBox: {
    backgroundColor: "#2A0A0A",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#FF4500",
    alignItems: "center",
  },
  clingyText: {
    color: "#FF4500",
    fontSize: 13,
    fontWeight: "700",
  },

  instructionBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF4500",
    padding: 10,
    marginBottom: 8,
  },
  instructionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },

  lockedInBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  lockedInEmoji: { fontSize: 64 },
  lockedInText: {
    color: "#FFD700",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // Equal-priority split — pass list left, wires right
  actionSplit: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
  },
  passColumn: {
    flex: 1,
  },
  wireColumn: {
    flex: 1,
  },
  actionLabel: {
    color: "#aaa",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  passList: { flex: 1 },
  passListContent: { gap: 8 },
  passBtn: {
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#555",
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  passBtnDisabled: { opacity: 0.35 },
  passBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  wireStack: {
    flex: 1,
    gap: 10,
    justifyContent: "flex-start",
  },
  wire: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    paddingVertical: 18,
    elevation: 6,
  },
  wireDisabled: { opacity: 0.3 },
  wireRed: {
    backgroundColor: "#3A0000",
    borderColor: "#FF0000",
    shadowColor: "#FF0000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  wireBlue: {
    backgroundColor: "#00003A",
    borderColor: "#0000FF",
    shadowColor: "#0000FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  wireText: { fontSize: 30, marginBottom: 2 },
  wireLabelText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
  },

  panicHint: {
    color: "#555",
    fontSize: 11,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 10,
  },

  watcherBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  liarWarning: {
    color: "#9B59B6",
    fontSize: 13,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  watchingEmoji: { fontSize: 64, marginBottom: 12 },
  watcherSubtitle: { color: "#888", fontSize: 14, textAlign: "center" },

  waitingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  waitingText: { color: "#555", fontSize: 14, fontStyle: "italic" },

  // ── Pre-countdown overlays (cover the body; header stays visible) ──
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    borderRadius: 16,
    zIndex: 10,
  },
  overlayPrep: { backgroundColor: "#0D0D0D" },
  overlayEerie: { backgroundColor: "#0B0614" },
  overlayEmoji: { fontSize: 56, marginBottom: 18 },
  overlayTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  overlayTitleEerie: { color: "#C9B8FF" },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
    height: 24,
    alignItems: "flex-end",
    marginTop: 6,
    marginBottom: 14,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#FF4500",
  },
  overlaySubtitle: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  betRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  betBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  betBtnRed: { backgroundColor: "#3A0000", borderColor: "#FF0000" },
  betBtnBlue: { backgroundColor: "#00003A", borderColor: "#0000FF" },
  betBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  declineBtn: { marginTop: 16, padding: 10 },
  declineBtnText: { color: "#777", fontSize: 13, fontStyle: "italic" },
  betTimer: { color: "#555", fontSize: 12, fontWeight: "600", marginTop: 8 },

  // ── Wire Revealer ───────────────────────────────────────────────
  revealBtn: {
    backgroundColor: "#1A1230",
    borderWidth: 1,
    borderColor: "#B388FF",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  revealBtnDisabled: { opacity: 0.4 },
  revealBtnText: { color: "#B388FF", fontSize: 13, fontWeight: "700" },
  hintBox: {
    backgroundColor: "#1A1230",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  hintText: { color: "#E0D4FF", fontSize: 13, fontWeight: "700" },
  wireHinted: { borderColor: "#FFD700", borderWidth: 5 },
  snitchNotice: {
    color: "#B388FF",
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 12,
    textAlign: "center",
  },
});
