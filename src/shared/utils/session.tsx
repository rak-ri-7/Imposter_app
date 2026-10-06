import AsyncStorage from "@react-native-async-storage/async-storage";

const GROUP_ID_KEY = "lastGroupId";
const PLAYER_ID_KEY = "lastPlayerId";
const PLAYER_NAME_KEY = "lastPlayerName";

export const saveSession = async (
  groupId: string,
  playerId: string,
  playerName: string,
): Promise<void> => {
  await AsyncStorage.multiSet([
    [GROUP_ID_KEY, groupId],
    [PLAYER_ID_KEY, playerId],
    [PLAYER_NAME_KEY, playerName],
  ]);
};

export const getSession = async (): Promise<{
  groupId: string;
  playerId: string;
  playerName: string;
} | null> => {
  const values = await AsyncStorage.multiGet([
    GROUP_ID_KEY,
    PLAYER_ID_KEY,
    PLAYER_NAME_KEY,
  ]);
  const groupId = values[0][1];
  const playerId = values[1][1];
  const playerName = values[2][1];

  if (!groupId || !playerId || !playerName) return null;
  return { groupId, playerId, playerName };
};

export const clearSession = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    GROUP_ID_KEY,
    PLAYER_ID_KEY,
    PLAYER_NAME_KEY,
  ]);
};

export const savePlayerName = async (name: string): Promise<void> => {
  await AsyncStorage.setItem("savedPlayerName", name);
};

export const getSavedPlayerName = async (): Promise<string | null> => {
  return await AsyncStorage.getItem("savedPlayerName");
};
