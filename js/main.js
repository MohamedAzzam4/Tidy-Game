// TIDEKEEPER main.js - bootstrap, DOM glue, screens, HUD, input wiring.

import { initAudio, setVolumes, suspend, resume, click, ready } from './audio.js';
import { createGame } from './game.js';
import { draw, drawLegendGlyph } from './render.js';
import { randomSeed, seedFromCode, codeFromSeed } from './rng.js';
import { SKILLS, loadProfile, saveProfile, rankFromXp, rankFloor, rankCeil, canBuy, buy, equip } from './skills.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const roman = n => ROMAN[Math.min(n, ROMAN.length - 1)] ?? n;

const $ = id => document.getElementById(id);
const canvas = $('sea');
const ctx = canvas.getContext('2d');

const profile = loadProfile();
const game = createGame(canvas, profile, {
  onExpeditionStart: showIntro,
  onBloom: showBloom,
  onRankUp: rank => { toast(`Keeper Rank ${roman(rank)} — +20 pearls for your tide pouch`); profile.pearls += 20; saveProfile(profile); },
  onBellFilled: () => {},
});

// ---------- canvas sizing ----------
let cssW = 0, cssH = 0, dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = window.innerWidth; cssH = window.innerHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
}
window.addEventListener('resize', resize);
resize();

// ---------- loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    game.update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, game, cssW, cssH);
    syncHud();
  } catch (err) { console.error('frame error:', err); } // one bad frame must not kill the tide
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- HUD ----------
let hudCache = '';
function syncHud() {
  const pearls = profile.pearls + game.runPearls;
  const xp = profile.xp + game.runXp;
  const rank = rankFromXp(xp);
  const lo = rankFloor(rank), hi = rankCeil(rank);
  const pct = Math.min(100, Math.max(0, ((xp - lo) / (hi - lo)) * 100));
  const st = game.streak;
  const sig = `${pearls}|${rank}|${pct.toFixed(1)}|${st}|${game.gen?.expedition ?? 0}`;
  if (sig !== hudCache) {
    hudCache = sig;
    $('pearlCount').textContent = pearls;
    $('rankNum').textContent = roman(rank);
    $('xpFill').style.width = pct + '%';
    $('expLabel').textContent = `Expedition ${roman(game.gen?.expedition ?? 1)}`;
    $('streakNum').textContent = st;
    $('streakChip').classList.toggle('hidden', st < 2);
  }
  syncActiveBtn(); // cooldown ring + equip state change every frame
}

const ICONS = {
  sonar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 5a7 7 0 017 7M12 2a10 10 0 0110 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  swirl: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 109 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg>',
};
function syncActiveBtn() {
  const btn = $('activeBtn');
  const skill = SKILLS.find(s => s.id === profile.equippedA);
  if (!skill || (game.phase !== 'play' && game.phase !== 'intro')) { btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  $('activeIcon').innerHTML = ICONS[skill.icon] ?? '';
  $('activeName').textContent = skill.name;
  const cd = game.activeCd;
  btn.classList.toggle('cooling', cd > 0);
  $('activeCd').style.width = `${(1 - cd / skill.cooldown) * 100}%`;
}

// ---------- screens ----------
const SCREENS = ['titleScreen', 'introScreen', 'bloomScreen', 'skillsScreen', 'settingsScreen', 'howScreen'];
let topScreen = 'titleScreen';
function showScreen(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  topScreen = id;
  $('hud').classList.toggle('hidden', id === 'titleScreen' || id === 'bloomScreen');
  $('activeBtn').classList.toggle('hidden', id === 'titleScreen' || id === 'bloomScreen');
}
function hideAllScreens() { SCREENS.forEach(s => $(s).classList.add('hidden')); topScreen = null; $('hud').classList.remove('hidden'); }

function showTitle() {
  game.phase = 'title';
  $('nextExp').textContent = roman(profile.expeditions + 1);
  const log = $('tideLog');
  log.innerHTML = profile.log.length
    ? profile.log.map(e => `<span class="entry">${e.code} — best streak <b>${e.streak}</b></span>`).join('') +
      `<span class="entry">tides finished: <b>${profile.expeditions}</b> · best streak: <b>${profile.bestStreak}</b></span>`
    : `<span class="entry">the first tide is yours to name</span>`;
  showScreen('titleScreen');
}

function showIntro(gen) {
  $('introExp').textContent = roman(gen.expedition);
  $('introCode').textContent = gen.code;
  const legend = $('legend');
  legend.innerHTML = '';
  for (const sp of gen.species) {
    const chip = document.createElement('span');
    chip.className = 'sp';
    chip.style.color = `hsl(${sp.hue},75%,72%)`;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    drawLegendGlyph(c.getContext('2d'), sp.glyph, sp.hue, 16, 16, 9);
    chip.appendChild(c);
    chip.appendChild(Object.assign(document.createElement('span'), { textContent: `${sp.name} ×${gen.niches.filter(n => n.species === sp.id).length}` }));
    legend.appendChild(chip);
  }
  $('hud').classList.remove('hidden');
  showScreen('introScreen');
}

function showBloom() {
  const res = game.finishRun();
  saveProfile(profile);
  $('stMotes').textContent = game.runMotes;
  $('stBells').textContent = game.runBells;
  $('stStreak').textContent = game.streak;
  $('stPearls').textContent = '+' + game.runPearls;
  $('stLumen').textContent = game.runLumen;
  $('nextExp2').textContent = roman(profile.expeditions + 1);
  const notice = $('rankNotice');
  if (res.rankAfter > res.rankBefore) {
    notice.textContent = `Keeper Rank ${roman(res.rankAfter)} reached.`;
    notice.classList.remove('hidden');
  } else notice.classList.add('hidden');
  $('hud').classList.add('hidden');
  $('activeBtn').classList.add('hidden');
  showScreen('bloomScreen');
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- buttons ----------
$('btnDive').onclick = () => { if (ensureAudio()) game.newExpedition(randomSeed()); };
$('btnCode').onclick = () => {
  const seed = seedFromCode($('codeInput').value);
  if (!seed) { toast('That code does not chart a grotto. Try TIDE-XXXX.'); return; }
  if (ensureAudio()) game.newExpedition(seed);
};
$('btnDiveIn').onclick = () => { click(); game.diveIn(); hideAllScreens(); };
$('btnIntroBack').onclick = () => { click(); showTitle(); };
$('btnNext').onclick = () => { click(); game.newExpedition(randomSeed()); };
$('btnSurface').onclick = () => { click(); showTitle(); };
$('btnHow').onclick = () => { click(); showScreen('howScreen'); };
$('btnHowBack').onclick = () => showTitle();
$('btnSkillsOpen').onclick = () => { click(); openSkills(); };
$('btnSkillsBack').onclick = () => showTitle();
$('btnSettingsOpen').onclick = () => { click(); openSettings(); };
$('btnSettingsBack').onclick = () => showTitle();

$('btnMute').onclick = () => {
  const s = profile.settings;
  s.master = s.master > 0 ? 0 : 0.9;
  setVolumes(s); saveProfile(profile);
  $('muteWave').style.opacity = s.master > 0 ? 1 : 0.15;
};
$('btnSkills').onclick = () => { click(); openSkills(); };
$('btnSettings').onclick = () => { click(); openSettings(); };

$('activeBtn').onclick = () => game.useActive();

// ---------- skills screen ----------
function openSkills() {
  $('skillPearls').textContent = profile.pearls;
  const list = $('skillList');
  list.innerHTML = '';
  for (const sk of SKILLS) {
    const owned = profile.owned.includes(sk.id);
    const eq = profile.equippedP.includes(sk.id) || profile.equippedA === sk.id;
    const card = document.createElement('div');
    card.className = 'skill-card' + (eq ? ' equipped' : owned ? ' owned' : canBuy(profile, sk) ? '' : ' locked');
    card.innerHTML = `<h3>${sk.name} <span class="kind">${sk.kind}</span></h3><p>${sk.desc}</p>
      <div class="cost">${owned ? (eq ? 'tap to unequip' : 'tap to equip') : `${sk.cost} pearls`}</div>`;
    card.onclick = () => {
      if (!owned) {
        if (buy(profile, sk)) { toast(`${sk.name} learned — it is yours now`); click(); }
        else toast('Not enough pearls yet. The tide provides.');
      } else { equip(profile, sk); click(); }
      saveProfile(profile); syncHud(); openSkills();
    };
    list.appendChild(card);
  }
  showScreen('skillsScreen');
}

// ---------- settings screen ----------
function openSettings() {
  const s = profile.settings;
  $('volMaster').value = s.master; $('volMusic').value = s.music; $('volSfx').value = s.sfx;
  $('tapCarry').checked = s.tapCarry !== false;
  $('reduceMotion').checked = !!s.reduceMotion;
  showScreen('settingsScreen');
}
$('volMaster').oninput = e => { profile.settings.master = +e.target.value; applyVolumes(); };
$('volMusic').oninput = e => { profile.settings.music = +e.target.value; applyVolumes(); };
$('volSfx').oninput = e => { profile.settings.sfx = +e.target.value; applyVolumes(); };
$('tapCarry').onchange = e => { profile.settings.tapCarry = e.target.checked; saveProfile(profile); };
$('reduceMotion').onchange = e => { profile.settings.reduceMotion = e.target.checked; saveProfile(profile); };
$('btnReset').onclick = () => {
  if (!confirm('Return all pearls, ranks and Attunements to the sea?')) return;
  localStorage.removeItem('tidekeeper.save.v1');
  Object.assign(profile, loadProfile());
  showTitle(); toast('The tide keeps nothing. A fresh start.');
};
function applyVolumes() { if (ready()) setVolumes(profile.settings); saveProfile(profile); }

// ---------- input ----------
let audioReady = false;
function ensureAudio() {
  if (!audioReady) { initAudio(); audioReady = true; }
  setVolumes(profile.settings);
  return true;
}

canvas.addEventListener('pointerdown', e => { ensureAudio(); resume(); game.onDown(e); });
window.addEventListener('pointermove', e => game.onMove(e));
window.addEventListener('pointerup', e => game.onUp(e));
window.addEventListener('pointercancel', () => game.onCancel());
canvas.addEventListener('contextmenu', e => { e.preventDefault(); game.cancelCarry(); });

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (game.phase === 'play' && !topScreen) game.cancelCarry();
    else if (topScreen && topScreen !== 'titleScreen') showTitle();
  } else if (e.key.toLowerCase() === 'm') { $('btnMute').onclick(); }
  else if (e.key.toLowerCase() === 'e') { game.useActive(); }
});

document.addEventListener('visibilitychange', () => { document.hidden ? suspend() : resume(); });

// test hook: lets the browser smoke-test drive the real game object
window.__tide = game;

// ---------- go ----------
showTitle();
