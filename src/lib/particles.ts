import type { ParticleType } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Particle {
  x: number;        // 0-1 normalized position
  y: number;
  vx: number;       // velocity (normalized units per second)
  vy: number;
  size: number;     // in pixels
  rotation: number;  // radians
  rotSpeed: number;  // radians per second
  opacity: number;
  color: string;
  shape: string;     // particle type specific: 'rect' | 'circle' | 'heart' | 'star'
  life: number;      // 0-1, decreases over time
  /** Seconds this particle lives in total (used for respawn rate) */
  maxLife: number;
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ['#FF1493', '#FFD700', '#00FF7F', '#00BFFF', '#FF6B00', '#BF00FF'];
const HEART_COLORS = ['#FF1493', '#FF6B6B', '#FF0066'];
const SPARK_COLORS = ['#FFD700', '#FFA500', '#FFFFFF', '#FFEC8B'];
const SNOW_COLORS = ['#FFFFFF', '#E0F0FF', '#D0E8FF'];
const STAR_COLORS = ['#FFFFFF', '#FFD700', '#FFFACD'];
const BUBBLE_COLORS = ['#E0F4FF', '#FFFFFF', '#B0E0FF', '#C0EEFF'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Particle factory per type
// ---------------------------------------------------------------------------

function createConfettiParticle(): Particle {
  return {
    x: rand(0, 1),
    y: rand(-0.3, 0.33),
    vx: rand(-0.04, 0.04),
    vy: rand(0.08, 0.18),
    size: rand(4, 8),
    rotation: rand(0, Math.PI * 2),
    rotSpeed: rand(-3, 3),
    opacity: rand(0.8, 1),
    color: pick(CONFETTI_COLORS),
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    life: 1,
    maxLife: rand(3, 6),
  };
}

function createSnowParticle(): Particle {
  return {
    x: rand(0, 1),
    y: rand(-0.2, 0),
    vx: rand(-0.01, 0.01),
    vy: rand(0.02, 0.06),
    size: rand(2, 6),
    rotation: 0,
    rotSpeed: 0,
    opacity: rand(0.3, 0.8),
    color: pick(SNOW_COLORS),
    shape: 'circle',
    life: 1,
    maxLife: rand(6, 12),
  };
}

function createSparkParticle(): Particle {
  // Burst from random edges
  const edge = Math.random();
  let x: number, y: number, vx: number, vy: number;
  if (edge < 0.25) {
    // top
    x = rand(0, 1); y = 0; vx = rand(-0.1, 0.1); vy = rand(0.1, 0.3);
  } else if (edge < 0.5) {
    // bottom
    x = rand(0, 1); y = 1; vx = rand(-0.1, 0.1); vy = rand(-0.3, -0.1);
  } else if (edge < 0.75) {
    // left
    x = 0; y = rand(0, 1); vx = rand(0.1, 0.3); vy = rand(-0.1, 0.1);
  } else {
    // right
    x = 1; y = rand(0, 1); vx = rand(-0.3, -0.1); vy = rand(-0.1, 0.1);
  }
  return {
    x, y, vx, vy,
    size: rand(1, 3),
    rotation: 0,
    rotSpeed: 0,
    opacity: rand(0.8, 1),
    color: pick(SPARK_COLORS),
    shape: 'circle',
    life: 1,
    maxLife: rand(0.5, 1.5),
  };
}

function createHeartParticle(): Particle {
  return {
    x: rand(0, 1),
    y: rand(1, 1.2),
    vx: rand(-0.02, 0.02),
    vy: rand(-0.06, -0.03),
    size: rand(6, 12),
    rotation: rand(-0.2, 0.2),
    rotSpeed: rand(-0.5, 0.5),
    opacity: rand(0.6, 1),
    color: pick(HEART_COLORS),
    shape: 'heart',
    life: 1,
    maxLife: rand(4, 8),
  };
}

function createStarParticle(): Particle {
  return {
    x: rand(0, 1),
    y: rand(0, 1),
    vx: 0,
    vy: 0,
    size: rand(2, 5),
    rotation: rand(0, Math.PI * 2),
    rotSpeed: rand(-0.3, 0.3),
    opacity: rand(0.3, 1),
    color: pick(STAR_COLORS),
    shape: 'star',
    life: 1,
    maxLife: rand(2, 5),
  };
}

function createBubbleParticle(): Particle {
  return {
    x: rand(0, 1),
    y: rand(1, 1.2),
    vx: rand(-0.015, 0.015),
    vy: rand(-0.05, -0.02),
    size: rand(4, 10),
    rotation: 0,
    rotSpeed: 0,
    opacity: rand(0.2, 0.5),
    color: pick(BUBBLE_COLORS),
    shape: 'circle',
    life: 1,
    maxLife: rand(5, 10),
  };
}

const PARTICLE_FACTORIES: Record<string, () => Particle> = {
  confetti: createConfettiParticle,
  snow: createSnowParticle,
  sparks: createSparkParticle,
  hearts: createHeartParticle,
  stars: createStarParticle,
  bubbles: createBubbleParticle,
};

// ---------------------------------------------------------------------------
// 1. createParticles
// ---------------------------------------------------------------------------

/**
 * Create an initial array of particles for the given type.
 * Positions are normalized (0-1). canvasWidth/canvasHeight are provided
 * so callers can pass dimensions but are not used for position math
 * (kept for API symmetry with update/draw).
 */
export function createParticles(
  type: ParticleType,
  count: number,
  _canvasWidth: number,
  _canvasHeight: number,
): Particle[] {
  if (type === 'none') return [];
  const factory = PARTICLE_FACTORIES[type];
  if (!factory) return [];

  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const p = factory();
    // Stagger initial life so they don't all die at once
    p.life = rand(0.3, 1);
    particles.push(p);
  }
  return particles;
}

// ---------------------------------------------------------------------------
// 2. updateParticles
// ---------------------------------------------------------------------------

/**
 * Advance all particles by `dt` seconds. Applies movement, life decay,
 * removes dead particles, and respawns new ones to maintain the original
 * count. Stateless — pass particles in, get updated particles out.
 */
export function updateParticles(
  particles: Particle[],
  dt: number,
  _canvasWidth: number,
  _canvasHeight: number,
): Particle[] {
  if (particles.length === 0) return particles;

  // Detect the particle type from the first particle's shape to know
  // which factory to use for respawns
  const firstShape = particles[0].shape;
  let typeKey: string;
  switch (firstShape) {
    case 'rect': typeKey = 'confetti'; break;
    case 'heart': typeKey = 'hearts'; break;
    case 'star': typeKey = 'stars'; break;
    default:
      // circle — disambiguate via color
      if (particles[0].color === '#FFD700' || particles[0].color === '#FFA500' || particles[0].color === '#FFEC8B') {
        typeKey = 'sparks';
      } else if (particles[0].maxLife > 5 && particles[0].vy < 0) {
        typeKey = 'bubbles';
      } else if (particles[0].vy > 0) {
        typeKey = particles[0].opacity <= 0.8 && particles[0].size <= 6 ? 'snow' : 'confetti';
      } else {
        typeKey = 'snow';
      }
      break;
  }

  const targetCount = particles.length;
  const updated: Particle[] = [];

  for (const p of particles) {
    // Clone to keep stateless contract
    const np = { ...p };

    // Life decay
    np.life -= dt / np.maxLife;

    // Stars: pulse opacity instead of linear decay
    if (np.shape === 'star') {
      // Sinusoidal twinkle — life still counts down but opacity oscillates
      np.opacity = 0.3 + 0.7 * Math.abs(Math.sin(np.life * Math.PI * 3));
    }

    // Movement
    np.x += np.vx * dt;
    np.y += np.vy * dt;
    np.rotation += np.rotSpeed * dt;

    // Type-specific physics
    if (typeKey === 'confetti') {
      // Slight gravity + wind wobble
      np.vy += 0.02 * dt;
      np.vx += Math.sin(np.life * 10) * 0.01 * dt;
    } else if (typeKey === 'snow') {
      // Gentle horizontal wander
      np.vx += Math.sin(np.life * 8 + np.x * 5) * 0.005 * dt;
      // Clamp horizontal drift
      np.vx = Math.max(-0.02, Math.min(0.02, np.vx));
    } else if (typeKey === 'sparks') {
      // Decelerate and fade quickly
      np.vx *= 1 - 2 * dt;
      np.vy *= 1 - 2 * dt;
      np.opacity = np.life;
    } else if (typeKey === 'hearts') {
      // Gentle sway
      np.vx = Math.sin(np.life * 6) * 0.02;
    } else if (typeKey === 'bubbles') {
      // Wobble horizontally
      np.vx = Math.sin(np.life * 5 + np.x * 8) * 0.015;
    }

    // Opacity fade near end of life (except stars which twinkle)
    if (np.shape !== 'star' && np.life < 0.2) {
      np.opacity = Math.max(0, np.life / 0.2) * np.opacity;
    }

    if (np.life > 0) {
      updated.push(np);
    }
  }

  // Respawn dead particles
  const factory = PARTICLE_FACTORIES[typeKey] ?? PARTICLE_FACTORIES['confetti'];
  while (updated.length < targetCount) {
    const fresh = factory();
    fresh.life = 1;
    updated.push(fresh);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// 3. drawParticles
// ---------------------------------------------------------------------------

/**
 * Render all particles onto a CanvasRenderingContext2D.
 * Positions are scaled from normalized (0-1) to canvas pixel dimensions.
 */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  for (const p of particles) {
    const px = p.x * canvasWidth;
    const py = p.y * canvasHeight;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
    ctx.translate(px, py);
    ctx.rotate(p.rotation);

    switch (p.shape) {
      case 'rect':
        drawRect(ctx, p);
        break;
      case 'circle':
        drawCircle(ctx, p);
        break;
      case 'heart':
        drawHeart(ctx, p);
        break;
      case 'star':
        drawStar(ctx, p);
        break;
      default:
        drawCircle(ctx, p);
        break;
    }

    ctx.restore();
  }
}

function drawRect(ctx: CanvasRenderingContext2D, p: Particle): void {
  const w = p.size;
  const h = p.size * 0.6;
  ctx.fillStyle = p.color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
}

function drawCircle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const r = p.size / 2;
  // Soft-edge radial gradient
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, p.color);
  grad.addColorStop(0.7, p.color);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, p: Particle): void {
  const s = p.size / 2;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  // Heart drawn from top-center dip using bezier curves
  ctx.moveTo(0, s * 0.4);
  // Left side
  ctx.bezierCurveTo(-s * 0.1, -s * 0.1, -s, -s * 0.3, -s, s * 0.1);
  ctx.bezierCurveTo(-s, s * 0.6, 0, s * 0.8, 0, s);
  // Right side
  ctx.bezierCurveTo(0, s * 0.8, s, s * 0.6, s, s * 0.1);
  ctx.bezierCurveTo(s, -s * 0.3, s * 0.1, -s * 0.1, 0, s * 0.4);
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, p: Particle): void {
  const outerR = p.size / 2;
  const innerR = outerR * 0.4;
  const points = 5;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// 4. getParticleCSS
// ---------------------------------------------------------------------------

/**
 * Returns a CSS `background-image` string that creates a static
 * decorative preview of the particle type. Used on template card overlays.
 * `density` controls how many dots appear (0-1).
 */
export function getParticleCSS(type: ParticleType, density: number): string {
  if (type === 'none') return 'none';

  const d = Math.max(0, Math.min(1, density));

  switch (type) {
    case 'confetti': {
      // Scattered small colored dots
      const dots = generateCSSdots(Math.round(12 * d), CONFETTI_COLORS, 2, 4);
      return dots;
    }
    case 'snow': {
      const dots = generateCSSdots(Math.round(15 * d), SNOW_COLORS, 2, 5);
      return dots;
    }
    case 'sparks': {
      const dots = generateCSSdots(Math.round(10 * d), SPARK_COLORS, 1, 2);
      return dots;
    }
    case 'hearts': {
      // Hearts are hard in pure CSS; use colored dots as approximation
      const dots = generateCSSdots(Math.round(8 * d), HEART_COLORS, 3, 5);
      return dots;
    }
    case 'stars': {
      const dots = generateCSSdots(Math.round(14 * d), STAR_COLORS, 1, 3);
      return dots;
    }
    case 'bubbles': {
      // Hollow-looking circles via radial gradient rings
      const count = Math.round(8 * d);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const x = Math.round(rand(5, 95));
        const y = Math.round(rand(5, 95));
        const size = Math.round(rand(6, 14));
        const color = pick(BUBBLE_COLORS);
        parts.push(
          `radial-gradient(circle ${size}px at ${x}% ${y}%, transparent 40%, ${color}44 60%, transparent 70%)`,
        );
      }
      return parts.join(', ') || 'none';
    }
    default:
      return 'none';
  }
}

/**
 * Build a CSS background-image of scattered radial-gradient dots.
 */
function generateCSSdots(
  count: number,
  colors: string[],
  minSize: number,
  maxSize: number,
): string {
  if (count <= 0) return 'none';
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand(5, 95));
    const y = Math.round(rand(5, 95));
    const size = Math.round(rand(minSize, maxSize));
    const color = pick(colors);
    parts.push(
      `radial-gradient(circle ${size}px at ${x}% ${y}%, ${color} 0%, transparent 100%)`,
    );
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// 5. drawVignette
// ---------------------------------------------------------------------------

/**
 * Draws a vignette (darkened edges) overlay onto the canvas.
 * @param intensity 0 = no vignette, 1 = full black edges
 */
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
): void {
  if (intensity <= 0) return;

  const cx = width / 2;
  const cy = height / 2;
  // Radius covers the diagonal so the center stays fully clear
  const radius = Math.sqrt(cx * cx + cy * cy);

  const grad = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.5, `rgba(0,0,0,${0.15 * intensity})`);
  grad.addColorStop(0.8, `rgba(0,0,0,${0.45 * intensity})`);
  grad.addColorStop(1, `rgba(0,0,0,${0.75 * intensity})`);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 6. drawTintOverlay
// ---------------------------------------------------------------------------

/**
 * Fills the entire canvas with a semi-transparent tint color.
 * @param color An rgba string, e.g. "rgba(255,0,0,0.15)"
 */
export function drawTintOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
