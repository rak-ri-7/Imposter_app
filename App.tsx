import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PaperProvider } from "react-native-paper";
import HomeScreen from "./src/shared/screens/HomeScreen";
import GroupLobbyScreen from "./src/shared/screens/GroupLobbyScreen";
import GameMenuScreen from "./src/shared/screens/GameMenuScreen";
import QuickPlayMenuScreen from "./src/shared/screens/QuickPlayMenuScreen";
import QuickPlaySetupScreen from "./src/shared/screens/QuickPlaySetupScreen";
import ImposterFlowScreen from "./src/games/imposter/ImposterFlowScreen";
import ImposterQuickPlayScreen from "./src/games/imposter/screens/ImposterQuickPlayScreen";
import TimerFlowScreen from "./src/games/stop-the-timer/TimerFlowScreen";
import TeamSetupScreen from "./src/shared/screens/TeamSetupScreen";

import BombFlowScreen from "./src/games/pass-the-bomb/screens/BombFlowScreen";
import { preloadSounds } from "./src/shared/audio/sounds";

export type RootStackParamList = {
  Home: { joinCode?: string } | undefined;
  GroupLobby: { groupId: string; playerId: string };
  GameMenu: { groupId: string; playerId: string };
  QuickPlay: undefined;
  QuickPlaySetup: undefined;
  ImposterFlow: { groupId: string; playerId: string };
  ImposterQuickPlay: undefined;
  TimerFlow: { groupId: string; playerId: string };
  TeamSetup: { groupId: string; playerId: string };
  BombFlow: { groupId: string; playerId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  prefixes: ["wgawpt://"],
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

  return (
    <PaperProvider>
      <NavigationContainer linking={linking}>
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
          />
          <Stack.Screen name="TimerFlow" component={TimerFlowScreen} />
          <Stack.Screen name="TeamSetup" component={TeamSetupScreen} />
          <Stack.Screen name="BombFlow" component={BombFlowScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
