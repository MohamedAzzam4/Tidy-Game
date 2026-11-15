#!/usr/bin/env node
/*
 * Local ticket store manager (approved zero-install substitution for the
 * unavailable `tk` CLI — see docs/tickets/tickets.json "tool" field).
 *
 * Commands:
 *   node scripts/tickets.cjs check    validate store + records + dependency graph (default)
 *   node scripts/tickets.cjs cycles   dependency-cycle check only
 *   node scripts/tickets.cjs summary  print the ticket graph summary
 *   node scripts/tickets.cjs order    print a topological execution order
 *
 * The store is the single machine-readable source of ticket truth; each ticket
 * also has a human-readable record at docs/tickets/<ID>.md. No dependencies.
 */
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'docs', 'tickets', 'tickets.json');
const RECORDS_DIR = path.join(__dirname, '..', 'docs', 'tickets');

function load() {
  return JSON.parse(fs.readFileSync(STORE, 'utf8'));
}

let problems = [];
function problem(msg) {
  problems.push(msg);
}

function validateShape(store) {
  const tickets = store.tickets || [];
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const KINDS = new Set(['epic', 'impl', 'verify']);

  const ids = tickets.map((t) => t.id);
  ids.forEach((id, i) => {
    if (!/^CC-\d{3}$/.test(id)) problem(`bad id format: ${id}`);
    if (ids.indexOf(id) !== i) problem(`duplicate id: ${id}`);
  });

  for (const t of tickets) {
    if (!KINDS.has(t.kind)) problem(`${t.id}: unknown kind "${t.kind}"`);
    // Implementation is authorized (owner approval, 2026-11-15): tickets may now
    // be marked "done" once their acceptance checks pass. Everything else stays
    // open/unstarted, and a ticket may only be done when all its deps are done.
    if (t.status !== 'open' && t.status !== 'done') {
      problem(`${t.id}: status must be "open" or "done" (got "${t.status}")`);
    }
    if (t.started !== (t.status === 'done')) {
      problem(`${t.id}: started must be ${t.status === 'done'} for status "${t.status}"`);
    }
    if (!Array.isArray(t.dependsOn)) problem(`${t.id}: dependsOn must be an array`);
    for (const dep of t.dependsOn || []) {
      if (dep === t.id) problem(`${t.id}: depends on itself`);
      if (!byId.has(dep)) problem(`${t.id}: unknown dependency "${dep}"`);
      if (t.status === 'done' && byId.get(dep).status !== 'done') {
        problem(`${t.id}: marked done but dependency ${dep} is not done`);
      }
    }
    if (t.kind === 'epic') {
      const others = tickets.filter((x) => x.id !== t.id);
      for (const child of t.children || []) {
        if (!byId.has(child)) problem(`${t.id}: unknown child "${child}"`);
      }
      for (const x of others) {
        if (x.parent !== t.id) problem(`${t.id}: ${x.id} does not point back at the epic via parent`);
        if (!(t.children || []).includes(x.id)) problem(`${t.id}: ${x.id} missing from epic children`);
      }
    } else {
      if (!t.parent) problem(`${t.id}: non-epic ticket missing parent`);
      else if (!byId.has(t.parent)) problem(`${t.id}: unknown parent "${t.parent}"`);
      else if (byId.get(t.parent).kind !== 'epic') problem(`${t.id}: parent is not the epic`);
    }
    for (const field of ['title', 'owns', 'verify']) {
      if (!t[field] || typeof t[field] !== 'string') problem(`${t.id}: missing "${field}"`);
    }
    if (!Array.isArray(t.acceptance) || t.acceptance.length === 0) problem(`${t.id}: acceptance criteria required`);
    if (!Array.isArray(t.files) || t.files.length === 0) problem(`${t.id}: "files" required`);

    const record = path.join(RECORDS_DIR, `${t.id}.md`);
    if (!fs.existsSync(record)) problem(`${t.id}: missing record file docs/tickets/${t.id}.md`);
    else if (!fs.readFileSync(record, 'utf8').includes(`# ${t.id}`)) {
      problem(`${t.id}: record does not start with "# ${t.id}" heading`);
    }
  }

  const epics = tickets.filter((t) => t.kind === 'epic');
  if (epics.length !== 1) problem(`expected exactly one epic, found ${epics.length}`);
  return { tickets, byId };
}

function findCycles(tickets, byId) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tickets.map((t) => [t.id, WHITE]));
  const cycles = [];
  const stack = [];
  function visit(id) {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of byId.get(id).dependsOn || []) {
      if (!byId.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        const i = stack.indexOf(dep);
        cycles.push(stack.slice(i).concat(dep));
      } else if (color.get(dep) === WHITE) {
        visit(dep);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }
  for (const t of tickets) if (color.get(t.id) === WHITE) visit(t.id);
  return cycles;
}

function topoOrder(tickets, byId) {
  const deps = new Map(tickets.map((t) => [t.id, new Set(t.dependsOn || [])]));
  const order = [];
  const done = new Set();
  let progress = true;
  while (progress && done.size < tickets.length) {
    progress = false;
    for (const t of tickets) {
      if (done.has(t.id)) continue;
      const unmet = [...deps.get(t.id)].filter((d) => !done.has(d));
      if (unmet.length === 0) {
        order.push(t.id);
        done.add(t.id);
        progress = true;
      }
    }
  }
  return order; // empty tail means unresolvable deps (cycle) — caught by findCycles
}

function cmdCheck() {
  const store = load();
  const { tickets } = validateShape(store);
  const cycles = findCycles(tickets, store.tickets.reduce((m, t) => m.set(t.id, t), new Map()));
  for (const c of cycles) problem(`dependency cycle: ${c.join(' -> ')}`);
  const order = topoOrder(tickets, store.tickets.reduce((m, t) => m.set(t.id, t), new Map()));
  if (order.length !== tickets.length) problem('topological order incomplete (graph not a DAG)');

  if (problems.length) {
    console.error(`TICKET STORE INVALID — ${problems.length} problem(s):`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`TICKET STORE OK — ${tickets.length} tickets (1 epic, ${tickets.filter(t => t.kind === 'impl').length} impl, ${tickets.filter(t => t.kind === 'verify').length} verify)`);
  console.log('  unique ids, parent/children consistent, records present');
  console.log('  dependency graph: no cycles (DAG verified)');
  console.log(`  topological order: ${order.join(' -> ')}`);
}

function cmdCycles() {
  const store = load();
  const byId = new Map(store.tickets.map((t) => [t.id, t]));
  const cycles = findCycles(store.tickets, byId);
  if (cycles.length) {
    for (const c of cycles) console.error('CYCLE: ' + c.join(' -> '));
    process.exit(1);
  }
  console.log('NO CYCLES — dependency graph is a DAG');
}

function cmdSummary() {
  const store = load();
  for (const t of store.tickets) {
    const deps = (t.dependsOn || []).join(', ') || '(none)';
    console.log(`${t.id}  [${t.kind}]  ${t.title}`);
    console.log(`        depends on: ${deps}`);
  }
}

function cmdOrder() {
  const store = load();
  const byId = new Map(store.tickets.map((t) => [t.id, t]));
  console.log(topoOrder(store.tickets, byId).join(' -> '));
}

const cmd = process.argv[2] || 'check';
({ check: cmdCheck, cycles: cmdCycles, summary: cmdSummary, order: cmdOrder }[cmd] ||
  (() => { console.error('unknown command: ' + cmd); process.exit(2); }))();
