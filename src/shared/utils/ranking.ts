// Leaderboard places where ties share a place and the next score takes
// the next place ("dense" ranking): 10, 10, 7 -> 1, 1, 2.
// `scores` must already be sorted highest first.
export const denseRanks = (scores: number[]): number[] => {
    const ranks: number[] = [];
    scores.forEach((s, i) => {
        ranks.push(i === 0 ? 1 : s === scores[i - 1] ? ranks[i - 1] : ranks[i - 1] + 1);
    });
    return ranks;
};

export const rankMedal = (rank: number): string =>
    rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
