import { BUILDINGS, type AnyRes, type BuildingId } from './data';

export interface HeroState {
  level: number;
  stars: number;
}

export interface GameState {
  v: 1;
  res: Record<AnyRes, number>;
  buildings: Record<BuildingId, { level: number; lastCollect: number }>;
  upgrading: { id: BuildingId; endsAt: number } | null;
  heroes: Record<string, HeroState>;
  squad: string[];
  /** Next stage to play. */
  stage: number;
}

const KEY = 'zsquad-save-v1';

export function newState(now = Date.now()): GameState {
  const buildings = {} as GameState['buildings'];
  for (const b of BUILDINGS) buildings[b.id] = { level: b.id === 'hq' ? 2 : 1, lastCollect: now };
  return {
    v: 1,
    res: { food: 300, wood: 300, steel: 100, gems: 300 },
    buildings,
    upgrading: null,
    heroes: { mason: { level: 1, stars: 1 } },
    squad: ['mason'],
    stage: 1,
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as GameState;
      if (s && s.v === 1) {
        // Fill in buildings added after the save was written.
        const fresh = newState();
        for (const b of BUILDINGS) s.buildings[b.id] ??= fresh.buildings[b.id];
        return s;
      }
    }
  } catch {
    // Corrupt or unavailable storage: start over.
  }
  return newState();
}

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage may be blocked (private mode); the game still runs.
  }
}

export function resetState(): GameState {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return newState();
}
