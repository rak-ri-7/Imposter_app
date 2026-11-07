// tools/firestore-json.mjs
// Turns Firestore values into plain JSON and back, so a backup file keeps
// dates, references and so on exactly as they were.
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';

export const encode = (v) => {
    if (v === null || v === undefined) return v ?? null;
    if (v instanceof Timestamp) return { __type: 'timestamp', value: v.toDate().toISOString(), nanos: v.nanoseconds };
    if (v instanceof GeoPoint) return { __type: 'geopoint', lat: v.latitude, lng: v.longitude };
    if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __type: 'bytes', base64: Buffer.from(v).toString('base64') };
    if (typeof v === 'object' && typeof v.path === 'string' && typeof v.firestore === 'object' && 'id' in v)
        return { __type: 'ref', path: v.path };
    if (Array.isArray(v)) return v.map(encode);
    if (typeof v === 'object') {
        const out = {};
        for (const [k, x] of Object.entries(v)) out[k] = encode(x);
        return out;
    }
    return v;
};

export const decode = (v, db) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => decode(x, db));
    switch (v.__type) {
        case 'timestamp': {
            const ms = Date.parse(v.value);
            return new Timestamp(Math.floor(ms / 1000), v.nanos ?? (ms % 1000) * 1e6);
        }
        case 'geopoint':
            return new GeoPoint(v.lat, v.lng);
        case 'bytes':
            return Buffer.from(v.base64, 'base64');
        case 'ref':
            return db.doc(v.path);
    }
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = decode(x, db);
    return out;
};

// Shared setup: the project's Admin SDK key.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const TOOLS = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TOOLS, '..');

export const connect = () => {
    // (Windows hides extensions, so the key often gets saved as "….json.json".)
    const keyPath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        ['service-account.json', 'service-account.json.json', 'service-account'].map((f) => path.join(TOOLS, f)).find((f) => existsSync(f)) ||
        path.join(TOOLS, 'service-account.json');
    if (!existsSync(keyPath)) {
        console.error(
            `\nNo service account key found at:\n  ${keyPath}\n\n` +
                `Get one (one time): Firebase console → ⚙️ Project settings → Service accounts →\n` +
                `"Generate new private key", then save the file as tools/service-account.json.\n` +
                `https://console.firebase.google.com/project/imposter-game-a588f/settings/serviceaccounts/adminsdk\n\n` +
                `Keep it private: it can read and change everything. It's already in .gitignore.\n`
        );
        process.exit(1);
    }
    const key = JSON.parse(readFileSync(keyPath, 'utf8'));
    initializeApp({ credential: cert(key), projectId: key.project_id });
    return { db: getFirestore(), projectId: key.project_id };
};

export const args = (argv = process.argv.slice(2)) => {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) out._.push(a);
        else if (a.includes('=')) out[a.slice(2, a.indexOf('='))] = a.slice(a.indexOf('=') + 1);
        else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
        else out[a.slice(2)] = true;
    }
    return out;
};
export const list = (s) => (typeof s === 'string' ? s.split(',').map((x) => x.trim()).filter(Boolean) : null);
