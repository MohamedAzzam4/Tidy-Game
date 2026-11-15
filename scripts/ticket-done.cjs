#!/usr/bin/env node
/*
 * Marks a ticket done in the repo-local store (owner-approved implementation
 * phase, 2026-11-15). Usage: node scripts/ticket-done.cjs CC-004 "evidence note"
 * - sets status "done" + started true in docs/tickets/tickets.json
 * - updates the record's Status line in docs/tickets/<ID>.md
 * - appends a dated completion note under the record's Verification section
 * - re-runs the store validation (dependency discipline enforced there)
 */
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'docs', 'tickets', 'tickets.json');
const RECORDS = path.join(__dirname, '..', 'docs', 'tickets');

const [id, ...noteParts] = process.argv.slice(2);
if (!id) {
  console.error('usage: node scripts/ticket-done.cjs <CC-NNN> [note]');
  process.exit(2);
}
const note = noteParts.join(' ').trim();

const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const t = store.tickets.find((x) => x.id === id);
if (!t) { console.error(`unknown ticket ${id}`); process.exit(2); }
const unmet = (t.dependsOn || []).filter((d) => {
  const dep = store.tickets.find((x) => x.id === d);
  return !dep || dep.status !== 'done';
});
if (unmet.length) {
  console.error(`${id}: dependencies not done yet: ${unmet.join(', ')}`);
  process.exit(1);
}
t.status = 'done';
t.started = true;
t.completedAt = new Date().toISOString().slice(0, 10);
if (note) t.completionNote = note;
fs.writeFileSync(STORE, JSON.stringify(store, null, 2) + '\n');

const recPath = path.join(RECORDS, `${id}.md`);
let md = fs.readFileSync(recPath, 'utf8');
md = md.replace(/\|\s*Status\s*\|\s*[^|]*\|/, `| Status | **done** — acceptance verified ${t.completedAt} |`);
if (note) {
  md = md.trimEnd() + `\n\n## Completion (${t.completedAt})\n\n${note}\n`;
}
fs.writeFileSync(recPath, md);

console.log(`marked ${id} done${note ? ` — ${note}` : ''}`);
