// 🔑 The key-holder's screen: the lock itself. Tiles to put in order (the
// Gate and the Vault) or numbered symbols and a 3-number dial (the
// Crossing). The explorers have the rules; this player has the door.
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import type { Group, RrfGameState, RrfItem, RrfTeam } from '../../../shared/types';
import { GEM_MS, STRIKE_GEMS, rivalOf } from '../logic/engine';
import { draftFor, draftKey, rrfPush, rrfSaveDraft } from '../logic/game';
import { GATE_KIND_NAMES, type GateKind } from '../logic/puzzles';
import { scenarioById } from '../data/scenarios';
import Ruin, { TimerPill } from '../components/Ruin';
import { Chip, GoldButton, RivalStrip } from '../components/Bits';
import { ClueList } from '../components/Clues';
import { RivalClaimBanner } from '../components/Hold';
import { useServerNow } from '../../../shared/hooks/useServerNow';
import { CARVED, RR, clock } from '../theme';

type Props = { group: Group; gs: RrfGameState; playerId: string; team: RrfTeam };

const DRAFT_SAVE_MS = 400;

export default function RrfDoorScreen({ group, gs, playerId, team }: Props) {
    const now = useServerNow();
    const sc = scenarioById(gs.scenario);
    const p = team.puzzle!;
    const doorName = sc.doors[team.door];
    const frozen = now < team.frozenUntil;
    const left = team.doorEndsAt - now;
    const nameOf = (id: string) => group.players.find((x) => x.id === id)?.name ?? 'Someone';
    const explorers = Object.keys(team.pages).filter((e) => e !== playerId);

    // What I've placed. Starts from (and resets to) what the server has:
    // a new lock, a retry, or a tremor knocking the tiles out.
    const lockKey = `${gs.expedition}:${team.door}:${team.retry}:${p.answer.join()}:${team.frozenUntil}`;
    const saved = draftFor(group, gs, team);
    const [draft, setDraft] = useState<string[]>(saved ?? team.draft);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    useEffect(() => {
        const start = draftFor(group, gs, team) ?? [];
        setDraft(p.type === 'crossing' && start.length !== 3 ? ['0', '0', '0'] : start);
        setMsg(null);
    }, [lockKey]);

    // Save the arrangement so the explorers can follow along: a small
    // write, at most every DRAFT_SAVE_MS, and only when it changed.
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSent = useRef('');
    const update = (next: string[]) => {
        setDraft(next);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const key = draftKey(gs, team);
        saveTimer.current = setTimeout(() => {
            const sig = `${key}|${next.join()}`;
            if (sig === lastSent.current) return;
            lastSent.current = sig;
            rrfSaveDraft(group.id, team.id, key, next);
        }, DRAFT_SAVE_MS);
    };
    useEffect(() => () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
    }, []);

    // A wrong push: buzz, and say so.
    const strikes = useRef(team.doorStrikes);
    useEffect(() => {
        if (team.doorStrikes > strikes.current) Vibration.vibrate(400);
        strikes.current = team.doorStrikes;
    }, [team.doorStrikes]);

    const full = draft.length === p.answer.length;
    const push = async () => {
        if (busy || !full || frozen) return;
        setBusy(true);
        const r = await rrfPush(group.id, playerId, draft);
        setBusy(false);
        if (!r.success && r.reason && r.reason !== 'stale') setMsg(r.reason);
    };

    const gemsNow = team.retry ? 0 : Math.max(0, Math.floor(left / GEM_MS));

    return (
        <Ruin
            kicker={`${doorName.toUpperCase()} · DOOR ${team.door + 1} OF 3`}
            right={<TimerPill text={clock(left)} urgent={left < 15000} />}
            footer={
                <>
                    {msg && <Text style={styles.msg}>{msg}</Text>}
                    <GoldButton
                        label={frozen ? '🌋 Hold on…' : busy ? 'Pushing…' : full ? 'Push the door' : `Place ${p.answer.length - draft.length} more`}
                        onPress={push}
                        disabled={busy || !full || frozen}
                    />
                </>
            }
        >
            <Text style={styles.title}>You hold the key 🔑</Text>
            <Text style={styles.sub}>
                {explorers.length
                    ? `Tell ${explorers.map(nameOf).join(', ')} what you see. They have the rules, you have the door.`
                    : 'Nobody to read for you: the rules are below.'}
            </Text>

            <RivalClaimBanner group={group} gs={gs} playerId={playerId} team={team.id} now={now} />
            <View style={styles.chips}>
                <Chip color={RR.gold}>💎 {team.gems}{team.retry ? '' : `  (+${gemsNow} if you open now)`}</Chip>
                <Chip color={team.doorStrikes ? RR.danger : RR.sandMuted}>✖ {team.doorStrikes} strike{team.doorStrikes === 1 ? '' : 's'}</Chip>
                <Chip color={team.ropeUsed ? RR.sandDim : RR.sand}>🪢 {team.ropeUsed ? 'rope used' : 'rope ready'}</Chip>
                {team.torch && <Chip color={RR.torchLine}>🔦 your explorers have the torch</Chip>}
                {team.retry && <Chip color={RR.sandMuted}>second try: no gems</Chip>}
            </View>

            {team.doorStrikes > 0 && (
                <View style={styles.warn}>
                    <Text style={styles.warnText}>
                        Wrong! The walls tremble. −{STRIKE_GEMS} 💎. One more wrong push and the roof comes down.
                    </Text>
                </View>
            )}
            {frozen && (
                <View style={styles.quake}>
                    <Text style={styles.quakeBig}>🌋 THE DOOR IS SHAKING!</Text>
                    <Text style={styles.quakeSub}>The other team sent a tremor. Your tiles fell out. {Math.ceil((team.frozenUntil - now) / 1000)} s…</Text>
                </View>
            )}

            <View style={[styles.door, frozen && { opacity: 0.4 }]} pointerEvents={frozen ? 'none' : 'auto'}>
                {p.type === 'crossing' ? (
                    <CodeLock items={p.items} digits={draft} onChange={update} />
                ) : (
                    <OrderLock items={p.items} draft={draft} onChange={update} letters={p.type === 'vault'} />
                )}
            </View>

            {team.pages[playerId] && <ClueList clues={p.clues} mine={team.pages[playerId]} torch={team.torch ? p.keyClue : -1} />}

            <RivalStrip rival={gs.teams[rivalOf(team.id)]} doorNames={[...sc.doors]} />
        </Ruin>
    );
}

// ── The Gate and the Vault: put the tiles in order ──────────────────
function OrderLock({ items, draft, onChange, letters }: { items: RrfItem[]; draft: string[]; onChange: (d: string[]) => void; letters: boolean }) {
    const byId = (id: string) => items.find((i) => i.id === id);
    const slots = items.map((_, i) => draft[i] ?? null);
    const tray = items.filter((i) => !draft.includes(i.id));
    return (
        <View style={{ gap: 16 }}>
            <Text style={styles.lockLabel}>THE LOCK · tap a slot to take a tile back</Text>
            <View style={styles.slots}>
                {slots.map((id, i) => {
                    const it = id ? byId(id) : null;
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[styles.slot, it && styles.slotFull]}
                            disabled={!it}
                            onPress={() => onChange(draft.filter((d) => d !== id))}
                        >
                            {it ? <Text style={letters ? styles.letter : styles.emoji}>{it.label}</Text> : <Text style={styles.slotNum}>{i + 1}</Text>}
                        </TouchableOpacity>
                    );
                })}
            </View>
            <Text style={styles.lockLabel}>YOUR TILES · tap to place</Text>
            <View style={styles.tray}>
                {tray.map((it) => (
                    <TouchableOpacity key={it.id} style={styles.tile} onPress={() => onChange([...draft, it.id])}>
                        <Text style={letters ? styles.letter : styles.emoji}>{it.label}</Text>
                        {it.kind ? <Text style={styles.kind}>{GATE_KIND_NAMES[it.kind as GateKind]?.one.replace(/^an? /, '') ?? ''}</Text> : null}
                    </TouchableOpacity>
                ))}
                {!tray.length && <Text style={styles.allPlaced}>All placed. Push when your team agrees.</Text>}
            </View>
        </View>
    );
}

// ── The Crossing: numbered symbols and a 3-number dial ─────────────
function CodeLock({ items, digits, onChange }: { items: RrfItem[]; digits: string[]; onChange: (d: string[]) => void }) {
    const d = digits.length === 3 ? digits : ['0', '0', '0'];
    const turn = (i: number, by: number) => {
        const next = [...d];
        next[i] = String((Number(next[i]) + by + 10) % 10);
        onChange(next);
    };
    return (
        <View style={{ gap: 16 }}>
            <Text style={styles.lockLabel}>CARVED ON THE DOOR</Text>
            <View style={styles.tray}>
                {items.map((it) => (
                    <View key={it.id} style={[styles.tile, styles.symbol]}>
                        <Text style={styles.emoji}>{it.label}</Text>
                        <Text style={styles.value}>{it.value}</Text>
                    </View>
                ))}
            </View>
            <Text style={styles.lockLabel}>THE CODE · first, middle, last</Text>
            <View style={styles.dials}>
                {d.map((v, i) => (
                    <View key={i} style={styles.dial}>
                        <TouchableOpacity style={styles.turn} onPress={() => turn(i, 1)}>
                            <Text style={styles.turnText}>▲</Text>
                        </TouchableOpacity>
                        <Text style={styles.digit}>{v}</Text>
                        <TouchableOpacity style={styles.turn} onPress={() => turn(i, -1)}>
                            <Text style={styles.turnText}>▼</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    title: { color: RR.gold, fontSize: 26, fontWeight: '900', fontFamily: CARVED },
    sub: { color: RR.sandMuted, fontSize: 14, lineHeight: 20 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    warn: { backgroundColor: RR.dangerDeep, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: RR.danger },
    warnText: { color: '#FFD9D0', fontWeight: '800', fontSize: 13 },
    quake: { backgroundColor: RR.dangerDeep, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
    quakeBig: { color: '#FFB199', fontSize: 20, fontWeight: '900' },
    quakeSub: { color: '#FFD9D0', fontSize: 13, textAlign: 'center' },
    door: { backgroundColor: RR.panel, borderRadius: 20, padding: 14, borderWidth: 1.5, borderColor: RR.line },
    lockLabel: { color: RR.sandDim, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
    slots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
    slot: {
        width: 58,
        height: 64,
        borderRadius: 14,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: RR.line,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: RR.bgDeep,
    },
    slotFull: { borderStyle: 'solid', borderColor: RR.gold, backgroundColor: RR.panelHi },
    slotNum: { color: RR.sandDim, fontSize: 16, fontWeight: '900' },
    tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    tile: {
        width: 64,
        minHeight: 70,
        borderRadius: 14,
        backgroundColor: RR.parchment,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 4,
        borderColor: RR.parchmentLine,
        paddingVertical: 6,
    },
    symbol: { width: 72 },
    emoji: { fontSize: 32 },
    letter: { fontSize: 30, fontWeight: '900', color: RR.ink, fontFamily: CARVED },
    kind: { fontSize: 10, color: RR.inkMuted, fontWeight: '800' },
    value: { fontSize: 22, fontWeight: '900', color: RR.ink },
    allPlaced: { color: RR.sandMuted, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
    dials: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
    dial: { alignItems: 'center', backgroundColor: RR.bgDeep, borderRadius: 16, borderWidth: 2, borderColor: RR.gold, paddingVertical: 6, width: 76 },
    turn: { paddingVertical: 8, paddingHorizontal: 20 },
    turnText: { color: RR.gold, fontSize: 20 },
    digit: { color: RR.sand, fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] },
    msg: { color: RR.danger, textAlign: 'center', fontWeight: '800' },
});
