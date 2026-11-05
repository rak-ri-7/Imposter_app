// Small shared pieces: the buttons, the three-doors path, the rival's
// progress strip.
import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import type { RrfTeam } from '../../../shared/types';
import { RR, TEAM } from '../theme';

export function GoldButton({ label, onPress, disabled, style }: { label: string; onPress: () => void; disabled?: boolean; style?: ViewStyle }) {
    return (
        <TouchableOpacity style={[styles.gold, disabled && styles.dim, style]} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
            <Text style={styles.goldText}>{label}</Text>
        </TouchableOpacity>
    );
}

export function GhostButton({ label, onPress, disabled, color = RR.sand }: { label: string; onPress: () => void; disabled?: boolean; color?: string }) {
    return (
        <TouchableOpacity style={[styles.ghost, { borderColor: color }, disabled && styles.dim]} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
            <Text style={[styles.ghostText, { color }]}>{label}</Text>
        </TouchableOpacity>
    );
}

export function Chip({ children, color = RR.sand, bg = RR.panelHi }: { children: ReactNode; color?: string; bg?: string }) {
    return (
        <View style={[styles.chip, { backgroundColor: bg }]}>
            <Text style={[styles.chipText, { color }]}>{children}</Text>
        </View>
    );
}

// 🚪 → 🌉 → 🔐 → 👑, the current door glowing.
export const DOOR_ICONS = ['🚪', '🌉', '🔐'];
export function DoorPath({ names, at, done, small }: { names: string[]; at?: number; done?: number; small?: boolean }) {
    const size = small ? 34 : 54;
    const stops = [...names.map((n, i) => ({ icon: DOOR_ICONS[i], name: n })), { icon: '👑', name: 'Treasure' }];
    return (
        <View style={styles.path}>
            {stops.map((s, i) => {
                const isDone = done !== undefined && i < done;
                const isAt = at === i;
                return (
                    <View key={i} style={styles.stopWrap}>
                        <View
                            style={[
                                styles.stop,
                                { width: size, height: size, borderRadius: size / 2 },
                                isAt && styles.stopAt,
                                isDone && styles.stopDone,
                                i === stops.length - 1 && !isDone && !isAt && styles.stopTreasure,
                            ]}
                        >
                            <Text style={{ fontSize: small ? 16 : 24 }}>{isDone ? '✓' : s.icon}</Text>
                        </View>
                        {!small && (
                            <Text style={[styles.stopName, (isAt || i === stops.length - 1) && { color: RR.gold }]} numberOfLines={2}>
                                {s.name}
                            </Text>
                        )}
                    </View>
                );
            })}
        </View>
    );
}

// The other team, in one line: where they are and how they're doing.
export function RivalStrip({ rival, doorNames }: { rival: RrfTeam; doorNames: string[] }) {
    const T = TEAM[rival.id];
    const where =
        rival.stage === 'buried'
            ? 'buried 🪦'
            : rival.stage === 'vault'
              ? 'at the treasure!'
              : rival.stage === 'falling'
                ? `${doorNames[rival.door]}: the roof is falling!`
                : rival.stage === 'between'
                  ? `through ${doorNames[rival.door]}`
                  : `at ${doorNames[rival.door]}`;
    return (
        <View style={[styles.rival, { borderColor: T.color }]}>
            <Text style={[styles.rivalName, { color: T.color }]}>
                {T.emoji} {T.name.replace('Team ', '')}
            </Text>
            <View style={styles.rivalPath}>
                <DoorPath names={doorNames} small at={rival.stage === 'vault' ? 3 : rival.door} done={rival.door + (rival.stage === 'between' || rival.stage === 'vault' ? 1 : 0)} />
            </View>
            <Text style={styles.rivalWhere} numberOfLines={1}>
                {where} · 💎 {rival.gems}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    gold: {
        backgroundColor: RR.gold,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: RR.goldDeep,
    },
    goldText: { color: RR.goldInk, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
    ghost: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
    ghostText: { fontSize: 16, fontWeight: '900' },
    dim: { opacity: 0.45 },
    chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    chipText: { fontSize: 13, fontWeight: '800' },
    path: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    stopWrap: { alignItems: 'center', flex: 1, gap: 6 },
    stop: { backgroundColor: RR.panel, borderWidth: 2, borderColor: RR.line, alignItems: 'center', justifyContent: 'center' },
    stopAt: { borderColor: RR.gold, backgroundColor: RR.panelHi },
    stopDone: { borderColor: RR.good, backgroundColor: '#14261D' },
    stopTreasure: { borderColor: RR.goldDeep },
    stopName: { color: RR.sandMuted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
    rival: { borderWidth: 1.5, borderRadius: 14, padding: 10, gap: 6, backgroundColor: RR.panel },
    rivalName: { fontSize: 13, fontWeight: '900' },
    rivalPath: { paddingHorizontal: 4 },
    rivalWhere: { color: RR.sandMuted, fontSize: 12, fontWeight: '700' },
});
