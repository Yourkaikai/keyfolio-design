/**
 * Keyfolio's two-source card light, adapted to a fixed 512 × 320 web texture.
 * Put these transparent images over `body` with mix-blend-mode: plus-lighter.
 * Keep the card isolated and clip the light layers to its rounded outline.
 * Only opacity / transform should change during interaction; baking is cached.
 */
export const PROVIDERS = Object.freeze([
  { id: 'openai', name: 'OpenAI', rich: '#10A37F', deep: '#04170F', turn: 10 },
  { id: 'claude', name: 'Claude', rich: '#D97757', deep: '#1B0D07', turn: -8 },
  { id: 'gemini', name: 'Gemini', rich: '#9A6BE0', deep: '#120B22', turn: 22 },
  { id: 'deepseek', name: 'DeepSeek', rich: '#3B82F6', deep: '#050E20', turn: -13 },
  { id: 'nvidia', name: 'NVIDIA NIM', rich: '#86D400', deep: '#0F1A03', turn: 28 },
  { id: 'kimi', name: 'Kimi', rich: '#A7B4CC', deep: '#0B0D13', turn: 22 },
].map(Object.freeze));

const UNKNOWN = Object.freeze({ id: 'unknown', name: 'Unknown', rich: '#7E7E88', deep: '#0C0C0F', turn: 0 });
const SHAPES = Object.freeze({
  openai: [0.57, 0.64, 0.30, 0.34],
  claude: [0.60, 0.56, 0.34, 0.40],
  gemini: [0.52, 0.70, 0.28, 0.32],
  deepseek: [0.62, 0.58, 0.33, 0.35],
  nvidia: [0.62, 0.64, 0.35, 0.39],
  kimi: [0.55, 0.56, 0.28, 0.30],
  unknown: [0.56, 0.50, 0.31, 0.34],
});
const WIDTH = 512;
const HEIGHT = 320;
const LUT_SIZE = 1024;
const cache = new Map();
const clamp = (v, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
const fade = v => 1 - smooth((v - 0.55) / 0.45);
const radians = degrees => degrees * Math.PI / 180;
const polar = (L, C, h) => ({ L, a: C * Math.cos(radians(h)), b: C * Math.sin(radians(h)) });
const chroma = c => Math.hypot(c.a, c.b);
const hue = c => (Math.atan2(c.b, c.a) * 180 / Math.PI + 360) % 360;

function fromHex(hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

function linear(c) {
  const l = (c.L + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3;
  const m = (c.L - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3;
  const s = (c.L - 0.0894841775 * c.a - 1.2914855480 * c.b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// Preserve OKLab lightness and hue at the sRGB boundary; reduce chroma only.
function toRGB(color) {
  const fits = rgb => rgb.every(v => v >= -0.0005 && v <= 1.0005);
  let rgb = linear(color);
  if (!fits(rgb)) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (low + high) / 2;
      const candidate = linear({ L: color.L, a: color.a * mid, b: color.b * mid });
      if (fits(candidate)) low = mid;
      else high = mid;
    }
    rgb = linear({ L: color.L, a: color.a * low, b: color.b * low });
  }
  return rgb.map(v => {
    const x = clamp(v);
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  });
}

const cssColor = color => `rgb(${toRGB(color).map(Math.round).join(' ')})`;

function palette(provider, dark) {
  const raw = fromHex(provider.rich);
  const deep = fromHex(provider.deep);
  const grey = 1 - Math.min(chroma(raw) / 0.06, 1);
  const h = hue(raw);
  const hk = angle => 0.5 - 0.5 * Math.cos(radians(angle - 100));
  const floor = 0.13 * Math.max(0, 1 - 4 * grey);
  const C = Math.max(Math.min(chroma(raw), 0.20), floor) * (1 - grey) + chroma(raw) * 1.2 * grey;
  const L = (0.705 - 0.07 * (hk(h) - 0.5)) * (1 - grey) + 0.66 * grey;
  const source = polar(provider.id === 'unknown' ? Math.min(L, 0.50) : L, C, h);
  const partnerHue = h + provider.turn;
  const partner = polar(
    (0.66 - 0.07 * (hk(partnerHue) - 0.5)) * (1 - grey) + 0.575 * grey,
    C * 1.12,
    partnerHue,
  );
  const body = polar(dark ? 0.205 : 0.165, Math.min(chroma(deep) * 0.75, 0.036), hue(deep));
  const heartC = provider.id === 'unknown' ? 0 : (0.075 + 0.032 * grey) * Math.min(grey / 0.3, 1);
  const heart = polar(0, heartC, partnerHue);
  return { body, source, partner, heart };
}

function tone(intensity, body, source, drift, heart) {
  const t = Math.max(intensity, 0);
  const hot = smooth((t - 0.55) / 0.45);
  const k = Math.min(t, 1) ** 0.68;
  const lit = polar(source.L, chroma(source), hue(source) + drift * Math.max(0, 1 - t) ** 1.5);
  let a = body.a + (lit.a - body.a) * k;
  let b = body.b + (lit.b - body.b) * k;
  const heartC = chroma(heart);
  if (heartC > 0) {
    const want = heartC * smooth((t - 0.25) / 0.40);
    if (want * want > a * a + b * b) {
      const ua = heart.a / heartC;
      const ub = heart.b / heartC;
      const along = a * ua + b * ub;
      const lift = Math.sqrt(Math.max(0, along * along - a * a - b * b + want * want)) - along;
      a += lift * ua;
      b += lift * ub;
    }
  }
  return toRGB({ L: body.L + (source.L - body.L) * t + 0.05 * hot, a, b });
}

function makeRamp(p, source, drift, heart) {
  const ink = toRGB(p.body);
  return Array.from({ length: LUT_SIZE + 1 }, (_, i) =>
    tone(i / LUT_SIZE, p.body, source, drift, heart).map((v, channel) => Math.max(v - ink[channel], 0)),
  );
}

function bake(ramp, geometry, intensity) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Keyfolio card light requires a Canvas 2D context.');
  const image = context.createImageData(WIDTH, HEIGHT);
  const data = image.data;
  const [cx, cy, rx, ry] = geometry;
  for (let y = 0; y < HEIGHT; y++) {
    const dy = ((y + 0.5) / HEIGHT - cy) / ry;
    for (let x = 0; x < WIDTH; x++) {
      const nx = (x + 0.5) / WIDTH;
      const dx = (nx - cx) / rx;
      const radius = Math.hypot(dx, dy);
      if (radius >= 1) continue;
      // A soft left-side guard keeps even a moved hover texture off the type.
      const guard = smooth((nx - 0.22) / 0.43);
      const value = clamp(intensity(radius)) * LUT_SIZE;
      const low = Math.floor(value);
      const high = Math.min(low + 1, LUT_SIZE);
      const blend = value - low;
      const rgb = ramp[low].map((v, channel) => (v + (ramp[high][channel] - v) * blend) * guard);
      const alpha = Math.max(...rgb);
      if (alpha < 0.5) continue;
      const offset = (y * WIDTH + x) * 4;
      // Alpha stores intensity; the premultiplied RGB remains the added light.
      data[offset] = Math.round(rgb[0] / alpha * 255);
      data[offset + 1] = Math.round(rgb[1] / alpha * 255);
      data[offset + 2] = Math.round(rgb[2] / alpha * 255);
      data[offset + 3] = Math.round(alpha);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Return one immutable, cached light set for an identity and appearance.
 * Unknown IDs share a quiet silver fallback. No events or animation are owned
 * here; the three full-face PNG layers can be transformed independently.
 */
export function getCardLight(id, dark = true) {
  const provider = PROVIDERS.find(item => item.id === id) || UNKNOWN;
  const isDark = Boolean(dark);
  const key = `${provider.id}:${isDark ? 'dark' : 'light'}`;
  if (cache.has(key)) return cache.get(key);
  const p = palette(provider, isDark);
  const [lobeY, lobeShare, tail, lobeWidth] = SHAPES[provider.id];
  const coreRamp = makeRamp(p, p.source, provider.turn * 0.5, p.heart);
  const lobeRamp = makeRamp(p, p.partner, 0, { a: 0, b: 0 });
  const result = Object.freeze({
    body: cssColor(p.body),
    coreUrl: bake(coreRamp, [0.85, 0.95, 0.88, 1.26], v => {
      const u = v * 1.3;
      return (1 - tail) * Math.exp(-u * u / (2 * 0.28 ** 2)) * fade(u)
        + tail * Math.exp(-v / 0.34) * fade(v);
    }),
    lobeUrl: bake(lobeRamp, [0.94, lobeY, lobeWidth, 0.80], v =>
      lobeShare * (0.62 * Math.exp(-v * v / (2 * 0.32 ** 2)) + 0.38 * Math.exp(-v / 0.30)) * fade(v)),
    spotUrl: bake(coreRamp, [0.78, 0.76, 0.46, 0.65], v => 0.22 * Math.exp(-3 * v * v) * fade(v)),
    poolColor: cssColor(isDark ? p.source : polar(0.62, Math.min(chroma(p.source), 0.18), hue(p.source))),
    partnerColor: cssColor(p.partner),
  });
  cache.set(key, result);
  return result;
}
