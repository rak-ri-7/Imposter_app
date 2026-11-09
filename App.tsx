import { useEffect, useState } from "react";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./src/shared/screens/HomeScreen";
import GroupLobbyScreen from "./src/shared/screens/GroupLobbyScreen";
import GameMenuScreen from "./src/shared/screens/GameMenuScreen";
import QuickPlayMenuScreen from "./src/shared/screens/QuickPlayMenuScreen";
import QuickPlaySetupScreen from "./src/shared/screens/QuickPlaySetupScreen";
import ImposterFlowScreen from "./src/games/imposter/ImposterFlowScreen";
import ImposterQuickPlayScreen from "./src/games/imposter/screens/ImposterQuickPlayScreen";
import TimerFlowScreen from "./src/games/stop-the-timer/TimerFlowScreen";
import TeamSetupScreen from "./src/shared/screens/TeamSetupScreen";

import BombFlowScreen from "./src/games/pass-the-bomb/screens/shared/BombFlowScreen";
import QuizBoardFlowScreen from "./src/games/quiz-board/QuizBoardFlowScreen";
import ClashFlowScreen from "./src/games/card-clash/ClashFlowScreen";
import HoldemFlowScreen from "./src/games/clash-holdem/HoldemFlowScreen";
import CotFlowScreen from "./src/games/court-of-thieves/CotFlowScreen";
import MtfFlowScreen from "./src/games/match-the-following/MtfFlowScreen";
import RrfFlowScreen from "./src/games/roof-race/RrfFlowScreen";
import TimerPassScreen from "./src/games/stop-the-timer/TimerPassScreen";
import MtfPassScreen from "./src/games/match-the-following/MtfPassScreen";
import QuizPassScreen from "./src/games/quiz-board/QuizPassScreen";
import { preloadSounds } from "./src/shared/audio/sounds";
import { useFonts } from "expo-font";
import { FONT_FILES } from "./src/shared/theme/fonts";
import GameIntro, { type CurrentRoute } from "./src/shared/components/GameIntro";
import { VoiceProvider } from "./src/shared/voice/VoiceProvider";
import VoiceBar from "./src/shared/voice/VoiceBar";

export type RootStackParamList = {
  Home: { joinCode?: string } | undefined;
  GroupLobby: { groupId: string; playerId: string };
  GameMenu: { groupId: string; playerId: string };
  QuickPlay: undefined;
  QuickPlaySetup: undefined;
  ImposterFlow: { groupId: string; playerId: string };
  ImposterQuickPlay: undefined;
  TimerPass: undefined;
  MtfPass: undefined;
  QuizPass: undefined;
  TimerFlow: { groupId: string; playerId: string };
  TeamSetup: { groupId: string; playerId: string };
  BombFlow: { groupId: string; playerId: string };
  QuizBoardFlow: { groupId: string; playerId: string };
  ClashFlow: { groupId: string; playerId: string };
  HoldemFlow: { groupId: string; playerId: string };
  CotFlow: { groupId: string; playerId: string };
  MtfFlow: { groupId: string; playerId: string };
  RrfFlow: { groupId: string; playerId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  // The app's own links, and the web invite link (https://…/join/CODE),
  // which opens the app straight to Join when it's installed.
  prefixes: ["wgawpt://", "https://imposter-game-a588f.web.app"],
  config: {
    screens: {
      Home: {
        path: "join/:joinCode",
        parse: {
          joinCode: (code: string) => code.toUpperCase(),
        },
      },
    },
  },
};

export default function App() {
  useEffect(() => {
    preloadSounds();
  }, []);
  // The display font (Fredoka). A blink at start-up; if it ever fails to
  // load, the app carries on with the phone's own font.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  // Which screen is showing, so the "now playing" intro knows when a game begins.
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const [route, setRoute] = useState<CurrentRoute>();
  const trackRoute = () => {
    const r = navRef.getCurrentRoute();
    setRoute(r ? { name: r.name, key: r.key } : undefined);
  };
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
    <PaperProvider>
      {/* 🎙️ One group voice call for the whole app (it follows you between screens) */}
      <VoiceProvider currentRoute={route?.name}>
      <NavigationContainer linking={linking} ref={navRef} onReady={trackRoute} onStateChange={trackRoute}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="GroupLobby" component={GroupLobbyScreen} />
          <Stack.Screen name="GameMenu" component={GameMenuScreen} />
          <Stack.Screen name="QuickPlay" component={QuickPlayMenuScreen} />
          <Stack.Screen
            name="QuickPlaySetup"
            component={QuickPlaySetupScreen}
          />
          <Stack.Screen name="ImposterFlow" component={ImposterFlowScreen} />
          <Stack.Screen
            name="ImposterQuickPlay"
            component={ImposterQuickPlayScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="TimerFlow" component={TimerFlowScreen} />
          <Stack.Screen name="TeamSetup" component={TeamSetupScreen} />
          <Stack.Screen name="BombFlow" component={BombFlowScreen} />
          <Stack.Screen
            name="QuizBoardFlow"
            component={QuizBoardFlowScreen}
          />
          <Stack.Screen name="ClashFlow" component={ClashFlowScreen} />
          <Stack.Screen name="HoldemFlow" component={HoldemFlowScreen} />
          <Stack.Screen name="CotFlow" component={CotFlowScreen} />
          <Stack.Screen name="MtfFlow" component={MtfFlowScreen} />
          <Stack.Screen name="RrfFlow" component={RrfFlowScreen} />
          {/* Pass-the-phone games: no swipe-back on iOS (one stray swipe would
              lose the game). They leave through their own End game buttons. */}
          <Stack.Screen name="TimerPass" component={TimerPassScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="MtfPass" component={MtfPassScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen name="QuizPass" component={QuizPassScreen} options={{ gestureEnabled: false }} />
        </Stack.Navigator>
        <VoiceBar />
        <GameIntro route={route} />
      </NavigationContainer>
      </VoiceProvider>
    </PaperProvider>
    </SafeAreaProvider>
  );
}
