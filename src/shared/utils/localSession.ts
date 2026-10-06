import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_SESSION_KEY = 'localPartySession';

export type LocalPlayer = {
    name: string;
    score: number;
};

export type LocalSession = {
    players: LocalPlayer[];
};

export const saveLocalSession = async (session: LocalSession): Promise<void> => {
    await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
};

export const getLocalSession = async (): Promise<LocalSession | null> => {
    const data = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
    if (!data) return null;
    return JSON.parse(data);
};

export const updateLocalScores = async (
    pointsMap: Record<string, number>
): Promise<void> => {
    const session = await getLocalSession();
    if (!session) return;
    const updatedPlayers = session.players.map((p) => ({
        ...p,
        score: p.score + (pointsMap[p.name] || 0),
    }));
    await saveLocalSession({ players: updatedPlayers });
};

export const clearLocalSession = async (): Promise<void> => {
    await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
};