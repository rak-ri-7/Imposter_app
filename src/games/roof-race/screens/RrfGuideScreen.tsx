// 📜 An explorer's screen: their page of the guide. They can't see the
// lock, so they ask the key-holder what's on it and read their rules out.
// A strip at the bottom shows what the key-holder has placed so far.
import { View, Text, StyleSheet } from 'react-native';
import type { Group, RrfGameState, RrfTeam } from '../../../shared/types';
import { rivalOf } from '../logic/engine';
import { draftFor } from '../logic/game';
import { scenarioById } from '../data/scenarios';
import Ruin, { TimerPill } from '../components/Ruin';
import { RivalStrip } from '../components/Bits';
import { ClueList } from '../components/Clues';
import { RivalClaimBanner } from '../components/Hold';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, clock } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string; team: RrfTeam };

export default function RrfGuideScreen({ group, gs, playerId, team }: Props) {
    const now = useServerNow();
    const sc = scenarioById(gs.scenario);
    const p = team.puzzle!;
    const nameOf = (id: string) => group.players.find((x) => x.id === id)?.name ?? 'Someone';
    const kh = nameOf(team.keyHolder);
    const left = team.doorEndsAt - now;
    const frozen = now < team.frozenUntil;
    const owners = Object.keys(team.pages);
    const mine = team.pages[playerId] ?? [];
    const pageNo = owners.indexOf(playerId) + 1;
    const torchOwner = team.torch ? owners.find((o) => team.pages[o].includes(p.keyClue)) : undefined;
    const others = owners.filter((o) => o !== playerId);

    const ask =
        p.type === 'crossing'
            ? `${kh} sees symbols with numbers carved on the door. Ask for them, then work out the code together.`
            : p.type === 'vault'
              ? `${kh} sees five letters on the door. You can’t: ask which ones, then read your rules out.`
              : `${kh} sees five tiles on the door. You can’t: ask what they are, then read your rules out.`;

    const tiles = draftFor(group, gs, team) ?? [];
    const placed =
        p.type === 'crossing'
            ? tiles.length === 3
                ? tiles.join(' · ')
                : '…'
            : [...tiles.map((id) => p.items.find((i) => i.id === id)?.label ?? '?'), ...Array(Math.max(0, p.answer.length - tiles.length)).fill('▢')].join(' ');

    return (
        <Ruin
            paper
            kicker={`EXPLORER’S GUIDE · PAGE ${pageNo} OF ${owners.length}`}
            right={<TimerPill text={clock(left)} urgent={left < 15000} paper />}
            footer={
                <View style={styles.strip}>
                    <Text style={styles.stripKey}>🔑</Text>
                    <Text style={styles.stripText} numberOfLines={1}>
                        {frozen ? `${kh}’s door is shaking! 🌋` : `${kh} has placed: ${placed}`}
                    </Text>
                </View>
            }
        >
            <Text style={styles.title}>{sc.doors[team.door]}</Text>
            <Text style={styles.ask}>{ask}</Text>
            <RivalClaimBanner group={group} gs={gs} playerId={playerId} team={team.id} now={now} />
            {team.retry && <Text style={styles.note}>The rope saved you: a new lock, and no gems for this one. Be careful!</Text>}
            {team.doorStrikes > 0 && <Text style={styles.warn}>One wrong push already. Another and the roof comes down!</Text>}

            <ClueList clues={p.clues} mine={mine} torch={team.torch ? p.keyClue : -1} />

            {torchOwner && torchOwner !== playerId && (
                <Text style={styles.note}>🔦 The torch lights a rule on {nameOf(torchOwner)}’s page. Hear that one first.</Text>
            )}
            {others.length > 0 && (
                <Text style={styles.others}>
                    {others.map((o) => `${nameOf(o)} has page ${owners.indexOf(o) + 1}`).join(' · ')}
                </Text>
            )}
            <Text style={styles.small}>Some rules talk about things that aren’t on this door. Those you can ignore.</Text>

            <RivalStrip rival={gs.teams[rivalOf(team.id)]} doorNames={[...sc.doors]} />
        </Ruin>
    );
}


const styles = StyleSheet.create({
    title: { color: RR.ink, fontSize: 28, fontWeight: '900', fontFamily: CARVED },
    ask: { color: RR.inkMuted, fontSize: 15, lineHeight: 21, fontWeight: '600' },
    note: { color: '#7A5E28', fontSize: 13, fontWeight: '800' },
    warn: { color: '#A3301C', fontSize: 13, fontWeight: '900' },
    others: { color: RR.inkMuted, fontSize: 13, fontWeight: '700' },
    small: { color: RR.inkMuted, fontSize: 12, fontStyle: 'italic' },
    strip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: RR.ink, borderRadius: 16, padding: 14 },
    stripKey: { fontSize: 22 },
    stripText: { flex: 1, color: RR.parchment, fontSize: 15, fontWeight: '800' },
});
