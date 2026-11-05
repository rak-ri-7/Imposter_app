// A page of clues, numbered like an old manuscript (I, II, III…). The
// torch, when the team has it, lights up the clue that matters most.
import { View, Text, StyleSheet } from 'react-native';
import type { RrfClue } from '../../../shared/types';
import { CARVED, RR } from '../theme';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = (i: number) => ROMAN[i] ?? String(i + 1);

export function ClueList({ clues, mine, torch }: { clues: RrfClue[]; mine: number[]; torch: number }) {
    return (
        <View style={{ gap: 10 }}>
            {mine.map((i) => {
                const lit = i === torch;
                return (
                    <View key={i} style={[styles.card, lit && styles.lit]}>
                        <Text style={styles.num}>{roman(i)}</Text>
                        <View style={{ flex: 1, gap: 4 }}>
                            <Text style={styles.text}>{clues[i].text}</Text>
                            {lit && <Text style={styles.torch}>🔦 TORCH: this rule matters most</Text>}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        gap: 12,
        backgroundColor: '#F2ECDD',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: RR.parchmentLine,
        padding: 14,
    },
    lit: { backgroundColor: RR.torch, borderColor: RR.torchLine, borderWidth: 2.5 },
    num: { color: RR.inkMuted, fontSize: 18, fontWeight: '900', fontFamily: CARVED, width: 34 },
    text: { color: RR.ink, fontSize: 17, fontWeight: '700', lineHeight: 24 },
    torch: { color: '#8A6A2A', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
});
