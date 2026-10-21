import type { BattleConfig } from './logic';

export interface BattleResult {
  win: boolean;
  stage: number;
  kills: number;
  soldiersLeft: number;
}

type ZKind = 'walker' | 'runner' | 'brute' | 'boss';
type GateOp = { op: '+' | '-' | 'x'; v: number; hits: number; gained: number };

interface Zombie {
  kind: ZKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  homing: number;
  bite: number;
  flash: number;
  wob: number;
}

interface Gate {
  y: number;
  left: GateOp;
  right: GateOp;
  used: boolean;
}

interface Bullet {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

type StageEvent =
  | { d: number; kind: 'zombie'; x: number; z: ZKind }
  | { d: number; kind: 'gate'; left: GateOp; right: GateOp }
  | { d: number; kind: 'boss' };

const W = 360;
const ROAD_L = 40;
const ROAD_R = 320;
const MID = (ROAD_L + ROAD_R) / 2;
const SCROLL = 80;
const BULLET_SPEED = 720;
const MAX_DRAW = 160;
const MAX_COUNT = 999;
const GATE_H = 34;
const GATE_MAX_GAIN = 15;

// Sunflower layout so any soldier count packs into a tidy blob.
const FORM = Array.from({ length: MAX_DRAW }, (_, i) => {
  const r = 4.2 * Math.sqrt(i + 0.3);
  const a = i * 2.39996;
  return { x: r * Math.cos(a), y: r * Math.sin(a) * 0.75 };
});

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function op(o: GateOp['op'], v: number): GateOp {
  return { op: o, v, hits: 0, gained: 0 };
}

function makeGates(stage: number, rng: () => number): { left: GateOp; right: GateOp } {
  const good = rng() < 0.25 ? op('x', 2) : op('+', 5 + Math.floor(rng() * 6) + stage * 2);
  const other = rng() < 0.55 ? op('-', 3 + Math.floor(rng() * 5) + stage) : op('+', 2 + Math.floor(rng() * 4) + stage);
  return rng() < 0.5 ? { left: good, right: other } : { left: other, right: good };
}

function generateStage(stage: number): { events: StageEvent[]; length: number } {
  const rng = mulberry32(stage * 9973 + 17);
  const length = 2200 + stage * 200;
  const events: StageEvent[] = [];
  let d = 350;
  let seg = 0;
  while (d < length - 300) {
    if (seg % 2 === 1) {
      events.push({ d, kind: 'gate', ...makeGates(stage, rng) });
      d += 260;
    } else {
      const rows = Math.min(6, 2 + Math.floor(rng() * 2) + Math.floor(stage / 4));
      const runnerChance = Math.min(0.5, 0.05 * stage);
      for (let r = 0; r < rows; r++) {
        const cols = 2 + Math.floor(rng() * 3) + Math.min(3, Math.floor(stage / 3));
        for (let c = 0; c < cols; c++) {
          const x = ROAD_L + 18 + rng() * (ROAD_R - ROAD_L - 36);
          events.push({ d: d + r * 40 + rng() * 16, kind: 'zombie', x, z: rng() < runnerChance ? 'runner' : 'walker' });
        }
      }
      if (stage >= 2 && rng() < 0.5) {
        events.push({ d: d + rows * 40 + 30, kind: 'zombie', x: ROAD_L + 40 + rng() * (ROAD_R - ROAD_L - 80), z: 'brute' });
      }
      d += rows * 40 + 220;
    }
    seg++;
  }
  events.push({ d: length, kind: 'boss' });
  events.sort((a, b) => a.d - b.d);
  return { events, length };
}

function makeZombie(kind: ZKind, x: number, y: number, stage: number): Zombie {
  const g = Math.pow(1.15, stage - 1);
  const base = {
    walker: { r: 9, hp: 30, speed: 22, homing: 25, bite: 1 },
    runner: { r: 8, hp: 20, speed: 55, homing: 40, bite: 1 },
    brute: { r: 18, hp: 300, speed: 14, homing: 15, bite: 6 },
    boss: { r: 34, hp: 2500, speed: 14, homing: 10, bite: 3 },
  }[kind];
  const hp = base.hp * g;
  return { kind, x, y, r: base.r, hp, maxHp: hp, speed: base.speed, homing: base.homing, bite: base.bite, flash: 0, wob: Math.random() * 6 };
}

export class Battle {
  private ctx: CanvasRenderingContext2D;
  private H = 640;
  private scale = 1;
  private squadY = 520;
  private squadX = MID;
  private targetX = MID;
  private keyDir = 0;
  private count: number;
  private traveled = 0;
  private events: StageEvent[];
  private evIdx = 0;
  private length: number;
  private zombies: Zombie[] = [];
  private boss: Zombie | null = null;
  private gates: Gate[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private fireT = 0;
  private drainT = 0;
  private kills = 0;
  private time = 0;
  private phase: 'play' | 'won' | 'lost' = 'play';
  private paused = false;
  private endT = 0;
  private ended = false;
  private raf = 0;
  private last = 0;
  private dragging = false;
  private lastPx = 0;
  private ro: ResizeObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private cfg: BattleConfig,
    private onEnd: (r: BattleResult) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.count = cfg.soldiers;
    const gen = generateStage(cfg.stage);
    this.events = gen.events;
    this.length = gen.length;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.dragging = false;
  }

  get isOver(): boolean {
    return this.phase !== 'play';
  }

  // ---------- Input ----------

  private onDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastPx = e.clientX;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging || this.paused) return;
    this.targetX += ((e.clientX - this.lastPx) / this.scale) * 1.3;
    this.lastPx = e.clientX;
  };

  private onUp = (): void => {
    this.dragging = false;
  };

  private onKey = (e: KeyboardEvent): void => {
    const down = e.type === 'keydown';
    if (e.key === 'ArrowLeft' || e.key === 'a') this.keyDir = down ? -1 : this.keyDir === -1 ? 0 : this.keyDir;
    if (e.key === 'ArrowRight' || e.key === 'd') this.keyDir = down ? 1 : this.keyDir === 1 ? 0 : this.keyDir;
  };

  // ---------- Loop ----------

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.scale = rect.width / W;
    this.H = rect.height / this.scale;
    this.squadY = this.H - 130;
    this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
  }

  private frame = (t: number): void => {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (!this.paused) this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private get radius(): number {
    return 4.2 * Math.sqrt(Math.min(this.count, MAX_DRAW)) + 5;
  }

  private update(dt: number): void {
    this.time += dt;
    this.updateParticles(dt);

    if (this.phase !== 'play') {
      this.endT -= dt;
      if (this.endT <= 0 && !this.ended) {
        this.ended = true;
        this.onEnd({ win: this.phase === 'won', stage: this.cfg.stage, kills: this.kills, soldiersLeft: this.count });
      }
      return;
    }

    // Squad steering
    this.targetX += this.keyDir * 260 * dt;
    const R = this.radius;
    this.targetX = Math.max(ROAD_L + R, Math.min(ROAD_R - R, this.targetX));
    this.squadX += (this.targetX - this.squadX) * Math.min(1, dt * 14);

    // World scroll stops once the boss has walked on screen.
    const speed = this.boss && this.boss.y >= 150 ? 0 : SCROLL;
    this.traveled += speed * dt;

    while (this.evIdx < this.events.length && this.events[this.evIdx].d - this.traveled <= this.squadY + 40) {
      this.spawn(this.events[this.evIdx], this.squadY - (this.events[this.evIdx].d - this.traveled));
      this.evIdx++;
    }

    this.updateGates(speed, dt);
    this.updateZombies(speed, dt);
    this.updateShooting(dt);
    this.updateTexts(dt);
  }

  private spawn(ev: StageEvent, y: number): void {
    if (ev.kind === 'zombie') this.zombies.push(makeZombie(ev.z, ev.x, y, this.cfg.stage));
    else if (ev.kind === 'gate') this.gates.push({ y, left: ev.left, right: ev.right, used: false });
    else {
      this.boss = makeZombie('boss', MID, y - 20, this.cfg.stage);
      this.zombies.push(this.boss);
    }
  }

  private updateGates(speed: number, dt: number): void {
    for (const g of this.gates) {
      g.y += speed * dt;
      if (!g.used && g.y >= this.squadY) {
        g.used = true;
        const side = this.squadX < MID ? g.left : g.right;
        const before = this.count;
        if (side.op === '+') this.count += side.v;
        else if (side.op === '-') this.count -= side.v;
        else this.count *= side.v;
        this.count = Math.min(MAX_COUNT, Math.max(0, Math.round(this.count)));
        const diff = this.count - before;
        this.addText(this.squadX, this.squadY - 40, diff >= 0 ? `+${diff}` : `${diff}`, diff >= 0 ? '#7fd0ff' : '#ff6b6b');
        if (this.count <= 0) this.lose();
      }
    }
    this.gates = this.gates.filter((g) => g.y < this.H + 40);
  }

  private updateZombies(speed: number, dt: number): void {
    const R = this.radius;
    for (const z of this.zombies) {
      z.flash = Math.max(0, z.flash - dt);
      z.wob += dt * 8;
      z.y += (speed + z.speed) * dt;
      if (z.y > this.squadY - 280) {
        const dx = this.squadX - z.x;
        z.x += Math.sign(dx) * Math.min(Math.abs(dx) * 1.2, z.homing) * dt;
      }
      z.x = Math.max(ROAD_L + z.r, Math.min(ROAD_R - z.r, z.x));

      const dx = z.x - this.squadX;
      const dy = (z.y - this.squadY) * 1.3;
      const touching = Math.hypot(dx, dy) < R + z.r;
      if (!touching) continue;

      if (z === this.boss) {
        // The boss stays and keeps chewing through the squad.
        z.y = Math.min(z.y, this.squadY - (R + z.r) / 1.3 + 2);
        this.drainT -= dt;
        if (this.drainT <= 0) {
          this.drainT = 0.25;
          this.loseSoldiers(z.bite);
        }
      } else {
        z.hp = 0;
        this.burst(z.x, z.y, '#8fd36f', 8);
        this.loseSoldiers(z.bite);
      }
      if (this.phase !== 'play') return;
    }
    this.zombies = this.zombies.filter((z) => z.hp > 0 && z.y < this.H + 40);
  }

  private updateShooting(dt: number): void {
    this.fireT -= dt;
    const drawN = Math.min(this.count, MAX_DRAW);
    while (this.fireT <= 0 && drawN > 0) {
      this.fireT += this.cfg.fireInterval;
      const n = Math.max(1, Math.min(10, Math.ceil(Math.sqrt(this.count))));
      for (let i = 0; i < n; i++) {
        const f = FORM[Math.floor(Math.random() * drawN)];
        this.bullets.push({ x: this.squadX + f.x, y: this.squadY + f.y - 4 });
      }
    }

    for (const b of this.bullets) {
      b.y -= BULLET_SPEED * dt;
      if (this.hitGate(b) || this.hitZombie(b)) b.y = -100;
    }
    this.bullets = this.bullets.filter((b) => b.y > -20);
  }

  private hitGate(b: Bullet): boolean {
    for (const g of this.gates) {
      if (g.used || Math.abs(b.y - g.y) > GATE_H / 2) continue;
      const side = b.x < MID ? g.left : g.right;
      if (side.op !== 'x' && side.gained < GATE_MAX_GAIN) {
        side.hits++;
        if (side.hits >= 5 + Math.abs(side.v)) {
          side.hits = 0;
          side.gained++;
          if (side.op === '+') side.v++;
          else if (--side.v === 0) {
            side.op = '+';
            side.v = 0;
          }
        }
      }
      return true;
    }
    return false;
  }

  private hitZombie(b: Bullet): boolean {
    for (const z of this.zombies) {
      if (z.hp <= 0 || Math.abs(b.x - z.x) > z.r || Math.abs(b.y - z.y) > z.r) continue;
      z.hp -= this.cfg.damage;
      z.flash = 0.06;
      if (z.hp <= 0) this.kill(z);
      return true;
    }
    return false;
  }

  private kill(z: Zombie): void {
    this.kills++;
    this.burst(z.x, z.y, z.kind === 'boss' ? '#c77dff' : '#8fd36f', z.kind === 'boss' ? 40 : 10);
    if (z === this.boss) {
      this.boss = null;
      this.phase = 'won';
      this.endT = 1.6;
      this.addText(this.squadX, this.squadY - 60, '보스 처치!', '#ffd84a');
    }
  }

  private loseSoldiers(bite: number): void {
    const expected = bite * (1 - this.cfg.armor);
    const loss = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    if (loss <= 0) return;
    this.count = Math.max(0, this.count - loss);
    this.burst(this.squadX, this.squadY - this.radius, '#4da3ff', 4 * loss);
    if (this.count <= 0) this.lose();
  }

  private lose(): void {
    if (this.phase !== 'play') return;
    this.phase = 'lost';
    this.endT = 1.4;
  }

  private burst(x: number, y: number, color: string, n: number): void {
    n = Math.min(n, 40);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      const life = 0.3 + Math.random() * 0.4;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color, size: 1.5 + Math.random() * 2.5 });
    }
  }

  private addText(x: number, y: number, text: string, color: string): void {
    this.texts.push({ x, y, text, color, life: 1 });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateTexts(dt: number): void {
    for (const t of this.texts) {
      t.y -= 30 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  // ---------- Render ----------

  private draw(): void {
    const c = this.ctx;
    const H = this.H;
    c.fillStyle = '#262b22';
    c.fillRect(0, 0, W, H);

    this.drawProps();

    c.fillStyle = '#3d4046';
    c.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
    c.fillStyle = '#6b6f75';
    c.fillRect(ROAD_L - 3, 0, 3, H);
    c.fillRect(ROAD_R, 0, 3, H);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    const off = this.traveled % 48;
    for (let y = -48 + off; y < H; y += 48) c.fillRect(MID - 2, y, 4, 24);

    for (const g of this.gates) this.drawGate(g);
    for (const z of this.zombies) this.drawZombie(z);

    c.fillStyle = '#ffd84a';
    for (const b of this.bullets) c.fillRect(b.x - 1, b.y - 6, 2, 8);

    this.drawSquad();

    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of this.texts) {
      c.globalAlpha = Math.min(1, t.life * 2);
      this.outlinedText(t.text, t.x, t.y, 22, t.color);
    }
    c.globalAlpha = 1;

    this.drawHud();
  }

  private drawProps(): void {
    const c = this.ctx;
    const step = 70;
    const i0 = Math.floor((this.traveled - (this.H - this.squadY) - 40) / step);
    const i1 = Math.ceil((this.traveled + this.squadY + 40) / step);
    for (let i = i0; i <= i1; i++) {
      const y = this.squadY - (i * step - this.traveled);
      const h = hash(i);
      const left = h < 0.5;
      const x = left ? 6 + hash(i + 0.5) * 24 : ROAD_R + 10 + hash(i + 0.5) * 24;
      const type = Math.floor(hash(i + 0.25) * 3);
      if (type === 0) {
        c.fillStyle = '#1e3a1c';
        c.beginPath();
        c.arc(x, y, 11, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#2f5a2b';
        c.beginPath();
        c.arc(x - 2, y - 2, 7, 0, Math.PI * 2);
        c.fill();
      } else if (type === 1) {
        c.fillStyle = '#6b4a2b';
        c.fillRect(x - 7, y - 7, 14, 14);
        c.strokeStyle = '#3f2a16';
        c.strokeRect(x - 7, y - 7, 14, 14);
      } else {
        c.fillStyle = '#5a2f2f';
        c.fillRect(x - 6, y - 12, 12, 24);
        c.fillStyle = '#2b2f36';
        c.fillRect(x - 4, y - 7, 8, 6);
      }
    }
  }

  private drawGate(g: Gate): void {
    const c = this.ctx;
    const sides: [GateOp, number, number][] = [
      [g.left, ROAD_L, MID],
      [g.right, MID, ROAD_R],
    ];
    for (const [s, x0, x1] of sides) {
      const good = s.op !== '-';
      c.globalAlpha = g.used ? 0.25 : 1;
      c.fillStyle = good ? 'rgba(60,140,255,0.55)' : 'rgba(255,70,70,0.55)';
      c.fillRect(x0 + 3, g.y - GATE_H / 2, x1 - x0 - 6, GATE_H);
      c.fillStyle = good ? '#9cc9ff' : '#ff9c9c';
      c.fillRect(x0 + 3, g.y - GATE_H / 2, 4, GATE_H);
      c.fillRect(x1 - 7, g.y - GATE_H / 2, 4, GATE_H);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const label = s.op === 'x' ? `×${s.v}` : s.op === '+' ? `+${s.v}` : `-${s.v}`;
      this.outlinedText(label, (x0 + x1) / 2, g.y + 1, 20, '#fff');
    }
    c.globalAlpha = 1;
  }

  private drawZombie(z: Zombie): void {
    const c = this.ctx;
    const wob = Math.sin(z.wob) * (z.kind === 'boss' ? 1.5 : 1);
    const x = z.x + wob;
    const body = { walker: '#6bbf59', runner: '#c9d35a', brute: '#3f7f3a', boss: '#7a3b8f' }[z.kind];
    c.fillStyle = z.flash > 0 ? '#ffffff' : body;
    c.beginPath();
    c.arc(x, z.y, z.r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 1.5;
    c.stroke();
    // Arms reaching toward the squad
    c.fillStyle = body;
    c.fillRect(x - z.r * 0.8, z.y + z.r * 0.4, z.r * 0.35, z.r * 0.8);
    c.fillRect(x + z.r * 0.45, z.y + z.r * 0.4, z.r * 0.35, z.r * 0.8);
    c.fillStyle = '#d33';
    const er = Math.max(1.6, z.r * 0.16);
    c.beginPath();
    c.arc(x - z.r * 0.35, z.y + z.r * 0.1, er, 0, Math.PI * 2);
    c.arc(x + z.r * 0.35, z.y + z.r * 0.1, er, 0, Math.PI * 2);
    c.fill();
    if (z.kind === 'boss') {
      c.font = '30px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🧟', x, z.y - 4);
    } else if (z.kind === 'brute' && z.hp < z.maxHp) {
      const w = z.r * 2;
      c.fillStyle = '#000';
      c.fillRect(x - w / 2, z.y - z.r - 8, w, 4);
      c.fillStyle = '#f55';
      c.fillRect(x - w / 2, z.y - z.r - 8, (w * Math.max(0, z.hp)) / z.maxHp, 4);
    }
  }

  private drawSquad(): void {
    const c = this.ctx;
    const n = Math.min(this.count, MAX_DRAW);
    for (let i = n - 1; i >= 0; i--) {
      const f = FORM[i];
      const bob = this.phase === 'play' ? Math.sin(this.time * 12 + i) * 0.6 : 0;
      c.fillStyle = '#4da3ff';
      c.beginPath();
      c.arc(this.squadX + f.x, this.squadY + f.y + bob, 3.4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#1b4f8a';
      c.fillRect(this.squadX + f.x - 0.8, this.squadY + f.y + bob - 6, 1.6, 4);
    }
    if (this.count <= 0) return;

    const R = this.radius;
    c.font = '20px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const icons = this.cfg.heroIcons;
    icons.forEach((icon, i) => {
      const x = this.squadX + (i - (icons.length - 1) / 2) * 24;
      c.fillText(icon, x, this.squadY - R * 0.75 - 14);
    });

    const label = String(this.count);
    const y = this.squadY + R * 0.75 + 16;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    const w = 14 + label.length * 9;
    c.beginPath();
    c.roundRect(this.squadX - w / 2, y - 10, w, 20, 10);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 14px sans-serif';
    c.fillText(label, this.squadX, y + 1);
  }

  private drawHud(): void {
    const c = this.ctx;
    const top = 14;
    const barW = 230;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath();
    c.roundRect(14, top, barW, 10, 5);
    c.fill();
    c.fillStyle = '#ffc83d';
    const p = Math.min(1, this.traveled / (this.length - this.squadY));
    c.beginPath();
    c.roundRect(14, top, Math.max(10, barW * p), 10, 5);
    c.fill();
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    this.outlinedText(`STAGE ${this.cfg.stage}`, 14, top + 24, 14, '#fff', 'left');
    this.outlinedText(`🧟 ${this.kills}`, 120, top + 24, 14, '#fff', 'left');

    if (this.boss) {
      const bw = 300;
      const bx = (W - bw) / 2;
      const by = top + 44;
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(bx, by, bw, 12);
      c.fillStyle = '#c0392b';
      c.fillRect(bx, by, (bw * Math.max(0, this.boss.hp)) / this.boss.maxHp, 12);
      this.outlinedText('BOSS', W / 2, by + 7, 11, '#fff');
    }

    if (this.time < 3 && this.phase === 'play') {
      c.globalAlpha = Math.min(1, 3 - this.time);
      this.outlinedText('← 드래그해서 이동 →', W / 2, this.H * 0.45, 20, '#fff');
      c.globalAlpha = 1;
    }

    if (this.phase !== 'play') {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, 0, W, this.H);
      const won = this.phase === 'won';
      this.outlinedText(won ? '승리!' : '패배...', W / 2, this.H * 0.4, 44, won ? '#ffd84a' : '#ff6b6b');
    }
  }

  private outlinedText(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
    const c = this.ctx;
    c.font = `900 ${size}px system-ui, sans-serif`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(3, size / 5);
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.strokeText(text, x, y);
    c.fillStyle = color;
    c.fillText(text, x, y);
  }
}
