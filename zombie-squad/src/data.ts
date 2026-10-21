export type ResKey = 'food' | 'wood' | 'steel';
export type AnyRes = ResKey | 'gems';
export type Cost = Partial<Record<ResKey, number>>;

export const RES_META: Record<AnyRes, { name: string; icon: string }> = {
  food: { name: '식량', icon: '🌽' },
  wood: { name: '목재', icon: '🪵' },
  steel: { name: '강철', icon: '🔩' },
  gems: { name: '다이아', icon: '💎' },
};

export type BuildingId = 'hq' | 'farm' | 'lumber' | 'foundry' | 'barracks' | 'lab';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  desc: string;
  produces?: ResKey;
  /** Production per second at level 1. */
  baseRate?: number;
  /** Cost of the 1 -> 2 upgrade; scales per level. */
  baseCost: Cost;
  /** Seconds for the 1 -> 2 upgrade; scales per level. */
  baseTime: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'hq', name: '본부', icon: '🏛️', desc: '다른 건물의 최대 레벨', baseCost: { wood: 200, steel: 80 }, baseTime: 10 },
  { id: 'farm', name: '농장', icon: '🌾', desc: '식량 생산', produces: 'food', baseRate: 0.5, baseCost: { wood: 80 }, baseTime: 5 },
  { id: 'lumber', name: '벌목장', icon: '🪓', desc: '목재 생산', produces: 'wood', baseRate: 0.4, baseCost: { food: 80 }, baseTime: 5 },
  { id: 'foundry', name: '제철소', icon: '🏭', desc: '강철 생산', produces: 'steel', baseRate: 0.15, baseCost: { food: 100, wood: 100 }, baseTime: 8 },
  { id: 'barracks', name: '훈련소', icon: '⛺', desc: '출격 병력 +2 / 레벨', baseCost: { food: 150, wood: 120 }, baseTime: 8 },
  { id: 'lab', name: '연구소', icon: '🔬', desc: '공격력 +8% / 레벨', baseCost: { wood: 150, steel: 100 }, baseTime: 10 },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

export type Rarity = 'R' | 'SR' | 'SSR';
export type PerkType = 'dmg' | 'rate' | 'soldiers' | 'armor';

export interface HeroDef {
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  role: '공격' | '방어' | '지원';
  basePower: number;
  perk: { type: PerkType; value: number };
}

export const PERK_LABEL: Record<PerkType, (v: number) => string> = {
  dmg: (v) => `공격력 +${Math.round(v * 100)}%`,
  rate: (v) => `연사 속도 +${Math.round(v * 100)}%`,
  soldiers: (v) => `시작 병력 +${Math.round(v)}`,
  armor: (v) => `병력 손실 -${Math.round(v * 100)}%`,
};

export const HEROES: HeroDef[] = [
  { id: 'mason', name: '메이슨', icon: '🧔', rarity: 'R', role: '공격', basePower: 100, perk: { type: 'dmg', value: 0.05 } },
  { id: 'lucy', name: '루시', icon: '👩', rarity: 'R', role: '지원', basePower: 90, perk: { type: 'soldiers', value: 2 } },
  { id: 'bruno', name: '브루노', icon: '👮', rarity: 'R', role: '방어', basePower: 95, perk: { type: 'armor', value: 0.08 } },
  { id: 'kane', name: '케인', icon: '💂', rarity: 'SR', role: '방어', basePower: 160, perk: { type: 'armor', value: 0.15 } },
  { id: 'sophia', name: '소피아', icon: '🕵️', rarity: 'SR', role: '지원', basePower: 150, perk: { type: 'rate', value: 0.15 } },
  { id: 'jack', name: '잭', icon: '🤠', rarity: 'SR', role: '공격', basePower: 170, perk: { type: 'dmg', value: 0.12 } },
  { id: 'ghost', name: '고스트', icon: '🥷', rarity: 'SSR', role: '공격', basePower: 260, perk: { type: 'dmg', value: 0.25 } },
  { id: 'titan', name: '타이탄', icon: '🦾', rarity: 'SSR', role: '방어', basePower: 240, perk: { type: 'soldiers', value: 6 } },
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h])) as Record<string, HeroDef>;

export const RARITY_WEIGHT: Record<Rarity, number> = { R: 70, SR: 25, SSR: 5 };

export const RECRUIT_COST = 100;
export const SQUAD_SIZE = 3;
export const MAX_STARS = 5;
