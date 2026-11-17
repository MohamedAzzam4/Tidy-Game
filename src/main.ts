/**
 * Bootstrap — save/restore, tide codes, HUD wiring, overlays.
 * The view owns canvas+input; this owns DOM and persistence.
 */
import './style.css';
import { generateWorld, parseTideCode, randomTide, tideCode, SCALES, scaleById } from './game/worldgen';
import { levelFromXp, LEVEL_XP, loadSave, nextLevelXp, SKILL_DEFS, SKILL_IDS, unlockedAt, writeSave, type SaveData, type SkillId } from './game/skills';
import type { RunStats } from './game/types';
import { TideView, type Progress } from './view/gameView';
import * as audio from './view/audio';

const storage = (() => {
  try { return window.localStorage; } catch { return null; }
})();
let save: SaveData = loadSave(storage);

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

const canvas = $<HTMLCanvasElement>('#sea');
const intro = $<HTMLDivElement>('#intro');
const finale = $<HTMLDivElement>('#finale');
const help = $<HTMLDivElement>('#help');
const toasts = $<HTMLDivElement>('#toasts');
const tideCodeBtn = $<HTMLButtonElement>('#tide-code');
const progressBar = $<HTMLDivElement>('#progress-bar');
const progressLabel = $<HTMLSpanElement>('#progress-label');
const streakChip = $<HTMLSpanElement>('#streak');
const skillsBox = $<HTMLDivElement>('#skills');
const xpLevel = $<HTMLSpanElement>('#xp-level');
const xpFill = $<HTMLDivElement>('#xp-fill');
const scaleCards = $<HTMLDivElement>('#scale-cards');
const tideInput = $<HTMLInputElement>('#tide-input');
const returningStats = $<HTMLDivElement>('#returning-stats');
const finaleStats = $<HTMLDivElement>('#finale-stats');
const finaleLore = $<HTMLParagraphElement>('#finale-lore');

let view: TideView | null = null;
let current = { seed: 0, scale: SCALES[0] };
let pickedScale: string = save.lastScale;
let lastLore = 'The keeper\'s only rule, carved above the lanterns: one shell at a time, and the day will do the rest.';

// ————— toasts —————

function toast(text: string, cls = '', ms = 2600): void {
  const el = document.createElement('div');
  el.className = `toast ${cls}`.trim();
  el.textContent = text;
  toasts.appendChild(el);
  while (toasts.children.length > 3) toasts.firstChild?.remove();
  window.setTimeout(() => el.remove(), ms);
}

// ————— tide codes / URL —————

function applyTide(t: { seed: number; scale: typeof SCALES[number] }): void {
  current = t;
  const url = new URL(window.location.href);
  url.searchParams.set('tide', tideCode(t.seed, t.scale));
  window.history.replaceState(null, '', url);
  tideCodeBtn.textContent = `code ${tideCode(t.seed, t.scale)}`;
}

function currentTideCode(): string {
  return tideCode(current.seed, current.scale);
}

async function copyCode(): Promise<void> {
  const url = `${window.location.origin}${window.location.pathname}?tide=${currentTideCode()}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Tide code copied — anyone who opens it sorts the same shore.', '', 2200);
  } catch {
    toast(`Tide code: ${currentTideCode()}`, '', 3200);
  }
}

// ————— HUD —————

function refreshXp(): void {
  const level = levelFromXp(save.xp);
  xpLevel.textContent = `lv ${level}`;
  const next = nextLevelXp(save.xp);
  const prevThresh = LEVEL_XP[Math.min(level, LEVEL_XP.length) - 1] ?? 0;
  const pct = next ? Math.min(100, Math.max(0, ((save.xp - prevThresh) / (next - prevThresh)) * 100)) : 100;
  xpFill.style.width = `${pct}%`;
}

function refreshSkills(): void {
  const unlocked = new Set(unlockedAt(save.xp));
  for (const btn of Array.from(skillsBox.querySelectorAll<HTMLButtonElement>('.skill'))) {
    const id = btn.dataset.skill as SkillId;
    const def = SKILL_DEFS[id];
    const isUnlocked = unlocked.has(id);
    btn.classList.toggle('locked', !isUnlocked);
    if (!isUnlocked) {
      const tip = btn.querySelector<HTMLDivElement>('.tip');
      if (tip) tip.textContent = `${def.name} — unlocks at level ${def.unlockLevel}: ${def.desc}`;
    }
  }
}

function buildSkillButtons(): void {
  skillsBox.innerHTML = '';
  let keyIdx = 1;
  for (const id of SKILL_IDS) {
    const def = SKILL_DEFS[id];
    const btn = document.createElement('button');
    btn.className = 'skill';
    btn.dataset.skill = id;
    const key = def.kind === 'active' ? String(keyIdx++) : '·';
    btn.innerHTML = `<span class="key">${key}</span>${def.name}<span class="cd"></span><span class="tip">${def.desc}</span>`;
    btn.addEventListener('click', () => {
      audio.unlock();
      if (!unlockedAt(save.xp).includes(id)) { toast(`${def.name} unlocks at level ${def.unlockLevel}.`, '', 1800); return; }
      if (def.kind === 'passive') { toast(`${def.name} is always on: ${def.desc}`, '', 2200); return; }
      const ok = view?.activateSkill(id) ?? false;
      if (!ok) toast(`${def.name} is resting.`, '', 1200);
    });
    skillsBox.appendChild(btn);
  }
}

/** Cooldown overlays for active skills — cheap rAF-driven poll. */
function cooldownLoop(): void {
  const now = performance.now();
  let keyIdx = 0;
  for (const id of SKILL_IDS) {
    const def = SKILL_DEFS[id];
    if (def.kind !== 'active') continue;
    keyIdx++;
    const btn = skillsBox.querySelector<HTMLButtonElement>(`.skill[data-skill="${id}"]`);
    if (!btn) continue;
    const until = view?.skills.cooldownsUntil[id] ?? 0;
    const left = Math.max(0, until - now);
    const cd = btn.querySelector<HTMLDivElement>('.cd');
    if (cd) cd.style.transform = `scaleX(${left > 0 ? left / ((def.cooldownS ?? 1) * 1000) : 0})`;
    btn.classList.toggle('active', left > 0);
    const key = btn.querySelector<HTMLSpanElement>('.key');
    if (key) key.textContent = String(keyIdx);
  }
  requestAnimationFrame(cooldownLoop);
}

function onProgress(p: Progress): void {
  const pct = p.crittersTotal > 0 ? (p.crittersFiled / p.crittersTotal) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  progressLabel.textContent = `${p.crittersFiled}/${p.crittersTotal} filed · ${p.jarsSealed}/${p.jarsTotal} sealed · ${p.jarsShelved}/${p.jarsTotal} shelved`;
  streakChip.textContent = `streak ${p.streak}`;
}

// ————— game lifecycle —————

function startGame(t: { seed: number; scale: typeof SCALES[number] }): void {
  applyTide(t);
  save.lastScale = t.scale.id;
  writeSave(storage, save);
  intro.classList.add('hidden');
  finale.classList.add('hidden');
  streakChip.textContent = 'streak 0';
  const world = generateWorld(t.seed, t.scale);
  if (!view) {
    view = new TideView(canvas, world, unlockedAt(save.xp), hooks);
  } else {
    view.setUnlocked(unlockedAt(save.xp));
    view.setWorld(world);
  }
  refreshSkills();
  refreshXp();
  audio.unlock();
  audio.setToggles(save.music, save.sfx);
  audio.startLayers();
}

function newTide(): void {
  const t = randomTide();
  t.scale = scaleById(pickedScale);
  startGame(t);
}

const hooks = {
  onXp(total: number, _level: number, _gained: number): void {
    if (total > save.xp) {
      save.xp = total;
      writeSave(storage, save);
    }
    refreshXp();
    refreshSkills();
  },
  onUnlock(skillId: SkillId): void {
    const def = SKILL_DEFS[skillId];
    toast(`Skill unlocked — ${def.name}: ${def.desc}`, 'skill', 4200);
  },
  onLore(line: string): void {
    lastLore = line;
    toast(line, 'lore', 7000);
  },
  onHint(text: string): void {
    toast(text, '', 2200);
  },
  onStreak(n: number): void {
    streakChip.textContent = `streak ${n}`;
    streakChip.classList.add('hot');
    window.setTimeout(() => streakChip.classList.remove('hot'), 900);
  },
  onComplete(stats: RunStats): void {
    save.best.tides += 1;
    if (!save.best.elapsedMs || stats.elapsedMs < save.best.elapsedMs) save.best.elapsedMs = stats.elapsedMs;
    if (stats.bestStreak > save.best.bestStreak) save.best.bestStreak = stats.bestStreak;
    writeSave(storage, save);
    finaleLore.textContent = lastLore;
    const mins = Math.floor(stats.elapsedMs / 60000);
    const secs = Math.floor((stats.elapsedMs % 60000) / 1000);
    finaleStats.innerHTML = [
      `<div class="stat"><b>${mins}:${String(secs).padStart(2, '0')}</b><span>tide time${save.best.elapsedMs === stats.elapsedMs ? ' · best!' : ''}</span></div>`,
      `<div class="stat"><b>${stats.bestStreak}</b><span>best streak</span></div>`,
      `<div class="stat"><b>${stats.goldenFound}</b><span>golden pearls</span></div>`,
      `<div class="stat"><b>${stats.mistakes}</b><span>gentle mistakes</span></div>`,
    ].join('');
    window.setTimeout(() => finale.classList.remove('hidden'), 1200);
  },
  onProgress,
};

// ————— intro —————

function buildIntro(): void {
  scaleCards.innerHTML = '';
  for (const s of SCALES) {
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.setAttribute('aria-pressed', String(s.id === pickedScale));
    const jars = s.gridCols * s.gridRows * s.jarsPerSpecies;
    const critters = jars * s.jarCapacity;
    btn.innerHTML = `<b>${s.label}</b><span>${s.blurb}</span><span class="muted">${jars} jars · ${critters} critters</span>`;
    btn.addEventListener('click', () => {
      pickedScale = s.id;
      audio.unlock(); audio.play('ui');
      for (const c of Array.from(scaleCards.children)) (c as HTMLElement).setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-pressed', 'true');
    });
    scaleCards.appendChild(btn);
  }
  if (save.xp > 0 || save.best.tides > 0) {
    returningStats.innerHTML = `<div class="stat"><b>lv ${levelFromXp(save.xp)}</b><span>your level · ${save.xp} xp</span></div><div class="stat"><b>${save.best.tides}</b><span>tides completed</span></div>`;
  } else {
    returningStats.innerHTML = '';
  }
}

// ————— wiring —————

$('#btn-start').addEventListener('click', () => {
  audio.unlock();
  const parsed = parseTideCode(tideInput.value);
  if (tideInput.value.trim() && !parsed) {
    toast('That code does not parse — try again or leave it blank for a random tide.', '', 2600);
    return;
  }
  const t = parsed ?? randomTide();
  if (!parsed) t.scale = scaleById(pickedScale);
  startGame(t);
});

tideCodeBtn.addEventListener('click', () => { void copyCode(); });
$('#btn-new').addEventListener('click', () => { audio.unlock(); audio.play('ui'); newTide(); });
$('#btn-again').addEventListener('click', () => { audio.play('ui'); newTide(); });
$('#btn-menu').addEventListener('click', () => { finale.classList.add('hidden'); buildIntro(); intro.classList.remove('hidden'); });
$('#btn-help').addEventListener('click', () => { audio.unlock(); audio.play('ui'); help.classList.remove('hidden'); });
$('#btn-help-close').addEventListener('click', () => { audio.play('ui'); help.classList.add('hidden'); });

const musicBtn = $<HTMLButtonElement>('#btn-music');
const sfxBtn = $<HTMLButtonElement>('#btn-sfx');
function refreshToggles(): void {
  musicBtn.setAttribute('aria-pressed', String(save.music));
  sfxBtn.setAttribute('aria-pressed', String(save.sfx));
  audio.setToggles(save.music, save.sfx);
}
musicBtn.addEventListener('click', () => { save.music = !save.music; writeSave(storage, save); refreshToggles(); audio.unlock(); });
sfxBtn.addEventListener('click', () => { save.sfx = !save.sfx; writeSave(storage, save); refreshToggles(); audio.unlock(); });

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'm') { save.music = !save.music; writeSave(storage, save); refreshToggles(); }
  else if (k === 'n') { save.sfx = !save.sfx; writeSave(storage, save); refreshToggles(); }
  else if (k === 'h') { help.classList.toggle('hidden'); }
  else if (k === 'escape') { help.classList.add('hidden'); }
  else if (['1', '2', '3'].includes(k)) {
    const actives = SKILL_IDS.filter((id) => SKILL_DEFS[id].kind === 'active');
    const id = actives[Number(k) - 1];
    if (id) view?.activateSkill(id);
  }
});

// ————— boot —————

function boot(): void {
  buildSkillButtons();
  buildIntro();
  refreshToggles();
  refreshSkills();
  refreshXp();
  cooldownLoop();
  const urlTide = parseTideCode(new URLSearchParams(window.location.search).get('tide'));
  if (urlTide) {
    pickedScale = urlTide.scale.id;
    buildIntro();
    // deep link: land straight on the shore
    startGame(urlTide);
  } else {
    intro.classList.remove('hidden');
    current = randomTide();
    applyTide({ seed: current.seed, scale: scaleById(pickedScale) });
  }
}

boot();

// e2e observability hook (read-only by convention — the repo's e2e pattern)
(window as unknown as { __tide: unknown }).__tide = {
  get view() { return view; },
  get world() { return view?.world ?? null; },
  get scaleId() { return pickedScale; },
};
