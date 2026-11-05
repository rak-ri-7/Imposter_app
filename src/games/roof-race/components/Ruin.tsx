// The frame every screen sits in: dark stone (or parchment for the clue
// pages), a header row (where you are on the left, the timer on the
// right), a scrolling body and a pinned footer for the big buttons.
import type { ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { RR } from '../theme';

type Props = {
    kicker?: string;
    right?: ReactNode;          // usually the timer
    children: ReactNode;
    footer?: ReactNode;
    paper?: boolean;            // parchment instead of stone
    scroll?: boolean;
    tint?: string;              // background override (catastrophe red, etc.)
};

export default function Ruin({ kicker, right, children, footer, paper, scroll = true, tint }: Props) {
    const bg = tint ?? (paper ? RR.parchment : RR.bg);
    const body = <View style={styles.body}>{children}</View>;
    return (
        <View style={[styles.screen, { backgroundColor: bg }]}>
            <View style={styles.head}>
                <Text style={[styles.kicker, paper && { color: RR.inkMuted }]} numberOfLines={1}>
                    {kicker ?? ''}
                </Text>
                {right ?? null}
            </View>
            {scroll ? (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    {body}
                </ScrollView>
            ) : (
                <View style={{ flex: 1 }}>{body}</View>
            )}
            {footer ? <View style={[styles.footer, { backgroundColor: bg, borderColor: paper ? RR.parchmentLine : RR.line }]}>{footer}</View> : null}
        </View>
    );
}

// The round timer pill.
export function TimerPill({ text, urgent, paper }: { text: string; urgent?: boolean; paper?: boolean }) {
    return (
        <View style={[styles.pill, { backgroundColor: urgent ? RR.danger : paper ? RR.ink : RR.panelHi }]}>
            <Text style={[styles.pillText, { color: urgent ? '#fff' : paper ? RR.parchment : RR.gold }]}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    head: {
        paddingTop: 52,
        paddingHorizontal: 18,
        paddingBottom: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    kicker: { flex: 1, color: RR.sandMuted, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
    scroll: { paddingBottom: 24 },
    body: { paddingHorizontal: 18, paddingTop: 6, gap: 14 },
    footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, borderTopWidth: 1, gap: 10 },
    pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
    pillText: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
