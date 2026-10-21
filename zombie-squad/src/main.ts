import './style.css';
import { Battle, type BattleResult } from './battle';
import {
  BUILDINGS,
  BUILDING_BY_ID,
  HERO_BY_ID,
  HEROES,
  PERK_LABEL,
  RECRUIT_COST,
  RES_META,
  SQUAD_SIZE,
  type AnyRes,
  type BuildingId,
  type Cost,
  type ResKey,
} from './data';
import {
  applyReward,
  battleConfig,
  canAfford,
  collect,
  collectAll,
  fmt,
  fmtTime,
  heroLevelCost,
  heroMaxLevel,
  heroPower,
  levelUpHero,
  maxLevel,
  pending,
  perkValue,
  productionRate,
  recruit,
  speedUp,
  speedUpCost,
  stageReward,
  startUpgrade,
  tickUpgrades,
  toggleSquad,
  upgradeCost,
  upgradeSeconds,
  type StageReward,
} from './logic';
import { loadState, resetState, saveState, type GameState } from './state';

type Tab = 'base' | 'heroes' | 'battle';

let state: GameState = loadState();
let tab: Tab = 'battle';
let battle: Battle | null = null;

const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="topbar">
    ${(['food', 'wood', 'steel', 'gems'] as AnyRes[])
      .map((k) => `<div class="res" title="${RES_META[k].name}"><span>${RES_META[k].icon}</span><b data-res="${k}">0</b></div>`)
      .join('')}
  </header>
  <main id="view"></main>
  <nav class="tabbar">
    <button data-tab="base"><span class="ic">🏠</span><span>기지</span></button>
    <button data-tab="battle"><span class="ic">⚔️</span><span>출격</span></button>
    <button data-tab="heroes"><span class="ic">🦸</span><span>영웅</span></button>
  </nav>
  <div id="battle-layer" hidden></div>
  <div id="modal" hidden></div>
  <div id="toast"></div>
`;

const view = document.getElementById('view')!;
const battleLayer = document.getElementById('battle-layer')!;
const modal = document.getElementById('modal')!;
const toastEl = document.getElementById('toast')!;

// ---------- Helpers ----------

let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function costHtml(cost: Cost): string {
  return (Object.keys(cost) as ResKey[])
    .map((k) => `<span class="${state.res[k] >= cost[k]! ? '' : 'short'}">${RES_META[k].icon}${fmt(cost[k]!)}</span>`)
    .join(' ');
}

function rewardHtml(r: StageReward): string {
  return (['food', 'wood', 'steel', 'gems'] as AnyRes[])
    .filter((k) => r[k] > 0)
    .map((k) => `<span class="pill">${RES_META[k].icon} ${fmt(r[k])}</span>`)
    .join('');
}

function commit(): void {
  saveState(state);
  render();
}

function updateTopbar(): void {
  for (const el of app.querySelectorAll<HTMLElement>('[data-res]')) {
    el.textContent = fmt(state.res[el.dataset.res as AnyRes]);
  }
}

// ---------- Base ----------

function renderBase(): string {
  const now = Date.now();
  const cards = BUILDINGS.map((def) => {
    const lv = state.buildings[def.id].level;
    const busy = state.upgrading?.id === def.id;
    const atMax = lv >= maxLevel(state, def.id);
    const cost = upgradeCost(def.id, lv);
    let action: string;
    if (busy) action = `<div class="busy" data-busy="${def.id}">건설 중…</div>`;
    else if (atMax) action = `<div class="muted small">본부 Lv${lv + 1} 필요</div>`;
    else
      action = `<button class="btn up ${canAfford(state, cost) && !state.upgrading ? '' : 'disabled'}" data-action="upgrade" data-id="${def.id}">
        <span>업그레이드 · ${fmtTime(upgradeSeconds(def.id, lv))}</span><span class="cost">${costHtml(cost)}</span></button>`;
    const prod = def.produces
      ? `<button class="collect" data-action="collect" data-id="${def.id}">
          ${RES_META[def.produces].icon} <b data-pending="${def.id}">${fmt(pending(state, def.id, now))}</b>
          <span class="muted small">${fmt(productionRate(def.id, lv) * 3600)}/시간</span></button>`
      : `<div class="muted small desc">${def.desc}</div>`;
    return `<div class="card building ${busy ? 'is-busy' : ''}">
      <div class="b-head"><span class="b-icon">${def.icon}</span>
        <div><div class="b-name">${def.name}</div><div class="lv">Lv ${lv}</div></div></div>
      ${prod}
      ${action}
    </div>`;
  }).join('');

  return `<section class="page">
    <div class="card builder" data-builder></div>
    <button class="btn wide primary" data-action="collect-all">📦 모두 수령</button>
    <div class="grid">${cards}</div>
  </section>`;
}

function updateBase(): void {
  const now = Date.now();
  for (const el of view.querySelectorAll<HTMLElement>('[data-pending]')) {
    el.textContent = fmt(pending(state, el.dataset.pending as BuildingId, now));
  }
  const builder = view.querySelector<HTMLElement>('[data-builder]');
  if (!builder) return;
  const u = state.upgrading;
  if (!u) {
    builder.innerHTML = `<span>🔨 건설대 대기 중</span><span class="muted small">건물을 업그레이드하세요</span>`;
    return;
  }
  const def = BUILDING_BY_ID[u.id];
  const total = upgradeSeconds(u.id, state.buildings[u.id].level) * 1000;
  const left = Math.max(0, u.endsAt - now);
  const pct = Math.min(100, 100 - (left / total) * 100);
  builder.innerHTML = `<div class="builder-row"><span>🔨 ${def.icon} ${def.name} Lv${state.buildings[u.id].level + 1}</span>
      <span>${fmtTime(left / 1000)}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <button class="btn small gem" data-action="speedup">💎 ${speedUpCost(state, now)} 즉시 완료</button>`;
}

// ---------- Heroes ----------

function renderHeroes(): string {
  const slots = Array.from({ length: SQUAD_SIZE }, (_, i) => {
    const id = state.squad[i];
    const def = id ? HERO_BY_ID[id] : null;
    return `<div class="slot ${def ? 'r-' + def.rarity : ''}">${def ? `<span>${def.icon}</span><small>${def.name}</small>` : '<small class="muted">빈 슬롯</small>'}</div>`;
  }).join('');

  const maxLv = heroMaxLevel(state);
  const list = HEROES.map((def) => {
    const h = state.heroes[def.id];
    if (!h) {
      return `<div class="card hero locked r-${def.rarity}"><span class="h-icon">${def.icon}</span>
        <div class="h-info"><div><span class="rar">${def.rarity}</span> ${def.name}</div><div class="muted small">미보유 · 모집으로 획득</div></div></div>`;
    }
    const inSquad = state.squad.includes(def.id);
    const cost = heroLevelCost(h.level);
    const canLv = h.level < maxLv && canAfford(state, cost);
    return `<div class="card hero r-${def.rarity} ${inSquad ? 'in-squad' : ''}">
      <span class="h-icon">${def.icon}</span>
      <div class="h-info">
        <div><span class="rar">${def.rarity}</span> <b>${def.name}</b> <span class="stars">${'★'.repeat(h.stars)}</span></div>
        <div class="small">Lv ${h.level}/${maxLv} · ${def.role} · 전투력 <b>${fmt(heroPower(def, h))}</b></div>
        <div class="small perk">${PERK_LABEL[def.perk.type](perkValue(def, h))}</div>
      </div>
      <div class="h-actions">
        <button class="btn small ${canLv ? '' : 'disabled'}" data-action="hero-lv" data-id="${def.id}">
          ${h.level >= maxLv ? '최대' : `레벨업<br><span class="cost">${costHtml(cost)}</span>`}</button>
        <button class="btn small ${inSquad ? 'ghost' : 'primary'}" data-action="squad" data-id="${def.id}">${inSquad ? '해제' : '배치'}</button>
      </div>
    </div>`;
  }).join('');

  return `<section class="page">
    <div class="card recruit">
      <div><b>영웅 모집</b><div class="muted small">SSR 5% · SR 25% · R 70% · 중복 시 ★ 상승</div></div>
      <div class="row">
        <button class="btn gem" data-action="recruit" data-n="1">1회 💎${RECRUIT_COST}</button>
        <button class="btn gem" data-action="recruit" data-n="10">10회 💎${RECRUIT_COST * 9}</button>
      </div>
    </div>
    <h3>출전 분대</h3>
    <div class="squad">${slots}</div>
    <h3>영웅 목록</h3>
    <div class="list">${list}</div>
  </section>`;
}

// ---------- Battle tab ----------

function renderBattleTab(): string {
  const cfg = battleConfig(state);
  const reward = stageReward(state.stage, true);
  const icons = state.squad.map((id) => HERO_BY_ID[id]?.icon ?? '').join(' ');
  return `<section class="page">
    <div class="card stage">
      <div class="stage-no">STAGE ${state.stage}</div>
      <div class="stage-art">🧟‍♂️🧟🧟‍♀️</div>
      <div class="muted small">좀비 떼를 뚫고 보스를 처치하세요</div>
      <div class="stats">
        <div><span class="muted small">분대</span><b>${icons}</b></div>
        <div><span class="muted small">전투력</span><b>${fmt(cfg.power)}</b></div>
        <div><span class="muted small">시작 병력</span><b>${cfg.soldiers}</b></div>
        <div><span class="muted small">공격력</span><b>${fmt(cfg.damage)}</b></div>
      </div>
      <div class="muted small">승리 보상</div>
      <div class="rewards">${rewardHtml(reward)}</div>
      <button class="btn huge primary" data-action="start">⚔️ 출격!</button>
    </div>
    <div class="card tips small">
      <b>팁</b>
      <ul>
        <li>파란 게이트는 병력 증가, 빨간 게이트는 감소</li>
        <li>게이트를 쏘면 숫자가 올라갑니다</li>
        <li>병력이 많을수록 화력이 강해집니다</li>
        <li>기지의 훈련소·연구소, 영웅 레벨업으로 강해지세요</li>
      </ul>
    </div>
    <button class="link" data-action="reset">데이터 초기화</button>
  </section>`;
}

// ---------- Rendering ----------

function render(): void {
  updateTopbar();
  for (const b of app.querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
  view.innerHTML = tab === 'base' ? renderBase() : tab === 'heroes' ? renderHeroes() : renderBattleTab();
  if (tab === 'base') updateBase();
}

function showModal(html: string): void {
  modal.innerHTML = `<div class="modal-box">${html}</div>`;
  modal.hidden = false;
}

function hideModal(): void {
  modal.hidden = true;
  modal.innerHTML = '';
}

// ---------- Battle flow ----------

function startBattle(): void {
  const cfg = battleConfig(state);
  battleLayer.innerHTML = `<canvas></canvas><button class="pause" data-action="pause">⏸</button>`;
  battleLayer.hidden = false;
  document.body.classList.add('in-battle');
  battle = new Battle(battleLayer.querySelector('canvas')!, cfg, onBattleEnd);
}

function endBattle(): void {
  battle?.destroy();
  battle = null;
  battleLayer.hidden = true;
  battleLayer.innerHTML = '';
  document.body.classList.remove('in-battle');
  hideModal();
  render();
}

function onBattleEnd(r: BattleResult): void {
  const reward = stageReward(r.stage, r.win);
  applyReward(state, reward);
  if (r.win) state.stage = r.stage + 1;
  saveState(state);
  showModal(`
    <h2 class="${r.win ? 'win' : 'lose'}">${r.win ? '🏆 승리!' : '💀 패배'}</h2>
    <div class="muted">STAGE ${r.stage} · 처치 ${r.kills} · 생존 병력 ${r.soldiersLeft}</div>
    <div class="rewards">${rewardHtml(reward)}</div>
    ${r.win ? '' : '<div class="muted small">기지와 영웅을 강화하고 다시 도전하세요</div>'}
    <div class="row">
      <button class="btn ghost" data-action="to-base">기지로</button>
      <button class="btn primary" data-action="again">${r.win ? '다음 스테이지' : '재도전'}</button>
    </div>`);
}

function pauseBattle(): void {
  if (!battle || battle.isOver) return;
  battle.setPaused(true);
  showModal(`<h2>일시정지</h2>
    <div class="row"><button class="btn ghost" data-action="quit">포기</button>
    <button class="btn primary" data-action="resume">계속</button></div>`);
}

// ---------- Events ----------

function handleAction(el: HTMLElement): void {
  const now = Date.now();
  const id = el.dataset.id;
  let err: string | null = null;
  switch (el.dataset.action) {
    case 'collect': {
      const n = collect(state, id as BuildingId, now);
      if (n > 0) toast(`${RES_META[BUILDING_BY_ID[id as BuildingId].produces!].icon} +${fmt(n)}`);
      break;
    }
    case 'collect-all': {
      const got = collectAll(state, now);
      const msg = (Object.keys(got) as ResKey[]).filter((k) => got[k]! > 0).map((k) => `${RES_META[k].icon}+${fmt(got[k]!)}`).join(' ');
      toast(msg || '수령할 자원이 없습니다');
      break;
    }
    case 'upgrade':
      err = startUpgrade(state, id as BuildingId, now);
      break;
    case 'speedup':
      err = speedUp(state, now);
      if (!err) toast('건설 완료!');
      break;
    case 'recruit': {
      const res = recruit(state, Number(el.dataset.n));
      if (typeof res === 'string') err = res;
      else {
        saveState(state);
        showModal(`<h2>모집 결과</h2>
          <div class="pulls">${res
            .map((p, i) => `<div class="pull r-${p.def.rarity}" style="--i:${i}"><span>${p.def.icon}</span><small>${p.def.name}</small>
              <em>${p.isNew ? 'NEW' : p.starUp ? '★UP' : '🔩+200'}</em></div>`)
            .join('')}</div>
          <button class="btn primary wide" data-action="close">확인</button>`);
      }
      break;
    }
    case 'hero-lv':
      err = levelUpHero(state, id!);
      break;
    case 'squad':
      err = toggleSquad(state, id!);
      break;
    case 'start':
      startBattle();
      return;
    case 'pause':
      pauseBattle();
      return;
    case 'resume':
      hideModal();
      battle?.setPaused(false);
      return;
    case 'quit':
      endBattle();
      return;
    case 'again':
      endBattle();
      startBattle();
      return;
    case 'to-base':
      tab = 'base';
      endBattle();
      return;
    case 'close':
      hideModal();
      break;
    case 'reset':
      if (confirm('모든 진행 상황을 삭제할까요?')) state = resetState();
      break;
  }
  if (err) toast(err);
  commit();
}

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const tabBtn = target.closest<HTMLElement>('[data-tab]');
  if (tabBtn) {
    tab = tabBtn.dataset.tab as Tab;
    render();
    view.scrollTop = 0;
    return;
  }
  const act = target.closest<HTMLElement>('[data-action]');
  if (act && !act.classList.contains('disabled')) handleAction(act);
  else if (act) {
    // Explain why a disabled button does nothing.
    if (act.dataset.action === 'upgrade') toast(state.upgrading ? '이미 다른 건물을 건설 중입니다' : '자원이 부족합니다');
    else if (act.dataset.action === 'hero-lv') toast('자원이 부족하거나 최대 레벨입니다');
  }
});

// Block pinch/double-tap zoom on iOS Safari.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveState(state);
    pauseBattle();
  }
});

// ---------- Tick ----------

let saveTick = 0;
setInterval(() => {
  const done = tickUpgrades(state, Date.now());
  if (done) {
    const def = BUILDING_BY_ID[done];
    toast(`${def.icon} ${def.name} Lv${state.buildings[done].level} 완료!`);
    saveState(state);
    if (!battle) render();
  } else if (!battle) {
    updateTopbar();
    if (tab === 'base') updateBase();
  }
  if (++saveTick % 10 === 0) saveState(state);
}, 500);

render();
