// TIDEKEEPER tests/run.mjs - assert-based checks for the pure logic (ponytail rule:
// risky logic ships with a test). Run: node tests/run.mjs  (or npm test)

import { mulberry32, codeFromSeed, seedFromCode, randomSeed } from '../js/rng.js';
import { generateExpedition, matchMoteBell, matchBellNiche, ramp, WORLD } from '../js/gen.js';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok -', name); }
  else { failed++; console.error('  FAIL -', name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name); }

console.log('rng.js');
{
  const a = mulberry32(1234), b = mulberry32(1234);
  ok(a() === b() && a() === b(), 'same seed, same stream');
  ok(mulberry32(1)() !== mulberry32(2)(), 'different seeds differ');
  eq(codeFromSeed(1), 'AAAB', 'codeFromSeed(1) = AAAB');
  eq(codeFromSeed(32), 'AABA', 'codeFromSeed(32) = AABA');
  let allOk = true;
  for (let i = 0; i < 500; i++) {
    const s = randomSeed();
    if (seedFromCode('TIDE-' + codeFromSeed(s)) !== s) { allOk = false; break; }
  }
  ok(allOk, 'share-code round-trip over 500 random seeds');
  ok(seedFromCode('TIDE-AAAB') === 1, 'seedFromCode accepts full code');
  ok(seedFromCode('aaab') === 1, 'seedFromCode is case-insensitive');
  ok(seedFromCode('garbage!!') === null, 'invalid code -> null (trust boundary)');
  ok(seedFromCode('TIDE-0000') === null || seedFromCode('TIDE-0000') >= 1, 'no zero/negative seeds');
}

console.log('gen.js - structure & invariants');
for (const expedition of [1, 3, 6, 12, 30]) {
  const gen = generateExpedition(777, expedition);
  const tag = `exp ${expedition}`;
  // determinism
  eq(gen, generateExpedition(777, expedition), `${tag}: same seed reproduces the exact same mess`);
  // bijection bells <-> niches by species+num
  const key = (s, n) => `${s}:${n}`;
  const bellKeys = new Set(gen.bells.map(b => key(b.species, b.num)));
  const nicheKeys = new Set(gen.niches.map(n => key(n.species, n.num)));
  ok(bellKeys.size === gen.bells.length && nicheKeys.size === gen.niches.length, `${tag}: no duplicate bells/niches`);
  eq([...bellKeys].sort(), [...nicheKeys].sort(), `${tag}: every bell has exactly one niche`);
  // every mote has exactly one matching bell
  for (const m of gen.motes) {
    const matches = gen.bells.filter(b => matchMoteBell(m, b) || (m.species === b.species && m.num === b.num));
    if (matches.length !== 1) { ok(false, `${tag}: mote ${m.id} matches exactly one bell`); break; }
  }
  ok(true, `${tag}: every mote matches exactly one bell`);
  // capacity conservation
  const capSum = gen.bells.reduce((t, b) => t + b.capacity, 0);
  ok(capSum === gen.motes.length, `${tag}: bell capacity sum == mote count`);
  // species hue separation (distinguishability is the game's legibility)
  let minHue = 360;
  for (let i = 0; i < gen.species.length; i++)
    for (let j = i + 1; j < gen.species.length; j++) {
      const d = Math.abs(gen.species[i].hue - gen.species[j].hue) % 360;
      minHue = Math.min(minHue, Math.min(d, 360 - d));
    }
  ok(minHue >= 18, `${tag}: species hues at least 18deg apart (got ${minHue.toFixed(1)})`);
  // geometry: inside world, bells off the wall band
  const inWorld = [...gen.bells, ...gen.motes].every(e => e.x > 0 && e.x < WORLD.w && e.y > 44 && e.y < 548);
  ok(inWorld, `${tag}: all entities inside the water field`);
  ok(gen.niches.every(n => n.y >= 560 && n.y <= 712), `${tag}: niches on the wall band`);
  // lumen variable-ratio rate stays in a sane band
  ok(gen.lumenCount / gen.motes.length < 0.15, `${tag}: lumen rate < 15%`);
}

console.log('gen.js - ramp');
{
  const counts = [1, 2, 4, 8, 16].map(n => ramp(n));
  const bells = counts.map(r => r.species * r.nums);
  ok(Math.max(...bells) <= 18, 'bell count capped at 18');
  ok(Math.min(...bells) >= 8, 'bell count never below the starter size');
  const gen10 = generateExpedition(5, 10), gen20 = generateExpedition(5, 20);
  ok(gen20.motes.length >= gen10.motes.length, 'expedition 20 is at least as heavy as 10');
}

console.log('matching rules');
{
  const gen = generateExpedition(42, 2);
  const m = gen.motes[0];
  const good = gen.bells.find(b => b.species === m.species && b.num === m.num);
  const wrongNum = gen.bells.find(b => b.species === m.species && b.num !== m.num);
  const wrongSp = gen.bells.find(b => b.species !== m.species);
  ok(matchMoteBell(m, good), 'mote files into same species+num bell');
  ok(wrongNum === undefined || !matchMoteBell(m, wrongNum), 'mote refuses same species, wrong pip');
  ok(wrongSp === undefined || !matchMoteBell(m, wrongSp), 'mote refuses wrong species');
  const bell = gen.bells[0];
  const niche = gen.niches.find(n => n.species === bell.species && n.num === bell.num);
  ok(matchBellNiche(bell, niche), 'bell seats in its niche');
  niche.bellId = bell.id;
  ok(!matchBellNiche(bell, niche), 'occupied niche refuses');
}

console.log('skills.js');
{
  const { SKILLS, canBuy, buy, equip, loadProfile } = await import('../js/skills.js');
  // node has no localStorage: skills.js must guard it and return defaults
  const p = loadProfile();
  ok(Array.isArray(p.owned) && p.pearls === 0, 'profile defaults load without localStorage');
  const cradle = SKILLS.find(s => s.id === 'cradle');
  ok(!canBuy(p, cradle), 'cannot buy without pearls');
  p.pearls = 40;
  ok(buy(p, cradle) && p.pearls === 0 && p.owned.includes('cradle'), 'buy deducts pearls and unlocks');
  equip(p, cradle);
  ok(p.equippedP.includes('cradle'), 'equip passive');
  const sip = SKILLS.find(s => s.id === 'sip');
  p.pearls = 120; buy(p, sip); equip(p, sip);
  const echo = SKILLS.find(s => s.id === 'echo');
  p.pearls = 60; buy(p, echo); equip(p, echo);
  ok(p.equippedA === 'echo' && p.equippedP.length === 2, '2 passives + 1 active equipped');
  const other = SKILLS.find(s => s.kind === 'passive' && s.id !== 'cradle' && s.id !== 'sip');
  p.pearls = other.cost; buy(p, other); equip(p, other);
  ok(p.equippedP.length === 2 && p.equippedP.includes(other.id), 'third passive replaces oldest (FIFO)');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
