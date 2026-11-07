// src/shared/hooks/useMinimizableGame.ts
// 🔽 Online games minimise instead of ending. Back (Android) or a swipe
// back (iOS) takes you to the game menu while the game keeps running
// underneath (its screen stays alive, so timers and the host's duties carry
// on). The menu and lobby show a mini player to jump back in; its ✕ asks
// the game itself how to close (each game's own "End & rank / Quit" dialog).
//
// Every online game screen calls useMinimizableGame(). It also takes the
// screen away when the game is over (or replaced by another game), whether
// it's on top or minimised underneath.
import { useEffect, useRef } from 'react';
import { CommonActions, type NavigationProp, type RouteProp } from '@react-navigation/native';
import type { Group, GameType } from '../types';

// Which screen plays which game.
export const GAME_ROUTES: Partial<Record<GameType, string>> = {
    imposter: 'ImposterFlow',
    'stop-the-timer': 'TimerFlow',
    'pass-the-bomb': 'BombFlow',
    'quiz-board': 'QuizBoardFlow',
    'card-clash': 'ClashFlow',
    'clash-holdem': 'HoldemFlow',
    'court-of-thieves': 'CotFlow',
    'match-the-following': 'MtfFlow',
    'roof-race': 'RrfFlow',
};
export const routeForGame = (game: GameType | 'menu' | undefined | null) =>
    game && game !== 'menu' ? GAME_ROUTES[game] : undefined;

// ── How to close the running game (registered by the game's screen) ──────
const closers = new Map<string, () => unknown>();

// Used like BackHandler.addEventListener: returns { remove }.
export const registerGameCloser = (groupId: string, close: () => unknown) => {
    closers.set(groupId, close);
    return {
        remove: () => {
            if (closers.get(groupId) === close) closers.delete(groupId);
        },
    };
};
export const getGameCloser = (groupId: string) => closers.get(groupId);

type Nav = NavigationProp<any>;

export const useMinimizableGame = (
    navigation: Nav,
    route: RouteProp<any>,
    group: Group | null | undefined,
    game: GameType,
    groupId: string,
    playerId: string
) => {
    const current = useRef(group?.currentGame);
    current.current = group?.currentGame;

    // Back / swipe back → minimise (go to the menu, keep this screen alive).
    // Replacing or resetting (game over) goes through untouched.
    useEffect(
        () =>
            navigation.addListener('beforeRemove' as any, (e: any) => {
                const type = e?.data?.action?.type;
                if (type !== 'GO_BACK' && type !== 'POP') return;
                if (current.current !== game) return; // game already over: just leave
                e.preventDefault();
                (navigation as any).navigate('GameMenu', { groupId, playerId });
            }),
        [navigation, game, groupId, playerId]
    );

    // Game over or a different game started → this screen goes. On top: swap
    // it for the menu. Minimised underneath: quietly remove it.
    useEffect(() => {
        if (!group || group.currentGame === game) return;
        if (navigation.isFocused()) {
            (navigation as any).replace('GameMenu', { groupId, playerId });
        } else {
            navigation.dispatch((state: any) => {
                const routes = state.routes.filter((r: any) => r.key !== route.key);
                return CommonActions.reset({ ...state, routes, index: Math.max(0, routes.length - 1) });
            });
        }
    }, [group?.currentGame]);
};
