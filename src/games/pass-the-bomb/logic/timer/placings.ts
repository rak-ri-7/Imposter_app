// Who finished where, worked out from the order players were eliminated.
// `ghostEvents` logs every elimination in order, including players who were
// brought back and eliminated again.

// The runner-up is the last player eliminated before the winner: the final
// entry in the log who is still a ghost.
export const getRunnerUp = (
    ghostEvents: string[] | undefined,
    ghosts: string[],
    winnerId?: string
): string | undefined =>
    [...(ghostEvents ?? [])].reverse().find((id) => id !== winnerId && ghosts.includes(id));

// Final standings: the winner, then ghosts from last eliminated to first,
// then anyone whose elimination wasn't logged (older games), most lives first.
export const standingsOrder = (
    playerIds: string[],
    winnerId: string | undefined,
    ghostEvents: string[] | undefined,
    lives: Record<string, number>
): string[] => {
    const out: string[] = [];
    for (const id of [...(ghostEvents ?? [])].reverse()) {
        if (id !== winnerId && !out.includes(id) && playerIds.includes(id)) out.push(id);
    }
    const rest = playerIds
        .filter((id) => id !== winnerId && !out.includes(id))
        .sort((a, b) => (lives[b] ?? 0) - (lives[a] ?? 0));
    return [...(winnerId ? [winnerId] : []), ...out, ...rest];
};