// Clash Cards: decks, cards and stat definitions.
// Every stat is "higher wins". 10 main stats are printed on each card; the
// 2 backup stats stay hidden until someone plays their 🃏 Wildcard.

export type ClashDeckId = 'countries' | 'animals';

export type ClashCard = {
    id: string;
    name: string;
    stats: Record<string, number>;
    image?: string;   // countries: key into FLAG_IMAGES
    emoji?: string;   // animals: fallback picture
    wiki?: string;    // animals: Wikipedia article for the photo
};

export type ClashStat = {
    key: string;
    emoji: string;
    label: string;   // short, fits on the card
    unit?: string;   // shown after the number
    prefix?: string; // shown before it ($)
    decimals?: number;
    compact?: boolean; // 1.4B, 23M, 5.5K
};

export type ClashDeck = {
    id: ClashDeckId;
    name: string;
    emoji: string;
    blurb: string;
    stats: ClashStat[];     // the 10 on the card
    wildcards: ClashStat[]; // the 2 hidden backups
};

// `full`: no 1.4B-style shortening (the clash reveal, where close calls matter).
export const formatStat = (stat: ClashStat, value: number, full = false): string => {
    let text: string;
    if (stat.compact && !full && Math.abs(value) >= 1000) {
        const units: [number, string][] = [
            [1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
        ];
        const [div, suffix] = units.find(([d]) => Math.abs(value) >= d)!;
        const n = value / div;
        text = `${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}${suffix}`;
    } else if (stat.decimals !== undefined) {
        text = value.toLocaleString('en-US', {
            maximumFractionDigits: stat.decimals,
            minimumFractionDigits: 0,
        });
    } else if (Math.abs(value) > 0 && Math.abs(value) < 1) {
        // tiny animals: keep the meaningful digits (0.003 kg, not 0)
        text = String(Number(value.toPrecision(2)));
    } else {
        text = Math.round(value).toLocaleString('en-US');
    }
    // "68.3%" and "5/10" sit tight; "112 km/h" gets a space.
    const unit = stat.unit ? (/^[%/]/.test(stat.unit) ? stat.unit : ` ${stat.unit}`) : '';
    return `${stat.prefix ?? ''}${text}${unit}`;
};
