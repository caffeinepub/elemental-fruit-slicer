import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGetTopScores, useSubmitScore } from "./hooks/useQueries";

// ── Types ──────────────────────────────────────────────────────────────────
type GamePhase = "menu" | "playing" | "gameover";
type FruitType =
  | "apple"
  | "watermelon"
  | "orange"
  | "mango"
  | "frostPear"
  | "volcanicPlum"
  | "gravityCore";

interface Fruit {
  id: number;
  type: FruitType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  rotSpeed: number;
  sliced: boolean;
  entered: boolean;
  deathTimer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
  color: string;
  lineWidth: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
  size: number;
}

interface GS {
  fruits: Fruit[];
  particles: Particle[];
  rings: Ring[];
  floatTexts: FloatText[];
  score: number;
  combo: number;
  lastSliceTime: number;
  comboFlash: number; // countdown ms
  zenCracks: number; // 0-9, game over at 9
  gravityInverted: boolean;
  gravityFlipAnim: number;
  slowMotion: boolean;
  slowMotionEnd: number; // real time ms
  frostAlpha: number;
  frostStart: number;
  lastSpawn: number;
  nextId: number;
  mouseDown: boolean;
  mx: number;
  my: number;
  pmx: number;
  pmy: number;
  trail: Array<{ x: number; y: number; t: number }>;
  width: number;
  height: number;
  spawnInterval: number;
}

// ── Constants ──────────────────────────────────────────────────────────────
const GRAVITY_PX = 680;
const MAX_FRUITS = 12;
const CHAIN_RADIUS = 120;
const COMBO_WINDOW = 1500;
const SLOW_DURATION = 3000;
const TRAIL_DURATION = 220;

const FRUIT_CFG: Record<
  FruitType,
  { weight: number; radius: number; points: number }
> = {
  apple: { weight: 30, radius: 35, points: 10 },
  watermelon: { weight: 25, radius: 45, points: 25 },
  orange: { weight: 20, radius: 32, points: 15 },
  mango: { weight: 15, radius: 38, points: 20 },
  frostPear: { weight: 5, radius: 36, points: 50 },
  volcanicPlum: { weight: 4, radius: 34, points: 60 },
  gravityCore: { weight: 1, radius: 30, points: 80 },
};

const TOTAL_WEIGHT = Object.values(FRUIT_CFG).reduce((s, c) => s + c.weight, 0);

function randFruitType(): FruitType {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [t, c] of Object.entries(FRUIT_CFG) as [
    FruitType,
    (typeof FRUIT_CFG)[FruitType],
  ][]) {
    r -= c.weight;
    if (r <= 0) return t;
  }
  return "apple";
}

function segCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1) return false;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// ── Canvas Drawing ─────────────────────────────────────────────────────────
function drawApple(ctx: CanvasRenderingContext2D, r: number) {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
  g.addColorStop(0, "#ff7a7a");
  g.addColorStop(0.6, "#e53935");
  g.addColorStop(1, "#7b1515");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,100,100,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = "#4e342e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, -r * 0.9);
  ctx.quadraticCurveTo(r * 0.35, -r * 1.35, r * 0.15, -r * 1.55);
  ctx.stroke();
  ctx.fillStyle = "#2e7d32";
  ctx.beginPath();
  ctx.ellipse(r * 0.18, -r * 1.2, r * 0.3, r * 0.14, 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawWatermelon(ctx: CanvasRenderingContext2D, r: number) {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  g.addColorStop(0, "#66bb6a");
  g.addColorStop(0.75, "#2e7d32");
  g.addColorStop(1, "#1b5e20");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
  ctx.clip();
  const rg = ctx.createRadialGradient(0, r * 0.1, 0, 0, r * 0.1, r * 0.84);
  rg.addColorStop(0, "#ef5350");
  rg.addColorStop(0.85, "#c62828");
  rg.addColorStop(1, "#8a1a1a");
  ctx.fillStyle = rg;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = "#1a0a06";
  const seeds = [
    [0, -r * 0.38],
    [r * 0.28, r * 0.05],
    [-r * 0.26, r * 0.22],
    [r * 0.1, r * 0.42],
    [-r * 0.05, -r * 0.62],
  ];
  for (const [sx, sy] of seeds) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(0.4);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawOrange(ctx: CanvasRenderingContext2D, r: number) {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
  g.addColorStop(0, "#ffb74d");
  g.addColorStop(0.65, "#f57c00");
  g.addColorStop(1, "#bf360c");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(180,80,0,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(-r * 0.22, -r * 0.28, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,200,100,0.28)";
  ctx.fill();
}

function drawMango(ctx: CanvasRenderingContext2D, r: number) {
  ctx.save();
  ctx.scale(0.85, 1.18);
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.38, 0, 0, r * 0.1, r);
  g.addColorStop(0, "#fff176");
  g.addColorStop(0.45, "#ffb300");
  g.addColorStop(1, "#e65100");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,150,0,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(-r * 0.18, -r * 0.32, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,245,150,0.32)";
  ctx.fill();
}

function drawFrostPear(ctx: CanvasRenderingContext2D, r: number, t: number) {
  const pulse = 0.85 + 0.15 * Math.sin(t / 380);
  ctx.shadowBlur = 22 * pulse;
  ctx.shadowColor = "rgba(90,200,255,0.85)";
  ctx.save();
  ctx.scale(0.9, 1.18);
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.3, 0, 0, r * 0.08, r);
  g.addColorStop(0, "#e8f8ff");
  g.addColorStop(0.4, "#82d8f5");
  g.addColorStop(0.8, "#29b6f6");
  g.addColorStop(1, "#0277bd");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(150,230,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 4; i++) {
    const a = t / 2200 + (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(
      Math.cos(a) * r * 0.48,
      Math.sin(a) * r * 0.42,
      2.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.strokeStyle = "#4fc3f7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.18);
  ctx.lineTo(0, -r * 0.88);
  ctx.stroke();
}

function drawVolcanicPlum(ctx: CanvasRenderingContext2D, r: number, t: number) {
  const pulse = 0.8 + 0.2 * Math.sin(t / 280);
  ctx.shadowBlur = 28 * pulse;
  ctx.shadowColor = "rgba(255,80,0,0.85)";
  const g = ctx.createRadialGradient(-r * 0.28, -r * 0.28, 0, 0, 0, r);
  g.addColorStop(0, "#8b0000");
  g.addColorStop(0.5, "#4a0505");
  g.addColorStop(1, "#140000");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  const lava = `rgba(255,${70 + 45 * Math.sin(t / 190)},0,0.85)`;
  ctx.strokeStyle = lava;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 0.52);
  ctx.lineTo(r * 0.18, r * 0.08);
  ctx.lineTo(-r * 0.28, r * 0.52);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.32, -r * 0.32);
  ctx.lineTo(r * 0.08, r * 0.32);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,100,0,${0.4 + 0.3 * pulse})`;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawGravityCore(ctx: CanvasRenderingContext2D, r: number, t: number) {
  const pulse = 0.75 + 0.25 * Math.sin(t / 500);
  ctx.shadowBlur = 32 * pulse;
  ctx.shadowColor = "rgba(139,92,246,0.9)";
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, "#3d1a6e");
  g.addColorStop(0.6, "#1a0a35");
  g.addColorStop(1, "#050515");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(139,92,246,${0.35 + 0.25 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.55, r * 0.45, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(139,92,246,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = t / 750 + (i / 7) * Math.PI * 2;
    const px = Math.cos(a) * r * 1.55;
    const py = Math.sin(a) * r * 0.45;
    const ps = 2.2 + Math.sin(a * 3) * 1;
    ctx.beginPath();
    ctx.arc(px, py, ps, 0, Math.PI * 2);
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(200,155,255,0.95)" : "rgba(255,255,255,0.9)";
    ctx.shadowBlur = 7;
    ctx.shadowColor = "#a78bfa";
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  const ig = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.58);
  ig.addColorStop(0, "rgba(160,100,255,0.42)");
  ig.addColorStop(1, "transparent");
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = ig;
  ctx.fill();
}

function drawFruit(ctx: CanvasRenderingContext2D, f: Fruit, t: number) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rotation);
  switch (f.type) {
    case "apple":
      drawApple(ctx, f.radius);
      break;
    case "watermelon":
      drawWatermelon(ctx, f.radius);
      break;
    case "orange":
      drawOrange(ctx, f.radius);
      break;
    case "mango":
      drawMango(ctx, f.radius);
      break;
    case "frostPear":
      drawFrostPear(ctx, f.radius, t);
      break;
    case "volcanicPlum":
      drawVolcanicPlum(ctx, f.radius, t);
      break;
    case "gravityCore":
      drawGravityCore(ctx, f.radius, t);
      break;
  }
  ctx.restore();
}

function drawZenStone(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  cracks: number,
  t: number,
) {
  const destroyed = cracks >= 3;
  const p = destroyed ? 0.7 + 0.3 * Math.sin(t / 180) : 1;
  ctx.save();
  ctx.shadowBlur = destroyed ? 28 * p : 6;
  ctx.shadowColor = destroyed ? "rgba(255,40,40,0.9)" : "rgba(200,180,140,0.3)";
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r);
  if (destroyed) {
    g.addColorStop(0, `rgba(210,35,35,${p})`);
    g.addColorStop(0.6, `rgba(90,8,8,${p})`);
    g.addColorStop(1, `rgba(35,0,0,${p})`);
  } else {
    const d = Math.min(1, cracks / 3);
    g.addColorStop(
      0,
      `rgba(${175 - d * 60},${165 - d * 70},${150 - d * 80},0.95)`,
    );
    g.addColorStop(
      0.5,
      `rgba(${110 - d * 40},${100 - d * 40},${88 - d * 40},0.9)`,
    );
    g.addColorStop(
      1,
      `rgba(${62 - d * 20},${55 - d * 20},${50 - d * 20},0.95)`,
    );
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = destroyed
    ? `rgba(255,80,80,${p})`
    : "rgba(230,210,180,0.55)";
  ctx.lineWidth = destroyed ? 2 : 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  const cc = destroyed
    ? `rgba(255,110,110,${p * 0.92})`
    : "rgba(30,22,18,0.88)";
  ctx.strokeStyle = cc;
  ctx.lineWidth = 1.6;
  if (cracks >= 1) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.12, cy - r * 0.62);
    ctx.lineTo(cx + r * 0.08, cy - r * 0.05);
    ctx.lineTo(cx + r * 0.04, cy + r * 0.58);
    ctx.stroke();
  }
  if (cracks >= 2) {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.48, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.04, cy - r * 0.05);
    ctx.lineTo(cx - r * 0.38, cy + r * 0.42);
    ctx.stroke();
  }
  if (destroyed) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.52, cy - r * 0.12);
    ctx.lineTo(cx + r * 0.18, cy + r * 0.14);
    ctx.moveTo(cx - r * 0.08, cy - r * 0.12);
    ctx.lineTo(cx - r * 0.62, cy + r * 0.52);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#040510");
  g.addColorStop(0.5, "#080820");
  g.addColorStop(1, "#060415");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Nebula vignette
  const ng = ctx.createRadialGradient(
    w * 0.5,
    h * 0.4,
    0,
    w * 0.5,
    h * 0.4,
    Math.max(w, h) * 0.7,
  );
  ng.addColorStop(0, "rgba(30,10,60,0.35)");
  ng.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ng;
  ctx.fillRect(0, 0, w, h);
  // Stars
  const starData = [
    [0.05, 0.12],
    [0.12, 0.05],
    [0.2, 0.18],
    [0.35, 0.04],
    [0.45, 0.11],
    [0.5, 0.22],
    [0.6, 0.06],
    [0.7, 0.14],
    [0.75, 0.05],
    [0.85, 0.19],
    [0.9, 0.1],
    [0.22, 0.35],
    [0.4, 0.28],
    [0.6, 0.38],
    [0.15, 0.48],
    [0.78, 0.32],
    [0.92, 0.42],
    [0.08, 0.62],
    [0.3, 0.7],
    [0.55, 0.65],
    [0.8, 0.72],
    [0.42, 0.82],
    [0.68, 0.88],
    [0.1, 0.9],
    [0.88, 0.85],
  ];
  for (const [sx, sy] of starData) {
    ctx.beginPath();
    const brightness = 0.3 + Math.random() * 0.5;
    ctx.arc(sx * w, sy * h, 0.8 + Math.random() * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,210,255,${brightness})`;
    ctx.fill();
  }
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gs = useRef<GS>(makeGS());
  const phaseRef = useRef<GamePhase>("menu");

  const [phase, setPhase] = useState<GamePhase>("menu");
  const [finalScore, setFinalScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: scores, refetch: refetchScores } = useGetTopScores();
  const submitMutation = useSubmitScore();

  function makeGS(): GS {
    return {
      fruits: [],
      particles: [],
      rings: [],
      floatTexts: [],
      score: 0,
      combo: 1,
      lastSliceTime: 0,
      comboFlash: 0,
      zenCracks: 0,
      gravityInverted: false,
      gravityFlipAnim: 0,
      slowMotion: false,
      slowMotionEnd: 0,
      frostAlpha: 0,
      frostStart: 0,
      lastSpawn: 0,
      nextId: 0,
      mouseDown: false,
      mx: 0,
      my: 0,
      pmx: 0,
      pmy: 0,
      trail: [],
      width: window.innerWidth,
      height: window.innerHeight,
      spawnInterval: 1400,
    };
  }

  // ── Slice a fruit ──────────────────────────────────────────────────────
  const sliceFruit = useCallback((id: number, isChain = false) => {
    const g = gs.current;
    const f = g.fruits.find((fr) => fr.id === id && !fr.sliced);
    if (!f) return;
    f.sliced = true;
    f.deathTimer = 0.6;

    const now = performance.now();
    // Combo
    if (now - g.lastSliceTime < COMBO_WINDOW) {
      g.combo = Math.min(5, g.combo + 1);
    } else {
      g.combo = 1;
    }
    g.lastSliceTime = now;
    g.comboFlash = 1200;

    const pts = FRUIT_CFG[f.type].points * g.combo;
    g.score += pts;

    // Particles
    spawnParticles(f, isChain);
    addFloatText(
      g,
      `+${pts}`,
      f.x,
      f.y,
      f.type === "gravityCore"
        ? "#c4b5fd"
        : f.type === "frostPear"
          ? "#7dd3fc"
          : f.type === "volcanicPlum"
            ? "#fb923c"
            : "#fef08a",
    );

    // Special effects
    if (!isChain) {
      if (f.type === "frostPear") {
        g.slowMotion = true;
        g.slowMotionEnd = now + SLOW_DURATION;
        g.frostAlpha = 0.38;
        g.frostStart = now;
      } else if (f.type === "volcanicPlum") {
        // Explosion ring
        g.rings.push({
          x: f.x,
          y: f.y,
          r: f.radius,
          maxR: 160,
          alpha: 0.9,
          color: "#ff6a00",
          lineWidth: 4,
        });
        g.rings.push({
          x: f.x,
          y: f.y,
          r: f.radius * 0.5,
          maxR: 120,
          alpha: 0.6,
          color: "#ff4500",
          lineWidth: 2.5,
        });
        // Chain reaction
        const victims = g.fruits.filter(
          (fr) =>
            !fr.sliced &&
            fr.id !== id &&
            Math.hypot(fr.x - f.x, fr.y - f.y) <= CHAIN_RADIUS,
        );
        for (const v of victims) {
          sliceFruit(v.id, true);
          g.score += 20; // chain bonus
          addFloatText(g, "+20", v.x, v.y - 20, "#fdba74");
        }
      } else if (f.type === "gravityCore") {
        g.gravityInverted = !g.gravityInverted;
        g.gravityFlipAnim = 1.0;
        // Purple flash ring
        g.rings.push({
          x: f.x,
          y: f.y,
          r: f.radius,
          maxR: 220,
          alpha: 0.8,
          color: "#a78bfa",
          lineWidth: 3.5,
        });
        g.rings.push({
          x: f.x,
          y: f.y,
          r: 0,
          maxR: 180,
          alpha: 0.5,
          color: "#c4b5fd",
          lineWidth: 2,
        });
      }
    }
  }, []);

  function spawnParticles(f: Fruit, isChain: boolean) {
    const g = gs.current;
    const count = isChain ? 8 : 13;
    let colors: string[];
    switch (f.type) {
      case "apple":
        colors = ["#ff4444", "#ff7777", "#ffaaaa", "#cc2200"];
        break;
      case "watermelon":
        colors = ["#ff4444", "#44bb66", "#ff7777", "#228844"];
        break;
      case "orange":
        colors = ["#ff9900", "#ffbb44", "#ff6600", "#ffcc66"];
        break;
      case "mango":
        colors = ["#ffcc00", "#ffee66", "#ffaa00", "#ffe066"];
        break;
      case "frostPear":
        colors = ["#7dd3fc", "#bae6fd", "#ffffff", "#38bdf8", "#0ea5e9"];
        break;
      case "volcanicPlum":
        colors = ["#ff6a00", "#ff4500", "#cc2200", "#ffbb44", "#ff8c00"];
        break;
      case "gravityCore":
        colors = ["#c4b5fd", "#a78bfa", "#7c3aed", "#ffffff", "#ddd6fe"];
        break;
      default:
        colors = ["#ffffff"];
    }
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 80 + Math.random() * 180;
      g.particles.push({
        x: f.x + (Math.random() - 0.5) * f.radius,
        y: f.y + (Math.random() - 0.5) * f.radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        r: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 1.1 + Math.random() * 0.6,
        gravity: 180,
      });
    }
  }

  function addFloatText(
    g: GS,
    text: string,
    x: number,
    y: number,
    color: string,
  ) {
    g.floatTexts.push({ x, y, text, color, alpha: 1, vy: -60, size: 28 });
  }

  // ── Start Game ──────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: makeGS is a stable initializer
  const startGame = useCallback(() => {
    const g = makeGS();
    g.width = window.innerWidth;
    g.height = window.innerHeight;
    gs.current = g;
    phaseRef.current = "playing";
    setPhase("playing");
    setSubmitted(false);
    setPlayerName("");
  }, []);

  // ── RAF Loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    let rafId = 0;
    let lastReal = performance.now();

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx!.scale(dpr, dpr);
      gs.current.width = w;
      gs.current.height = h;
    }
    resize();
    window.addEventListener("resize", resize);

    function spawnFruit(g: GS) {
      if (g.fruits.filter((f) => !f.sliced).length >= MAX_FRUITS) return;
      const type = randFruitType();
      const cfg = FRUIT_CFG[type];
      const w = g.width;
      const h = g.height;
      const r = cfg.radius;
      let x: number;
      let y: number;
      let vx: number;
      let vy: number;
      if (g.gravityInverted) {
        x = r + Math.random() * (w - r * 2);
        y = -r;
        vx = (Math.random() - 0.5) * 180;
        vy = 480 + Math.random() * 280;
      } else {
        x = r + Math.random() * (w - r * 2);
        y = h + r;
        vx = (Math.random() - 0.5) * 180;
        vy = -(520 + Math.random() * 300);
      }
      g.fruits.push({
        id: g.nextId++,
        type,
        x,
        y,
        vx,
        vy,
        radius: r,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 2.5,
        sliced: false,
        entered: false,
        deathTimer: 0,
      });
    }

    function loop(realNow: number) {
      rafId = requestAnimationFrame(loop);
      const g = gs.current;
      const realDelta = Math.min(50, realNow - lastReal) / 1000;
      lastReal = realNow;

      // Slow motion timer
      if (g.slowMotion && realNow > g.slowMotionEnd) {
        g.slowMotion = false;
      }
      if (g.frostAlpha > 0 && !g.slowMotion) {
        g.frostAlpha = Math.max(0, g.frostAlpha - realDelta * 0.18);
      } else if (g.slowMotion) {
        const elapsed = realNow - g.frostStart;
        g.frostAlpha = Math.max(0, 1 - elapsed / SLOW_DURATION) * 0.38;
      }

      const dt = realDelta * (g.slowMotion ? 0.25 : 1);
      const grav = GRAVITY_PX * (g.gravityInverted ? -1 : 1);
      const { width: w, height: h } = g;

      if (phaseRef.current === "playing") {
        // Spawn
        if (realNow - g.lastSpawn > g.spawnInterval) {
          spawnFruit(g);
          g.lastSpawn = realNow;
          g.spawnInterval = Math.max(800, g.spawnInterval - 1);
        }

        // Update fruits
        for (const f of g.fruits) {
          if (f.sliced) {
            f.deathTimer -= dt;
            continue;
          }
          f.vy += grav * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.rotation += f.rotSpeed * dt;
          if (!f.entered) {
            if (!g.gravityInverted && f.y < h) f.entered = true;
            if (g.gravityInverted && f.y > 0) f.entered = true;
          }
          // Miss check
          if (f.entered) {
            const missed = !g.gravityInverted
              ? f.y > h + f.radius + 30
              : f.y < -f.radius - 30;
            if (missed) {
              f.sliced = true;
              f.deathTimer = 0;
              if (g.zenCracks < 9) {
                g.zenCracks = Math.min(9, g.zenCracks + 1);
                if (g.zenCracks >= 9) {
                  phaseRef.current = "gameover";
                  setFinalScore(g.score);
                  setPhase("gameover");
                  refetchScores();
                }
              }
            }
          }
        }
        // Remove dead fruits
        g.fruits = g.fruits.filter((f) => !f.sliced || f.deathTimer > 0);

        // Gravity flip anim
        if (g.gravityFlipAnim > 0)
          g.gravityFlipAnim = Math.max(0, g.gravityFlipAnim - dt * 1.8);

        // Combo flash
        if (g.comboFlash > 0) g.comboFlash -= dt * 1000;
      }

      // Update particles
      for (const p of g.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
        p.alpha = Math.max(0, p.alpha - p.decay * dt);
      }
      g.particles = g.particles.filter((p) => p.alpha > 0);

      // Update rings
      for (const r of g.rings) {
        r.r += (r.maxR - r.r) * dt * 4.5;
        r.alpha = Math.max(0, r.alpha - dt * 2.2);
      }
      g.rings = g.rings.filter((r) => r.alpha > 0.01);

      // Update float texts
      for (const ft of g.floatTexts) {
        ft.y += ft.vy * dt;
        ft.alpha = Math.max(0, ft.alpha - dt * 1.1);
      }
      g.floatTexts = g.floatTexts.filter((ft) => ft.alpha > 0);

      // Trim trail
      g.trail = g.trail.filter((pt) => realNow - pt.t < TRAIL_DURATION);

      // ── DRAW ──────────────────────────────────────────────────────────
      drawBackground(ctx, w, h);

      // Frost overlay
      if (g.frostAlpha > 0.01) {
        ctx.fillStyle = `rgba(64,140,220,${g.frostAlpha})`;
        ctx.fillRect(0, 0, w, h);
        // Ice edge vignette
        const iv = ctx.createRadialGradient(
          w / 2,
          h / 2,
          h * 0.3,
          w / 2,
          h / 2,
          h * 0.85,
        );
        iv.addColorStop(0, "transparent");
        iv.addColorStop(1, `rgba(100,200,255,${g.frostAlpha * 0.6})`);
        ctx.fillStyle = iv;
        ctx.fillRect(0, 0, w, h);
      }

      // Rings
      for (const rr of g.rings) {
        ctx.beginPath();
        ctx.arc(rr.x, rr.y, rr.r, 0, Math.PI * 2);
        ctx.strokeStyle = rr.color
          .replace(")", `,${rr.alpha})`)
          .replace("rgb", "rgba");
        ctx.strokeStyle =
          rr.color +
          Math.round(rr.alpha * 255)
            .toString(16)
            .padStart(2, "0");
        ctx.lineWidth = rr.lineWidth * rr.alpha;
        ctx.stroke();
      }

      // Fruits
      for (const f of g.fruits) {
        if (!f.sliced) drawFruit(ctx, f, realNow);
      }

      // Particles
      for (const p of g.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }

      // Float texts
      ctx.save();
      ctx.textAlign = "center";
      for (const ft of g.floatTexts) {
        ctx.globalAlpha = ft.alpha;
        ctx.font = `bold ${ft.size}px 'Bricolage Grotesque', sans-serif`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = ft.color;
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.restore();

      // Slice trail
      if (g.trail.length > 1) {
        ctx.save();
        ctx.lineCap = "round";
        for (let i = 1; i < g.trail.length; i++) {
          const p0 = g.trail[i - 1];
          const p1 = g.trail[i];
          const age = 1 - (realNow - p1.t) / TRAIL_DURATION;
          if (age <= 0) continue;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `rgba(220,240,255,${age * 0.85})`;
          ctx.lineWidth = 3 * age;
          ctx.stroke();
          ctx.strokeStyle = `rgba(160,210,255,${age * 0.4})`;
          ctx.lineWidth = 9 * age;
          ctx.stroke();
        }
        ctx.restore();
      }

      if (phaseRef.current === "playing") {
        // HUD: Score
        ctx.save();
        ctx.font = "bold 28px 'Bricolage Grotesque', sans-serif";
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(220,230,255,0.9)";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "rgba(100,160,255,0.5)";
        ctx.fillText(`${g.score}`, w - 24, 44);
        ctx.font = "14px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(150,170,220,0.7)";
        ctx.fillText("SCORE", w - 24, 62);
        ctx.shadowBlur = 0;

        // Combo
        if (g.combo > 1 && g.comboFlash > 0) {
          const cf = Math.min(1, g.comboFlash / 800);
          ctx.textAlign = "center";
          ctx.globalAlpha = cf;
          ctx.font = `bold ${48 + (g.combo - 1) * 6}px 'Bricolage Grotesque', sans-serif`;
          const colors = ["", "", "#fbbf24", "#fb923c", "#f472b6", "#a78bfa"];
          ctx.fillStyle = colors[Math.min(5, g.combo)] || "#fbbf24";
          ctx.shadowBlur = 20;
          ctx.shadowColor = ctx.fillStyle;
          ctx.fillText(`✕${g.combo} COMBO!`, w / 2, h / 2 - 60);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }

        // Zen Stones
        const stoneR = 22;
        const stoneY = h - 58;
        const stoneSpacing = 62;
        const stonesX = w / 2 - stoneSpacing;
        ctx.textAlign = "center";
        ctx.font = "11px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(160,150,130,0.7)";
        ctx.fillText("ZEN STONES", w / 2, stoneY - stoneR - 10);
        for (let i = 0; i < 3; i++) {
          const stoneCracks = Math.min(3, Math.max(0, g.zenCracks - i * 3));
          drawZenStone(
            ctx,
            stonesX + i * stoneSpacing,
            stoneY,
            stoneR,
            stoneCracks,
            realNow,
          );
        }

        // Gravity indicator
        if (g.gravityInverted) {
          const pulse = 0.75 + 0.25 * Math.sin(realNow / 400);
          ctx.globalAlpha = pulse;
          ctx.textAlign = "center";
          ctx.font = "bold 15px 'Bricolage Grotesque', sans-serif";
          ctx.fillStyle = "#a78bfa";
          ctx.shadowBlur = 12;
          ctx.shadowColor = "#7c3aed";
          ctx.fillText("↕ GRAVITY INVERTED", w / 2, 28);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }

        // Slow motion indicator
        if (g.slowMotion) {
          const remaining = (g.slowMotionEnd - realNow) / SLOW_DURATION;
          ctx.textAlign = "left";
          ctx.font = "bold 14px 'Bricolage Grotesque', sans-serif";
          ctx.fillStyle = `rgba(125,210,255,${0.7 + 0.3 * Math.sin(realNow / 200)})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#0ea5e9";
          ctx.fillText("❄ FROST SLOW", 20, 44);
          // Progress bar
          ctx.fillStyle = "rgba(14,165,233,0.35)";
          ctx.fillRect(20, 52, 130 * remaining, 4);
          ctx.fillStyle = "rgba(125,210,255,0.7)";
          ctx.fillRect(20, 52, 130 * remaining, 4);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [refetchScores]);

  // ── Mouse handlers ────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (phaseRef.current !== "playing") return;
    const g = gs.current;
    g.mouseDown = true;
    g.pmx = e.clientX;
    g.pmy = e.clientY;
    g.mx = e.clientX;
    g.my = e.clientY;
    g.trail = [];
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (phaseRef.current !== "playing") return;
      const g = gs.current;
      g.pmx = g.mx;
      g.pmy = g.my;
      g.mx = e.clientX;
      g.my = e.clientY;
      const now = performance.now();
      g.trail.push({ x: g.mx, y: g.my, t: now });
      if (g.mouseDown && Math.hypot(g.mx - g.pmx, g.my - g.pmy) > 8) {
        for (const f of g.fruits) {
          if (
            !f.sliced &&
            segCircle(g.pmx, g.pmy, g.mx, g.my, f.x, f.y, f.radius)
          ) {
            sliceFruit(f.id);
          }
        }
      }
    },
    [sliceFruit],
  );

  const handleMouseUp = useCallback(() => {
    gs.current.mouseDown = false;
  }, []);

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (phaseRef.current !== "playing") return;
    e.preventDefault();
    const t = e.touches[0];
    const g = gs.current;
    g.mouseDown = true;
    g.pmx = t.clientX;
    g.pmy = t.clientY;
    g.mx = t.clientX;
    g.my = t.clientY;
    g.trail = [];
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (phaseRef.current !== "playing") return;
      e.preventDefault();
      const touch = e.touches[0];
      const g = gs.current;
      g.pmx = g.mx;
      g.pmy = g.my;
      g.mx = touch.clientX;
      g.my = touch.clientY;
      const now = performance.now();
      g.trail.push({ x: g.mx, y: g.my, t: now });
      if (Math.hypot(g.mx - g.pmx, g.my - g.pmy) > 8) {
        for (const f of g.fruits) {
          if (
            !f.sliced &&
            segCircle(g.pmx, g.pmy, g.mx, g.my, f.x, f.y, f.radius)
          ) {
            sliceFruit(f.id);
          }
        }
      }
    },
    [sliceFruit],
  );

  const handleTouchEnd = useCallback(() => {
    gs.current.mouseDown = false;
  }, []);

  const handleSubmit = async () => {
    if (!playerName.trim()) return;
    await submitMutation.mutateAsync({
      playerName: playerName.trim(),
      score: finalScore,
    });
    setSubmitted(true);
    refetchScores();
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: "#040510" }}
    >
      <canvas
        ref={canvasRef}
        data-ocid="game.canvas_target"
        className="absolute inset-0"
        style={{
          cursor: phase === "playing" ? "crosshair" : "default",
          touchAction: "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      <AnimatePresence>
        {phase === "menu" && (
          <MenuOverlay
            onStart={startGame}
            scores={scores}
            showLeaderboard={showLeaderboard}
            setShowLeaderboard={setShowLeaderboard}
          />
        )}
        {phase === "gameover" && (
          <GameOverOverlay
            score={finalScore}
            playerName={playerName}
            setPlayerName={setPlayerName}
            onSubmit={handleSubmit}
            onPlayAgain={startGame}
            onShowLeaderboard={() => setShowLeaderboard(true)}
            submitted={submitted}
            isSubmitting={submitMutation.isPending}
            scores={scores}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Menu Overlay ───────────────────────────────────────────────────────────
function MenuOverlay({
  onStart,
  scores,
  showLeaderboard,
  setShowLeaderboard,
}: {
  onStart: () => void;
  scores: Array<{ score: bigint; playerName: string }> | undefined;
  showLeaderboard: boolean;
  setShowLeaderboard: (v: boolean) => void;
}) {
  return (
    <motion.div
      key="menu"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background:
          "linear-gradient(180deg, rgba(4,5,20,0.7) 0%, rgba(8,8,32,0.85) 100%)",
      }}
    >
      {/* Title */}
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.7 }}
        className="text-center mb-10"
      >
        <div
          className="font-display text-6xl md:text-8xl font-extrabold tracking-tight mb-2"
          style={{
            background:
              "linear-gradient(135deg, #7dd3fc 0%, #60a5fa 30%, #c4b5fd 60%, #f0abfc 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 0 30px rgba(139,92,246,0.5))",
          }}
        >
          ELEMENTAL
        </div>
        <div
          className="font-display text-4xl md:text-5xl font-bold tracking-widest uppercase"
          style={{ color: "rgba(220,230,255,0.92)", letterSpacing: "0.28em" }}
        >
          FRUIT SLICER
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-sm mt-4 font-body"
          style={{ color: "rgba(150,170,220,0.75)" }}
        >
          Slice fruits. Harness elemental powers. Survive the storm.
        </motion.p>
      </motion.div>

      {/* Fruit type legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="flex gap-6 mb-8 flex-wrap justify-center px-6"
      >
        {[
          { icon: "🍎", label: "Apple", sub: "+10" },
          { icon: "🍉", label: "Melon", sub: "+25" },
          { icon: "❄️", label: "Frost Pear", sub: "Slow-Mo" },
          { icon: "🌋", label: "Plum", sub: "Chain!" },
          { icon: "🌀", label: "Gravity Core", sub: "Flip!" },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1">
            <span className="text-2xl">{item.icon}</span>
            <span
              className="font-body text-xs"
              style={{ color: "rgba(170,185,230,0.8)" }}
            >
              {item.label}
            </span>
            <span
              className="font-body text-xs font-semibold"
              style={{ color: "rgba(250,220,100,0.85)" }}
            >
              {item.sub}
            </span>
          </div>
        ))}
      </motion.div>

      {/* Buttons */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="flex flex-col items-center gap-4 w-full max-w-xs px-6"
      >
        <button
          type="button"
          data-ocid="menu.primary_button"
          onClick={onStart}
          className="w-full font-display font-bold text-lg tracking-widest py-4 px-8 rounded-xl relative overflow-hidden group"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.9) 50%, rgba(168,85,247,0.9) 100%)",
            border: "1px solid rgba(196,181,253,0.35)",
            color: "#fff",
            boxShadow:
              "0 0 32px rgba(139,92,246,0.45), 0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            <Play size={20} /> SLICE NOW
          </span>
        </button>

        <button
          type="button"
          data-ocid="menu.tab"
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className="w-full font-body text-sm py-3 px-6 rounded-xl flex items-center justify-center gap-2"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(200,190,240,0.2)",
            color: "rgba(180,195,240,0.85)",
          }}
        >
          <Trophy size={16} />
          {showLeaderboard ? "Hide Leaderboard" : "Leaderboard"}
          {showLeaderboard ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>
      </motion.div>

      {/* Leaderboard */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-6 w-full max-w-sm px-6 overflow-hidden"
          >
            <LeaderboardTable scores={scores} />
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </motion.div>
  );
}

// ── Game Over Overlay ──────────────────────────────────────────────────────
function GameOverOverlay({
  score,
  playerName,
  setPlayerName,
  onSubmit,
  onPlayAgain,
  submitted,
  isSubmitting,
  scores,
}: {
  score: number;
  playerName: string;
  setPlayerName: (v: string) => void;
  onSubmit: () => void;
  onPlayAgain: () => void;
  onShowLeaderboard: () => void;
  submitted: boolean;
  isSubmitting: boolean;
  scores: Array<{ score: bigint; playerName: string }> | undefined;
}) {
  const [showLB, setShowLB] = useState(false);
  return (
    <motion.div
      key="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background:
          "linear-gradient(180deg, rgba(30,5,5,0.88) 0%, rgba(10,4,25,0.92) 100%)",
      }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", delay: 0.1 }}
        className="text-center mb-8"
      >
        <div
          className="font-display text-5xl md:text-7xl font-extrabold mb-2"
          style={{
            color: "#ff4444",
            textShadow:
              "0 0 40px rgba(255,40,40,0.7), 0 0 80px rgba(200,0,0,0.3)",
          }}
        >
          GAME OVER
        </div>
        <div
          className="font-display text-4xl font-bold mt-4"
          style={{ color: "rgba(250,220,100,0.95)" }}
        >
          {score.toLocaleString()}
        </div>
        <div
          className="font-body text-sm mt-1"
          style={{ color: "rgba(180,160,120,0.75)" }}
        >
          FINAL SCORE
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-sm px-6 flex flex-col gap-3"
      >
        {!submitted ? (
          <>
            <Input
              data-ocid="gameover.input"
              placeholder="Enter your name…"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              maxLength={24}
              className="font-body text-center text-base"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(250,220,100,0.3)",
                color: "rgba(240,235,210,0.95)",
              }}
            />
            <button
              type="button"
              data-ocid="gameover.submit_button"
              onClick={onSubmit}
              disabled={!playerName.trim() || isSubmitting}
              className="w-full py-3 rounded-xl font-display font-bold tracking-widest text-sm"
              style={{
                background: playerName.trim()
                  ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
                  : "rgba(100,90,60,0.4)",
                color: playerName.trim() ? "#1a1200" : "rgba(180,160,80,0.5)",
                border: "none",
                cursor: playerName.trim() ? "pointer" : "default",
                boxShadow: playerName.trim()
                  ? "0 0 20px rgba(251,191,36,0.4)"
                  : "none",
                transition: "all 0.2s",
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="inline animate-spin mr-2" />
                  Submitting…
                </>
              ) : (
                "SUBMIT SCORE"
              )}
            </button>
          </>
        ) : (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-3 font-body"
            style={{ color: "#4ade80" }}
          >
            ✓ Score submitted!
          </motion.div>
        )}

        <button
          type="button"
          data-ocid="gameover.primary_button"
          onClick={onPlayAgain}
          className="w-full py-3 rounded-xl font-display font-bold tracking-widest text-sm flex items-center justify-center gap-2"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))",
            color: "#fff",
            border: "1px solid rgba(196,181,253,0.3)",
            boxShadow: "0 0 20px rgba(139,92,246,0.35)",
          }}
        >
          <RotateCcw size={16} /> PLAY AGAIN
        </button>

        <button
          type="button"
          onClick={() => setShowLB(!showLB)}
          className="w-full py-2 rounded-xl font-body text-sm flex items-center justify-center gap-2"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: "rgba(180,195,240,0.8)",
            border: "1px solid rgba(200,190,240,0.15)",
          }}
        >
          <Trophy size={15} /> {showLB ? "Hide Leaderboard" : "Leaderboard"}
        </button>
      </motion.div>

      <AnimatePresence>
        {showLB && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-5 w-full max-w-sm px-6 overflow-hidden"
          >
            <LeaderboardTable scores={scores} />
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </motion.div>
  );
}

function LeaderboardTable({
  scores,
}: { scores: Array<{ score: bigint; playerName: string }> | undefined }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(200,190,240,0.15)",
      }}
    >
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{
          borderColor: "rgba(200,190,240,0.15)",
          color: "rgba(200,185,245,0.9)",
        }}
      >
        <Trophy size={14} />
        <span className="font-display text-sm font-bold tracking-widest">
          TOP SCORES
        </span>
      </div>
      {!scores || scores.length === 0 ? (
        <div
          className="px-4 py-6 text-center font-body text-sm"
          style={{ color: "rgba(150,140,180,0.6)" }}
        >
          No scores yet. Be the first!
        </div>
      ) : (
        <div
          className="divide-y"
          style={{ borderColor: "rgba(200,190,240,0.1)" }}
        >
          {scores.slice(0, 10).map((s, i) => (
            <div
              key={`${s.playerName}_${i}`}
              className="px-4 py-2 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span
                  className="font-display text-sm font-bold w-6"
                  style={{
                    color:
                      i === 0
                        ? "#fbbf24"
                        : i === 1
                          ? "rgba(200,200,200,0.9)"
                          : i === 2
                            ? "#cd7c3a"
                            : "rgba(140,130,170,0.7)",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="font-body text-sm"
                  style={{ color: "rgba(210,205,240,0.88)" }}
                >
                  {s.playerName}
                </span>
              </div>
              <span
                className="font-display text-sm font-bold"
                style={{ color: "rgba(250,220,100,0.9)" }}
              >
                {Number(s.score).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  const href = `https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`;
  return (
    <div
      className="absolute bottom-4 left-0 right-0 text-center font-body text-xs"
      style={{ color: "rgba(120,110,155,0.55)" }}
    >
      © {year}.{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "rgba(150,140,190,0.65)" }}
      >
        Built with ♥ using caffeine.ai
      </a>
    </div>
  );
}
