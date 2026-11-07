// tools/firestore-backup.mjs
// 💾 Saves the whole Firestore database (every collection and the
// collections inside documents, like a group's chat) to one JSON file.
//
//   npm run backup                          everything → backups/
//   npm run backup -- --only profiles       just the all-time board
//   npm run backup -- --out "G:\My Drive\wgawpt-backups"   save somewhere else
//   npm run backup -- --keep 60             how many old backups to keep (default 30)
//
// Restore with tools/firestore-restore.mjs. Free to run on the Spark plan:
// it only reads (the daily free allowance is 50,000 reads).
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, args, connect, encode, list } from './firestore-json.mjs';

const opt = args();
const only = list(opt.only);
const skip = list(opt.skip) ?? [];
const outDir = path.resolve(opt.out ?? process.env.BACKUP_DIR ?? path.join(ROOT, 'backups'));
const keep = Math.max(1, Number(opt.keep ?? 30) || 30);

const { db, projectId } = connect();
let docCount = 0;

const dumpCollection = async (col) => {
    const snap = await col.get();
    const docs = [];
    for (const d of snap.docs) {
        docCount++;
        const entry = { id: d.id, data: encode(d.data()) };
        const subs = await d.ref.listCollections();
        if (subs.length) {
            entry.sub = {};
            for (const s of subs) entry.sub[s.id] = await dumpCollection(s);
        }
        docs.push(entry);
    }
    return docs;
};

const started = Date.now();
const roots = (await db.listCollections()).filter((c) => (!only || only.includes(c.id)) && !skip.includes(c.id));
const collections = {};
for (const c of roots) {
    process.stdout.write(`Backing up ${c.id}… `);
    const before = docCount;
    collections[c.id] = await dumpCollection(c);
    console.log(`${docCount - before} documents`);
}

mkdirSync(outDir, { recursive: true });
const now = new Date(); // file names in this computer's local time
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}_${p2(now.getHours())}-${p2(now.getMinutes())}`;
const file = path.join(outDir, `firestore-${only ? only.join('+') + '-' : ''}${stamp}.json`);
writeFileSync(file, JSON.stringify({ projectId, takenAt: new Date().toISOString(), only, collections }, null, 1));
console.log(`\n✅ ${docCount} documents saved to\n   ${file}\n   (${((Date.now() - started) / 1000).toFixed(1)} s)`);

// Keep only the newest `keep` backups of the same kind in that folder.
const prefix = `firestore-${only ? only.join('+') + '-' : ''}`;
const mine = readdirSync(outDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json') && (only || /^firestore-\d{4}-/.test(f)))
    .sort();
for (const old of mine.slice(0, Math.max(0, mine.length - keep))) {
    unlinkSync(path.join(outDir, old));
    console.log(`   removed old backup ${old}`);
}
process.exit(0);
