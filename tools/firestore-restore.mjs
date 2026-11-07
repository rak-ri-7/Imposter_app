// tools/firestore-restore.mjs
// ♻️ Puts a backup made by firestore-backup.mjs back into Firestore.
//
//   npm run restore -- backups/firestore-2026-11-07_21-00.json --dry-run
//   npm run restore -- backups/firestore-2026-11-07_21-00.json --only profiles
//
// It writes every document in the file back exactly as it was (overwriting
// the current version of those documents). Documents created since the
// backup are left alone; nothing is deleted. Always try --dry-run first.
import { readFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import { args, connect, decode, list } from './firestore-json.mjs';

const opt = args();
const file = opt._[0];
if (!file) {
    console.error('Which backup? e.g.  npm run restore -- backups/firestore-2026-11-07_21-00.json --dry-run');
    process.exit(1);
}
const only = list(opt.only);
const dry = !!opt['dry-run'];
const backup = JSON.parse(readFileSync(file, 'utf8'));
const { db, projectId } = connect();

// Count first.
const count = (docs) => docs.reduce((n, d) => n + 1 + Object.values(d.sub ?? {}).reduce((m, s) => m + count(s), 0), 0);
const picked = Object.entries(backup.collections).filter(([name]) => !only || only.includes(name));
console.log(`Backup from ${backup.takenAt} (project ${backup.projectId})`);
for (const [name, docs] of picked) console.log(`  ${name}: ${count(docs)} documents`);
if (backup.projectId !== projectId) console.warn(`\n⚠️  This backup is from ${backup.projectId}, but the key is for ${projectId}.`);
if (dry) {
    console.log('\nDry run: nothing written.');
    process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`\nThis overwrites those documents in ${projectId}. Type the project id to go ahead: `);
rl.close();
if (answer.trim() !== projectId) {
    console.log('Cancelled.');
    process.exit(0);
}

const writer = db.bulkWriter();
let written = 0;
const put = (col, docs) => {
    for (const d of docs) {
        writer.set(col.doc(d.id), decode(d.data, db));
        written++;
        for (const [sub, subDocs] of Object.entries(d.sub ?? {})) put(col.doc(d.id).collection(sub), subDocs);
    }
};
for (const [name, docs] of picked) put(db.collection(name), docs);
await writer.close();
console.log(`✅ Restored ${written} documents.`);
process.exit(0);
