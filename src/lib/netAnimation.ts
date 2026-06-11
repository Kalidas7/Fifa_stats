// Stylised 2D-canvas "shots on target" animation (§9). Draws a goal + rippling net and
// fires one ball per shot on target. Goals get a real label (scorer · minute) from the
// events timeline; other on-target shots fly to stylised/random spots (we have NO real
// shot coordinates at this tier, so trajectories are fabricated on purpose).

export interface Shot {
  isGoal: boolean;
  label?: string;
}

interface NetPoint {
  bx: number;
  by: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
}

interface Ball {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  cx: number;
  cy: number;
  t: number;
  dur: number;
  delay: number;
  isGoal: boolean;
  label?: string;
  done: boolean;
}

interface Label {
  text: string;
  x: number;
  y: number;
  age: number;
}

const COLS = 15;
const ROWS = 9;

export class NetAnimation {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private goal = { x: 0, y: 0, w: 0, h: 0 };
  private points: NetPoint[][] = [];
  private balls: Ball[] = [];
  private labels: Label[] = [];
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  accent: string;
  private running = false;
  private onDone?: () => void;

  constructor(private canvas: HTMLCanvasElement, accent = '#27c267') {
    this.ctx = canvas.getContext('2d')!;
    this.accent = accent;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Goal frame occupies the upper-centre; balls launch from the lower pitch.
    const gw = Math.min(this.w * 0.82, 520);
    const gh = gw * 0.42;
    this.goal = { x: (this.w - gw) / 2, y: this.h * 0.16, w: gw, h: gh };
    this.buildNet();
  }

  private buildNet() {
    const { x, y, w, h } = this.goal;
    this.points = [];
    for (let r = 0; r <= ROWS; r++) {
      const row: NetPoint[] = [];
      for (let c = 0; c <= COLS; c++) {
        const bx = x + (w * c) / COLS;
        const by = y + (h * r) / ROWS;
        row.push({ bx, by, dx: 0, dy: 0, vx: 0, vy: 0 });
      }
      this.points.push(row);
    }
  }

  /** Start (or restart) the sequence for the given shots. onDone fires when it settles. */
  play(shots: Shot[], onDone?: () => void) {
    this.resize();
    this.balls = [];
    this.labels = [];
    this.elapsed = 0;
    this.onDone = onDone;
    const stagger = shots.length > 8 ? 240 : 320;

    shots.forEach((s, i) => {
      const { x, y, w, h } = this.goal;
      // goals cluster toward the corners/top (the "good" spots); others spread.
      const gx = s.isGoal ? (i % 2 ? 0.78 : 0.22) + (Math.random() - 0.5) * 0.12 : Math.random();
      const gy = s.isGoal ? 0.18 + Math.random() * 0.4 : 0.12 + Math.random() * 0.7;
      this.balls.push({
        sx: this.w * (0.35 + Math.random() * 0.3),
        sy: this.h * 0.98,
        tx: x + w * Math.min(0.96, Math.max(0.04, gx)),
        ty: y + h * Math.min(0.95, Math.max(0.05, gy)),
        cx: this.w * (0.3 + Math.random() * 0.4),
        cy: this.h * 0.2,
        t: 0,
        dur: 460,
        delay: 300 + i * stagger,
        isGoal: s.isGoal,
        label: s.label,
        done: false,
      });
    });

    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private impact(px: number, py: number, goal: boolean) {
    for (const row of this.points) {
      for (const p of row) {
        const d = Math.hypot(p.bx - px, p.by - py);
        const sigma = goal ? 64 : 48;
        const amp = (goal ? 26 : 16) * Math.exp(-((d / sigma) ** 2));
        if (amp < 0.2) continue;
        const ux = (p.bx - px) / (d || 1);
        const uy = (p.by - py) / (d || 1);
        // push outward + "into" the net (downward bias) for a believable bulge
        p.vx += ux * amp * 0.4;
        p.vy += uy * amp * 0.4 + amp * 0.5;
      }
    }
  }

  private tick = (now: number) => {
    const dt = Math.min(40, now - this.last);
    this.last = now;
    this.elapsed += dt;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this.drawPitch();

    // integrate net (spring back to rest, damped)
    const k = 0.012;
    const damp = 0.86;
    for (const row of this.points) {
      for (const p of row) {
        p.vx += -k * p.dx;
        p.vy += -k * p.dy;
        p.vx *= damp;
        p.vy *= damp;
        p.dx += p.vx;
        p.dy += p.vy;
      }
    }

    // advance balls; trigger impacts
    for (const b of this.balls) {
      if (b.done) continue;
      if (this.elapsed < b.delay) continue;
      b.t = Math.min(1, b.t + dt / b.dur);
      if (b.t >= 1 && !b.done) {
        b.done = true;
        this.impact(b.tx, b.ty, b.isGoal);
        if (b.isGoal && b.label) this.labels.push({ text: b.label, x: b.tx, y: b.ty, age: 0 });
      }
    }

    this.drawNet();
    this.drawBalls();
    this.drawLabels(dt);

    const settling = this.points.some((row) => row.some((p) => Math.abs(p.dx) + Math.abs(p.dy) > 0.4));
    const ballsLeft = this.balls.some((b) => !b.done);
    const labelsLeft = this.labels.length > 0;
    if (ballsLeft || settling || labelsLeft || this.elapsed < 600) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
      const cb = this.onDone;
      this.onDone = undefined;
      cb?.();
    }
  };

  private drawPitch() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, this.goal.y, 0, this.h);
    g.addColorStop(0, '#0c1a13');
    g.addColorStop(1, '#0a130f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    // penalty-spot hint
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(this.w / 2, this.h * 0.82, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawNet() {
    const ctx = this.ctx;
    const { x, y, w, h } = this.goal;
    const P = this.points;

    // net mesh
    ctx.strokeStyle = 'rgba(220,235,228,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const p = P[r][c];
        const px = p.bx + p.dx;
        const py = p.by + p.dy;
        if (c < COLS) {
          const q = P[r][c + 1];
          ctx.moveTo(px, py);
          ctx.lineTo(q.bx + q.dx, q.by + q.dy);
        }
        if (r < ROWS) {
          const q = P[r + 1][c];
          ctx.moveTo(px, py);
          ctx.lineTo(q.bx + q.dx, q.by + q.dy);
        }
      }
    }
    ctx.stroke();

    // posts + crossbar
    ctx.strokeStyle = '#eef6f1';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }

  private drawBalls() {
    const ctx = this.ctx;
    for (const b of this.balls) {
      if (this.elapsed < b.delay) continue;
      let bx: number;
      let by: number;
      let scale = 1;
      if (!b.done) {
        const t = b.t;
        const mt = 1 - t;
        bx = mt * mt * b.sx + 2 * mt * t * b.cx + t * t * b.tx;
        by = mt * mt * b.sy + 2 * mt * t * b.cy + t * t * b.ty;
        scale = 0.6 + 0.4 * (1 - t); // shrinks as it travels "away" toward goal
      } else {
        bx = b.tx;
        by = b.ty;
        scale = 0.6;
      }
      const rad = 9 * scale;
      ctx.save();
      ctx.translate(bx, by);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#f6f9f7';
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#11201a';
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawLabels(dt: number) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = '700 13px "Barlow Condensed", system-ui, sans-serif';
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.age += dt;
      const life = 2200;
      if (l.age > life) {
        this.labels.splice(i, 1);
        continue;
      }
      const a = l.age < 200 ? l.age / 200 : l.age > life - 400 ? (life - l.age) / 400 : 1;
      const ly = l.y - 18 - Math.min(14, l.age / 30);
      const tw = ctx.measureText(l.text.toUpperCase()).width + 18;
      ctx.globalAlpha = a;
      ctx.fillStyle = this.accent;
      this.roundRect(l.x - tw / 2, ly - 13, tw, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#08120d';
      ctx.fillText(l.text.toUpperCase(), l.x, ly + 1);
      ctx.globalAlpha = 1;
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.running = false;
  }
}
