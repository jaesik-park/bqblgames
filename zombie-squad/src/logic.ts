import {
  BUILDING_BY_ID,
  BUILDINGS,
  HERO_BY_ID,
  HEROES,
  MAX_STARS,
  RARITY_WEIGHT,
  RECRUIT_COST,
  SQUAD_SIZE,
  type BuildingId,
  type Cost,
  type HeroDef,
  type PerkType,
  type Rarity,
  type ResKey,
} from './data';
import type { GameState, HeroState } from './state';

/** Production is held for at most this long before it must be collected. */
const STORAGE_SECONDS = 2 * 3600;

// ---------- Buildings ----------

export function productionRate(id: BuildingId, level: number): number {
  const def = BUILDING_BY_ID[id];
  if (!def.baseRate) return 0;
  return def.baseRate * level * Math.pow(1.1, level - 1);
}

export function pending(s: GameState, id: BuildingId, now: number): number {
  const b = s.buildings[id];
  const rate = productionRate(id, b.level);
  const secs = Math.max(0, (now - b.lastCollect) / 1000);
  return Math.min(rate * secs, rate * STORAGE_SECONDS);
}

export function collect(s: GameState, id: BuildingId, now: number): number {
  const def = BUILDING_BY_ID[id];
  if (!def.produces) return 0;
  const amount = Math.floor(pending(s, id, now));
  s.res[def.produces] += amount;
  s.buildings[id].lastCollect = now;
  return amount;
}

export function collectAll(s: GameState, now: number): Cost {
  const got: Cost = {};
  for (const def of BUILDINGS) {
    if (!def.produces) continue;
    const n = collect(s, def.id, now);
    got[def.produces] = (got[def.produces] ?? 0) + n;
  }
  return got;
}

export function upgradeCost(id: BuildingId, level: number): Cost {
  const out: Cost = {};
  const base = BUILDING_BY_ID[id].baseCost;
  for (const k of Object.keys(base) as ResKey[]) {
    out[k] = Math.round(base[k]! * Math.pow(1.55, level - 1));
  }
  return out;
}

export function upgradeSeconds(id: BuildingId, level: number): number {
  return Math.round(BUILDING_BY_ID[id].baseTime * Math.pow(1.6, level - 1));
}

export function canAfford(s: GameState, cost: Cost): boolean {
  return (Object.keys(cost) as ResKey[]).every((k) => s.res[k] >= cost[k]!);
}

function pay(s: GameState, cost: Cost): void {
  for (const k of Object.keys(cost) as ResKey[]) s.res[k] -= cost[k]!;
}

export function maxLevel(s: GameState, id: BuildingId): number {
  return id === 'hq' ? 30 : s.buildings.hq.level;
}

/** Returns an error message, or null on success. */
export function startUpgrade(s: GameState, id: BuildingId, now: number): string | null {
  if (s.upgrading) return '이미 다른 건물을 건설 중입니다';
  const lv = s.buildings[id].level;
  if (lv >= maxLevel(s, id)) return '본부 레벨을 먼저 올리세요';
  const cost = upgradeCost(id, lv);
  if (!canAfford(s, cost)) return '자원이 부족합니다';
  pay(s, cost);
  s.upgrading = { id, endsAt: now + upgradeSeconds(id, lv) * 1000 };
  return null;
}

function completeUpgrade(s: GameState, now: number): BuildingId | null {
  if (!s.upgrading) return null;
  const id = s.upgrading.id;
  // Bank production at the old rate before the level changes.
  collect(s, id, now);
  s.buildings[id].level += 1;
  s.upgrading = null;
  return id;
}

/** Completes the running upgrade if its timer has elapsed. */
export function tickUpgrades(s: GameState, now: number): BuildingId | null {
  if (s.upgrading && now >= s.upgrading.endsAt) return completeUpgrade(s, now);
  return null;
}

export function speedUpCost(s: GameState, now: number): number {
  if (!s.upgrading) return 0;
  return Math.max(1, Math.ceil((s.upgrading.endsAt - now) / 1000 / 10));
}

export function speedUp(s: GameState, now: number): string | null {
  if (!s.upgrading) return null;
  const gems = speedUpCost(s, now);
  if (s.res.gems < gems) return '다이아가 부족합니다';
  s.res.gems -= gems;
  completeUpgrade(s, now);
  return null;
}

// ---------- Heroes ----------

export function heroPower(def: HeroDef, h: HeroState): number {
  return Math.round(def.basePower * (1 + 0.12 * (h.level - 1)) * (1 + 0.25 * (h.stars - 1)));
}

export function perkValue(def: HeroDef, h: HeroState): number {
  return def.perk.value * (1 + 0.2 * (h.stars - 1));
}

export function heroMaxLevel(s: GameState): number {
  return s.buildings.hq.level * 5;
}

export function heroLevelCost(level: number): Cost {
  return {
    food: Math.round(60 * Math.pow(1.3, level - 1)),
    steel: Math.round(20 * Math.pow(1.3, level - 1)),
  };
}

export function levelUpHero(s: GameState, id: string): string | null {
  const h = s.heroes[id];
  if (!h) return '보유하지 않은 영웅입니다';
  if (h.level >= heroMaxLevel(s)) return '본부 레벨을 먼저 올리세요';
  const cost = heroLevelCost(h.level);
  if (!canAfford(s, cost)) return '자원이 부족합니다';
  pay(s, cost);
  h.level += 1;
  return null;
}

export interface RecruitResult {
  def: HeroDef;
  isNew: boolean;
  /** Star gained from a duplicate (false when already at max stars). */
  starUp: boolean;
}

function rollRarity(): Rarity {
  const total = RARITY_WEIGHT.R + RARITY_WEIGHT.SR + RARITY_WEIGHT.SSR;
  let r = Math.random() * total;
  for (const k of ['SSR', 'SR', 'R'] as Rarity[]) {
    r -= RARITY_WEIGHT[k];
    if (r < 0) return k;
  }
  return 'R';
}

export function recruit(s: GameState, times: number): RecruitResult[] | string {
  const cost = times >= 10 ? RECRUIT_COST * 9 : RECRUIT_COST * times;
  if (s.res.gems < cost) return '다이아가 부족합니다';
  s.res.gems -= cost;
  const out: RecruitResult[] = [];
  for (let i = 0; i < times; i++) {
    const rarity = rollRarity();
    const pool = HEROES.filter((h) => h.rarity === rarity);
    const def = pool[Math.floor(Math.random() * pool.length)];
    const owned = s.heroes[def.id];
    if (!owned) {
      s.heroes[def.id] = { level: 1, stars: 1 };
      out.push({ def, isNew: true, starUp: false });
      if (s.squad.length < SQUAD_SIZE) s.squad.push(def.id);
    } else if (owned.stars < MAX_STARS) {
      owned.stars += 1;
      out.push({ def, isNew: false, starUp: true });
    } else {
      s.res.steel += 200;
      out.push({ def, isNew: false, starUp: false });
    }
  }
  return out;
}

export function toggleSquad(s: GameState, id: string): string | null {
  const i = s.squad.indexOf(id);
  if (i >= 0) {
    if (s.squad.length <= 1) return '최소 1명의 영웅이 필요합니다';
    s.squad.splice(i, 1);
    return null;
  }
  if (s.squad.length >= SQUAD_SIZE) return `분대는 최대 ${SQUAD_SIZE}명입니다`;
  s.squad.push(id);
  return null;
}

// ---------- Battle ----------

export interface BattleConfig {
  stage: number;
  soldiers: number;
  damage: number;
  fireInterval: number;
  armor: number;
  heroIcons: string[];
  power: number;
}

export function battleConfig(s: GameState): BattleConfig {
  const perks: Record<PerkType, number> = { dmg: 0, rate: 0, soldiers: 0, armor: 0 };
  let heroPowerSum = 0;
  const heroIcons: string[] = [];
  for (const id of s.squad) {
    const def = HERO_BY_ID[id];
    const h = s.heroes[id];
    if (!def || !h) continue;
    heroPowerSum += heroPower(def, h);
    perks[def.perk.type] += perkValue(def, h);
    heroIcons.push(def.icon);
  }
  const lab = s.buildings.lab.level;
  const damage = 10 * (1 + heroPowerSum / 400) * (1 + 0.08 * (lab - 1)) * (1 + perks.dmg);
  const soldiers = 5 + 2 * (s.buildings.barracks.level - 1) + Math.round(perks.soldiers);
  const fireInterval = 0.16 / (1 + perks.rate);
  return {
    stage: s.stage,
    soldiers,
    damage,
    fireInterval,
    armor: Math.min(0.6, perks.armor),
    heroIcons,
    power: Math.round(heroPowerSum + damage * soldiers),
  };
}

export interface StageReward {
  food: number;
  wood: number;
  steel: number;
  gems: number;
}

export function stageReward(stage: number, win: boolean): StageReward {
  const g = Math.pow(1.2, stage - 1);
  const r = {
    food: Math.round(150 * g),
    wood: Math.round(150 * g),
    steel: Math.round(50 * g),
    gems: 30 + (stage % 5 === 0 ? 100 : 0),
  };
  if (win) return r;
  return { food: Math.round(r.food * 0.2), wood: Math.round(r.wood * 0.2), steel: Math.round(r.steel * 0.2), gems: 0 };
}

export function applyReward(s: GameState, r: StageReward): void {
  s.res.food += r.food;
  s.res.wood += r.wood;
  s.res.steel += r.steel;
  s.res.gems += r.gems;
}

// ---------- Formatting ----------

export function fmt(n: number): string {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
