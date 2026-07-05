import * as THREE from 'three';
import { BALL_COLORS } from '../utils/constants';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** Equirectangular ball texture: solid or striped, with number badges. */
export function createBallTexture(id: number): THREE.CanvasTexture {
  const W = 512, H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const isCue = id === 0;
  const isStripe = id >= 9;
  const color = isCue ? '#f6f1e4' : BALL_COLORS[id];

  // Base
  ctx.fillStyle = isStripe ? '#f6f1e4' : color;
  ctx.fillRect(0, 0, W, H);

  if (isStripe) {
    // Stripe band around the equator (middle of v-range)
    ctx.fillStyle = color;
    ctx.fillRect(0, H * 0.27, W, H * 0.46);
  }

  // Subtle warm noise so the surface isn't sterile
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  if (isCue) {
    // Classic red dot
    ctx.fillStyle = '#c0362c';
    ctx.beginPath();
    ctx.arc(W * 0.25, H * 0.5, 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Two number badges on opposite sides of the equator
    for (const u of [0.5, 1.0]) {
      const cx = W * u === W ? 0 : W * u; // wrap
      const cy = H * 0.5;
      const r = 34;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (cx === 0) ctx.arc(W, cy, r, 0, Math.PI * 2); // draw wrapped copy
      ctx.fillStyle = '#f6f1e4';
      ctx.fill();
      for (const x of cx === 0 ? [0, W] : [cx]) {
        ctx.fillStyle = '#1b1b20';
        ctx.font = `bold ${id > 9 ? 34 : 40}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(id), x, cy + 2);
      }
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Rich walnut wood for the table frame. */
export function createWoodTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#3a2415');
  grad.addColorStop(0.5, '#4a2f1b');
  grad.addColorStop(1, '#37220f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Grain streaks
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * H;
    const amp = 2 + Math.random() * 6;
    const alpha = 0.04 + Math.random() * 0.1;
    const light = Math.random() > 0.5;
    ctx.strokeStyle = light ? `rgba(120,80,40,${alpha})` : `rgba(15,8,3,${alpha})`;
    ctx.lineWidth = 0.5 + Math.random() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const yy = y + Math.sin(x * 0.02 + i) * amp + Math.sin(x * 0.11 + i * 3) * 1.5;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Knots
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 18 + Math.random() * 14);
    g.addColorStop(0, 'rgba(20,10,4,0.55)');
    g.addColorStop(1, 'rgba(20,10,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 40, y - 40, 80, 80);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Fine woven cloth for the playing surface. */
export function createClothTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#1c6e42';
  ctx.fillRect(0, 0, W, H);

  const img = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const weave = ((x % 3) + (y % 3) === 2 ? 6 : 0) + (Math.random() - 0.5) * 12;
      img.data[i] += weave * 0.5;
      img.data[i + 1] += weave;
      img.data[i + 2] += weave * 0.6;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Dark planked floor for the pool hall. */
export function createFloorTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#12100e';
  ctx.fillRect(0, 0, W, H);
  const plank = 64;
  for (let y = 0; y < H; y += plank) {
    const shade = 14 + Math.random() * 14;
    ctx.fillStyle = `rgb(${shade + 6},${shade + 2},${shade - 2})`;
    ctx.fillRect(0, y, W, plank - 2);
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 1;
      const yy = y + Math.random() * plank;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(W, yy + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
