import { createContext, useContext, useEffect, useRef } from "react";
import {
  Animated,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";

export type MissionsUi = {
  available: boolean; // the player actually has missions (a game is running)
  unseen: boolean; // something changed that they haven't looked at yet
  flashKey: number; // goes up on every mission update
  open: () => void;
};

// BombFlowScreen owns the mission state (it stays mounted for the whole game,
// so no update is ever missed) and shares it with every screen that shows the
// button.
export const MissionsContext = createContext<MissionsUi>({
  available: false,
  unseen: false,
  flashKey: 0,
  open: () => {},
});

export default function MissionsButton() {
  const { available, unseen, flashKey, open } = useContext(MissionsContext);
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Flashes on every update — and once when a screen appears with news the
  // player hasn't looked at yet. Opening the missions clears it.
  useEffect(() => {
    if (flashKey === 0 || !unseen) return;
    flashAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: false,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: false,
        }),
      ]),
      { iterations: 3 },
    ).start();
  }, [flashKey, unseen]);

  if (!available) return null;

  return (
    <TouchableOpacity onPress={open} activeOpacity={0.7}>
      <Animated.View
        style={[
          styles.btn,
          {
            backgroundColor: flashAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ["#1A1A1A", "#FF4500"],
            }),
            transform: [
              {
                scale: flashAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.25],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.text}>🎯</Text>
        {unseen && <View style={styles.dot} />}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 15 },
  dot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#FF4500",
    borderWidth: 1,
    borderColor: "#0D0D0D",
  },
});
