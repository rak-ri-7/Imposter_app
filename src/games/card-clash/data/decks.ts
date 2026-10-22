import type { ClashCard, ClashDeck, ClashDeckId, ClashStat } from './types';
import { COUNTRY_CARDS } from './countries';
import { ANIMAL_CARDS } from './animals';

export const DECKS: Record<ClashDeckId, ClashDeck> = {
    countries: {
        id: 'countries',
        name: 'Countries',
        emoji: '🌍',
        blurb: '100 countries · flags · real data',
        stats: [
            { key: 'population', emoji: '👥', label: 'Population', compact: true },
            { key: 'area', emoji: '📐', label: 'Area', unit: 'km²', compact: true },
            { key: 'gdpPerPerson', emoji: '💎', label: 'GDP per person', prefix: '$', compact: true },
            { key: 'density', emoji: '🏙️', label: 'People per km²', decimals: 0 },
            { key: 'lifeExpectancy', emoji: '❤️', label: 'Life expectancy', unit: 'yrs', decimals: 1 },
            { key: 'highestPoint', emoji: '⛰️', label: 'Highest point', unit: 'm' },
            { key: 'coastline', emoji: '🌊', label: 'Coastline', unit: 'km' },
            { key: 'forest', emoji: '🌳', label: 'Forest cover', unit: '%', decimals: 1 },
            { key: 'olympicMedals', emoji: '🏅', label: 'Olympic medals' },
            { key: 'unescoSites', emoji: '🏛️', label: 'UNESCO sites' },
        ],
        wildcards: [
            { key: 'neighbours', emoji: '🤝', label: 'Land neighbours' },
            { key: 'gdpBillions', emoji: '💰', label: 'Total GDP', prefix: '$', unit: 'bn', decimals: 1 },
        ],
    },
    animals: {
        id: 'animals',
        name: 'Animals',
        emoji: '🐾',
        blurb: '94 animals · real photos',
        stats: [
            { key: 'speed', emoji: '⚡', label: 'Top speed', unit: 'km/h' },
            { key: 'weight', emoji: '⚖️', label: 'Weight', unit: 'kg', compact: true },
            { key: 'size', emoji: '📏', label: 'Size', unit: 'm', decimals: 2 },
            { key: 'lifespan', emoji: '⏳', label: 'Lifespan', unit: 'yrs', decimals: 1 },
            { key: 'babies', emoji: '🐣', label: 'Babies per birth', compact: true },
            { key: 'gestation', emoji: '🍼', label: 'Pregnancy / eggs', unit: 'days' },
            { key: 'sleep', emoji: '💤', label: 'Sleep', unit: 'hrs' },
            { key: 'smarts', emoji: '🧠', label: 'Smarts', unit: '/10' },
            { key: 'danger', emoji: '☠️', label: 'Danger', unit: '/10' },
            { key: 'population', emoji: '🌍', label: 'World population', compact: true },
        ],
        wildcards: [
            { key: 'legs', emoji: '🦵', label: 'Legs' },
            { key: 'continents', emoji: '🗺️', label: 'Continents' },
        ],
    },
};

export const DECK_CARDS: Record<ClashDeckId, ClashCard[]> = {
    countries: COUNTRY_CARDS,
    animals: ANIMAL_CARDS,
};

const CARD_INDEX: Record<string, ClashCard> = Object.fromEntries(
    [...COUNTRY_CARDS, ...ANIMAL_CARDS].map((c) => [c.id, c])
);

export const cardById = (id: string): ClashCard | undefined => CARD_INDEX[id];

export const statByKey = (deck: ClashDeckId, key: string): ClashStat | undefined =>
    [...DECKS[deck].stats, ...DECKS[deck].wildcards].find((s) => s.key === key);

// ── Set numbers and rarity (printed in the card's corner) ───────────
// Rarity = how many of its 10 stats rank in the top quarter of its deck:
// 4+ is a gold Rare, 2-3 a silver Uncommon, 0-1 a bronze Common.
export type Rarity = 'gold' | 'silver' | 'bronze';
const CARD_META: Record<string, { setNo: number; setSize: number; rarity: Rarity }> = {};
for (const deckId of Object.keys(DECK_CARDS) as ClashDeckId[]) {
    const cards = DECK_CARDS[deckId];
    const cut = Math.round(cards.length / 4);
    const topCount: Record<string, number> = {};
    for (const s of DECKS[deckId].stats) {
        const sorted = [...cards].sort((a, b) => (b.stats[s.key] ?? 0) - (a.stats[s.key] ?? 0));
        const threshold = sorted[cut - 1]?.stats[s.key] ?? 0;
        for (const c of cards) if ((c.stats[s.key] ?? 0) >= threshold) topCount[c.id] = (topCount[c.id] ?? 0) + 1;
    }
    cards.forEach((c, i) => {
        const n = topCount[c.id] ?? 0;
        CARD_META[c.id] = { setNo: i + 1, setSize: cards.length, rarity: n >= 4 ? 'gold' : n >= 2 ? 'silver' : 'bronze' };
    });
}
export const cardMeta = (id: string) => CARD_META[id] ?? { setNo: 0, setSize: 0, rarity: 'bronze' as Rarity };
export const deckOfCard = (id: string): ClashDeckId => (id.startsWith('c-') ? 'countries' : 'animals');
