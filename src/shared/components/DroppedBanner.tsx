// src/shared/components/DroppedBanner.tsx
// A strip across the top of a game saying who has dropped out (their phone
// stopped checking in, or they left the app), or that this phone is
// offline. It never blocks the game: `note` says what happens meanwhile.
import { View, Text, StyleSheet } from 'react-native';

type Props = {
    names: string[];        // players who dropped out
    meOffline: boolean;     // this phone can't reach the server
    note?: string;          // e.g. "The timer carries on."
};

export default function DroppedBanner({ names, meOffline, note }: Props) {
    if (!meOffline && names.length === 0) return null;
    const list = names.length <= 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const text = meOffline
        ? 'You’re offline. Reconnecting…'
        : `⚠️ ${list} dropped out.${note ? ` ${note}` : ''}`;
    return (
        <View pointerEvents="none" style={styles.wrap}>
            <View style={[styles.banner, meOffline && styles.offline]}>
                <Text style={styles.text}>{text}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', top: 92, left: 12, right: 12, alignItems: 'center' },
    banner: { backgroundColor: '#3A1712EE', borderColor: '#D2553F', borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
    offline: { backgroundColor: '#1F2430EE', borderColor: '#8A93A6' },
    text: { color: '#FFE3DA', fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
