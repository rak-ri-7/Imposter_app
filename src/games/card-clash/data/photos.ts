// 🐾 Animal photos, loaded from Wikimedia Commons when a card is shown and
// remembered on the phone afterwards, so the database never holds images
// and the app stays small. Each photo carries its author and licence for
// the credit line on the card (Commons photos are free to use with credit).
// If anything fails (offline, no free photo), the card shows its emoji.
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClashCard } from './types';

export type CardPhoto = {
    uri: string;      // ~480px wide thumbnail on upload.wikimedia.org
    credit: string;   // "Jane Doe · CC BY-SA 4.0"
    page: string;     // the photo's Commons page (tap the credit)
};

const CACHE_PREFIX = 'clash-photo:v1:';
const FAIL_RETRY_MS = 10 * 60 * 1000; // try a failed photo again after 10 min
const HEADERS = { 'Api-User-Agent': 'WGAWPT party games (Clash Cards)' };

const memory = new Map<string, CardPhoto | null>();
const failedAt = new Map<string, number>();
const inflight = new Map<string, Promise<CardPhoto | null>>();

const stripHtml = (s: string) =>
    s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

const lookup = async (title: string): Promise<CardPhoto | null> => {
    // 1. The article's lead image.
    const summaryRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        { headers: HEADERS }
    );
    if (!summaryRes.ok) return null;
    const summary = await summaryRes.json();
    const src: string | undefined = summary?.originalimage?.source ?? summary?.thumbnail?.source;
    // Only freely licensed Commons files (not local "fair use" uploads).
    if (!src || !src.includes('/wikipedia/commons/')) return null;
    const m = src.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
    if (!m) return null;
    const file = decodeURIComponent(m[1]);

    // 2. A card-sized version plus the author and licence.
    const infoRes = await fetch(
        'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
            '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480' +
            `&titles=${encodeURIComponent(`File:${file}`)}`,
        { headers: HEADERS }
    );
    if (!infoRes.ok) return null;
    const info = await infoRes.json();
    const pages = info?.query?.pages ?? {};
    const ii = (Object.values(pages)[0] as any)?.imageinfo?.[0];
    if (!ii?.thumburl) return null;
    const meta = ii.extmetadata ?? {};
    const artist = stripHtml(meta.Artist?.value ?? '') || 'Wikimedia Commons';
    const licence = stripHtml(meta.LicenseShortName?.value ?? '');
    return {
        uri: ii.thumburl,
        credit: `${artist.length > 40 ? `${artist.slice(0, 38)}…` : artist}${licence ? ` · ${licence}` : ''}`,
        page: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
    };
};

export const loadCardPhoto = async (title: string): Promise<CardPhoto | null> => {
    if (memory.has(title)) return memory.get(title)!;
    const failed = failedAt.get(title);
    if (failed && Date.now() - failed < FAIL_RETRY_MS) return null;
    const running = inflight.get(title);
    if (running) return running;

    const job = (async () => {
        try {
            const cached = await AsyncStorage.getItem(CACHE_PREFIX + title);
            if (cached) {
                const photo = JSON.parse(cached) as CardPhoto;
                memory.set(title, photo);
                return photo;
            }
        } catch {
            // storage unavailable: just fetch
        }
        try {
            const photo = await lookup(title);
            if (photo) {
                memory.set(title, photo);
                AsyncStorage.setItem(CACHE_PREFIX + title, JSON.stringify(photo)).catch(() => {});
            } else {
                failedAt.set(title, Date.now());
            }
            return photo;
        } catch {
            failedAt.set(title, Date.now());
            return null;
        } finally {
            inflight.delete(title);
        }
    })();
    inflight.set(title, job);
    return job;
};

// Warm up the photos for cards about to be shown (your hand, the clash).
export const prefetchCardPhotos = (cards: (ClashCard | undefined)[]): void => {
    for (const card of cards) {
        if (!card?.wiki) continue;
        loadCardPhoto(card.wiki)
            .then((p) => {
                if (p) Image.prefetch(p.uri).catch(() => {});
            })
            .catch(() => {});
    }
};

export const useCardPhoto = (card: ClashCard | undefined): CardPhoto | null => {
    const title = card?.wiki;
    const [photo, setPhoto] = useState<CardPhoto | null>(title ? memory.get(title) ?? null : null);
    useEffect(() => {
        if (!title) {
            setPhoto(null);
            return;
        }
        let alive = true;
        setPhoto(memory.get(title) ?? null);
        loadCardPhoto(title).then((p) => {
            if (alive) setPhoto(p);
        });
        return () => {
            alive = false;
        };
    }, [title]);
    return photo;
};
