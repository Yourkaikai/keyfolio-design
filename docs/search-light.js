import { PROVIDERS } from './light.js';

// DeskHalo / FieldRim, adapted from ApiKeyManager.swift. These small, cached
// textures are drawn once per light and appearance; interaction only changes
// their opacity and transform. The rim keeps its round caps at narrow widths.
const FIELD_HEIGHT = 38;
const RIM_REACH = 42;
const RIM_CAP = FIELD_HEIGHT / 2 + RIM_REACH;
const textureCache = new Map();
const mounted = new WeakMap();
const byId = new Map(PROVIDERS.map(provider => [provider.id, provider]));
const aliases = {
  openai: 'chatgpt gpt', claude: 'anthropic 克劳德', gemini: 'google 谷歌',
  deepseek: '深度求索', nvidia: 'nim 英伟达', kimi: 'moonshot 月之暗面',
};
let instanceCount = 0;

const clamp = (value, low = 0, high = 1) => Math.min(Math.max(value, low), high);
const smooth = (low, high, value) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};
const unit = (a, b) => {
  const length = Math.hypot(a, b);
  return length > 0.0001 ? [a / length, b / length] : [0, -1];
};
const mix = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * amount);

function fromHex(hex) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function linearRGB([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function toRGB(color) {
  const fits = values => values.every(value => value >= -0.0005 && value <= 1.0005);
  let rgb = linearRGB(color);
  if (!fits(rgb)) {
    let low = 0;
    let high = 1;
    for (let index = 0; index < 16; index++) {
      const amount = (low + high) / 2;
      const candidate = linearRGB([color[0], color[1] * amount, color[2] * amount]);
      if (fits(candidate)) low = amount;
      else high = amount;
    }
    rgb = linearRGB([color[0], color[1] * low, color[2] * low]);
  }
  return rgb.map(value => {
    const channel = clamp(value);
    return Math.round(255 * (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055));
  });
}

function makeLook(providerId, dark) {
  const provider = byId.get(providerId);
  let hue = unit(dark ? 0.004 : 0.0003, dark ? -0.019 : -0.0012);
  let tailHue = hue;
  let share = 1;
  let cap = 0.13;
  if (provider) {
    const raw = fromHex(provider.rich);
    const chroma = Math.hypot(raw[1], raw[2]);
    const grey = 1 - Math.min(chroma / 0.06, 1);
    const sourceChroma = Math.max(Math.min(chroma, 0.20), 0.13 * Math.max(0, 1 - 4 * grey)) * (1 - grey) + chroma * 1.2 * grey;
    const angle = Math.atan2(raw[2], raw[1]);
    const partnerAngle = angle + provider.turn * Math.PI / 180;
    // As in the card palette, silver keeps a tinted heart instead of losing
    // its identity in a white glow. DeskTint's native gain solver is omitted.
    const heart = (0.075 + 0.032 * grey) * Math.min(grey / 0.3, 1);
    hue = unit(Math.cos(angle) * sourceChroma + Math.cos(partnerAngle) * heart,
      Math.sin(angle) * sourceChroma + Math.sin(partnerAngle) * heart);
    const partnerHue = [Math.cos(partnerAngle), Math.sin(partnerAngle)];
    tailHue = unit(...mix(hue, partnerHue, 0.85));
    share = 1 - 0.2 * grey;
    cap = Math.max(0.65 * Math.max(sourceChroma, heart), 0.07 * Math.min(grey / 0.3, 1));
  }
  const tone = (L, chroma, direction = hue) => [L, direction[0] * chroma, direction[1] * chroma];
  const poolChroma = provider ? (dark ? Math.min(0.13, cap) * share : 0.08 * share) : (dark ? 0.10 : 0.018);
  return {
    pool: tone(dark ? 0.56 : 0.78, poolChroma),
    poolAlpha: (dark ? (provider ? 0.74 : 0.72) : 0.34) * 0.55,
    heart: tone(dark ? 0.76 : 0.82, provider ? Math.min(0.13 * share, cap) : (dark ? 0.035 : 0.07)),
    glow: tone(dark ? 0.60 : 0.76, provider ? Math.min(0.18 * share, cap * 1.1) : (dark ? 0.085 : 0.10)),
    tail: tone(dark ? 0.46 : 0.74, provider ? Math.min(0.12 * share, cap) : (dark ? 0.07 : 0.08), tailHue),
    rimAlpha: dark ? 1 : 0.55,
  };
}

function bakeTexture(width, height, sample) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [rgb, alpha] = sample(x + 0.5, y + 0.5);
      const offset = (y * width + x) * 4;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
      image.data[offset + 3] = Math.round(clamp(alpha) * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function lightTextures(providerId, dark) {
  const key = `${providerId || 'lamp'}:${dark ? 'dark' : 'light'}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const look = makeLook(providerId, dark);
  const poolColor = toRGB(look.pool);
  const pool = bakeTexture(256, 256, (x, y) => {
    const radius = Math.hypot((x / 256 - 0.5) * 2, (y / 256 - 0.5) * 2);
    const profile = radius < 1 ? Math.exp(-radius * radius / (2 * 0.30 ** 2)) * (1 - smooth(0.7, 1, radius)) : 0;
    return [poolColor, look.poolAlpha * profile];
  });
  // Native FieldRim's signed-distance profile, sampled to a 1x sprite. The
  // central two pixels repeat; each 61px cap preserves its shape at any width.
  const width = RIM_CAP * 2 + 2;
  const height = RIM_CAP * 2;
  const rim = bakeTexture(width, height, (x, y) => {
    const qx = Math.max(Math.abs(x - width / 2) - 1, 0);
    const distance = Math.hypot(qx, y - height / 2) - FIELD_HEIGHT / 2;
    const square = distance * distance;
    const intensity = distance < 0
      ? 0.64 * Math.exp(-square / (2 * (2.2 * 0.55) ** 2)) + 0.10 * Math.exp(-square / (2 * 4.5 ** 2))
      : (0.34 * Math.exp(-square / (2 * 2.2 ** 2)) + 0.40 * Math.exp(-square / (2 * 17 ** 2))) * (1 - smooth(RIM_REACH * 0.6, RIM_REACH, distance));
    const u = clamp(distance / RIM_REACH);
    const color = mix(mix(look.heart, look.glow, smooth(0, 0.30, u)), look.tail, smooth(0.25, 0.9, u));
    return [toRGB(color), look.rimAlpha * intensity];
  });
  const middle = document.createElement('canvas');
  middle.width = 2;
  middle.height = height;
  const context = middle.getContext('2d');
  if (rim && context) context.drawImage(rim, RIM_CAP, 0, 2, height, 0, 0, 2, height);
  const result = pool && rim && context ? {
    pool: pool.toDataURL('image/png'),
    rim: rim.toDataURL('image/png'),
    middle: middle.toDataURL('image/png'),
  } : null;
  textureCache.set(key, result);
  return result;
}

const rimMarkup = () => '<span class="search-light-rim-cap search-light-rim-cap-start"></span><span class="search-light-rim-middle"></span><span class="search-light-rim-cap search-light-rim-cap-end"></span>';
const icon = path => `<svg class="search-light-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

/**
 * Mount an independent, real search field. Call setEnvironment whenever the
 * page's theme, effective ambient provider, or motion preference changes.
 * Repeating the same provider preserves a manual light; a changed one follows
 * the room again. This specimen filters local labels and makes no requests.
 */
export function mountSearchLight(host) {
  if (mounted.has(host)) return mounted.get(host);
  const id = `search-light-${++instanceCount}`;
  const root = document.createElement('div');
  root.className = 'search-light-specimen';
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘F' : 'Ctrl F';
  root.innerHTML = `
    <div class="search-light-toolbar">
      <span class="search-light-eyebrow">输入标本 <span class="search-light-dimensions">420 × 38</span></span>
      <span class="search-light-source">跟随桌面 · 桌灯</span>
    </div>
    <div class="search-light-stage">
      <p class="search-light-invitation">让光停在边缘，让文字留在清晰处。</p>
      <div class="search-light-field-wrap">
        <div class="search-light-pool-strength" aria-hidden="true"><div class="search-light-pool-breath"></div></div>
        <div class="search-light-rim-strength" aria-hidden="true"><div class="search-light-rim-breath">${rimMarkup()}</div></div>
        <div class="search-light-rim-ignite" aria-hidden="true">${rimMarkup()}</div>
        <div class="search-light-field">
          ${icon('<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.3 15.3 4.5 4.5"/>')}
          <label class="search-light-sr-only" for="${id}-input">筛选本页厂商标本</label>
          <input class="search-light-input" id="${id}-input" type="search" placeholder="搜索厂商、名称…" autocomplete="off" spellcheck="false" aria-describedby="${id}-hint" aria-controls="${id}-results">
          <kbd class="search-light-shortcut" aria-hidden="true">${shortcut}</kbd>
          <button class="search-light-clear" type="button" aria-label="清除搜索" title="清除搜索 (Esc)" hidden>${icon('<path d="m7 7 10 10M7 17 17 7"/>')}</button>
        </div>
      </div>
      <div class="search-light-results">
        <div class="search-light-results-heading"><span>本页厂商标本</span><span class="search-light-result-count" role="status" aria-live="polite" aria-atomic="true">6 个厂商</span></div>
        <ul class="search-light-result-list" id="${id}-results">${PROVIDERS.map(provider => `<li class="search-light-result" data-result="${provider.id}"><i class="search-light-result-dot" style="--search-light-swatch:${provider.rich}" aria-hidden="true"></i><span>${provider.name}</span></li>`).join('')}</ul>
        <p class="search-light-empty" hidden>没有匹配的厂商，换个名称试试。</p>
      </div>
      <p class="search-light-state" id="${id}-hint">点击输入，或按 ${shortcut}，看看光的回应。</p>
    </div>
    <div class="search-light-palette">
      <div class="search-light-palette-heading"><span>换一束光</span><button class="search-light-follow" type="button" aria-pressed="true">跟随桌面 <span aria-hidden="true">↗</span></button></div>
      <div class="search-light-swatches" role="group" aria-label="独立试看搜索框的灯色">
        <button class="search-light-swatch" type="button" data-light="lamp" aria-label="试看桌灯光色" aria-pressed="false" title="桌灯"><i style="--search-light-swatch:#8a8fb8" aria-hidden="true"></i><span>桌灯</span></button>
        ${PROVIDERS.map(provider => `<button class="search-light-swatch" type="button" data-light="${provider.id}" aria-label="试看 ${provider.name} 光色" aria-pressed="false" title="${provider.name}"><i style="--search-light-swatch:${provider.rich}" aria-hidden="true"></i><span>${provider.name.replace(' NIM', '')}</span></button>`).join('')}
      </div>
    </div>
    <div class="search-light-anatomy" aria-label="搜索框的三层回应">
      <p><span class="search-light-diagram search-light-diagram-pool" aria-hidden="true"></span><span><strong>宽光池</strong><small>向四周散开，留出呼吸的空间。</small></span></p>
      <p><span class="search-light-diagram search-light-diagram-rim" aria-hidden="true"></span><span><strong>边缘微光</strong><small>沿胶囊聚拢，不遮住中间的文字。</small></span></p>
      <p><span class="search-light-diagram search-light-diagram-focus" aria-hidden="true"></span><span><strong>聚焦回应</strong><small>输入时增强，失焦后轻轻退回。</small></span></p>
    </div>`;
  host.append(root);

  const $ = selector => root.querySelector(selector);
  const input = $('.search-light-input');
  const field = $('.search-light-field');
  const fieldWrap = $('.search-light-field-wrap');
  const clear = $('.search-light-clear');
  const hint = $('.search-light-state');
  const follow = $('.search-light-follow');
  const source = $('.search-light-source');
  const swatches = [...root.querySelectorAll('.search-light-swatch')];
  const results = [...root.querySelectorAll('.search-light-result')];
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let environment = { theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', providerId: null, motionEnabled: true };
  let manualLight;
  let focused = false;
  let hovered = false;

  function updateState() {
    const motion = environment.motionEnabled && !motionQuery.matches;
    root.dataset.motion = motion ? 'on' : 'off';
    root.dataset.visible = document.hidden ? 'false' : 'true';
    fieldWrap.classList.toggle('search-light-is-focused', focused);
    fieldWrap.classList.toggle('search-light-has-value', input.value.length > 0);
    if (!motion || document.hidden) fieldWrap.classList.remove('search-light-igniting');
    hint.textContent = focused
      ? (motion ? '正在聚焦 · 光池与边缘轻轻呼吸。' : '正在聚焦 · 保留清楚的静态微光。')
      : hovered ? '轻轻靠近 · 点击输入，让光再亮一点。'
        : input.value ? '筛选已保留 · 按 Esc 清空，再按一次收起焦点。'
          : `点击输入，或按 ${shortcut}，看看光的回应。`;
  }

  function updateResults() {
    const query = input.value.trim().toLocaleLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    let count = 0;
    for (const result of results) {
      const provider = byId.get(result.dataset.result);
      const searchable = `${provider.id} ${provider.name} ${aliases[provider.id] || ''}`.toLocaleLowerCase();
      result.hidden = !words.every(word => searchable.includes(word));
      if (!result.hidden) count++;
    }
    $('.search-light-result-count').textContent = query ? `找到 ${count} 个厂商` : `${PROVIDERS.length} 个厂商`;
    $('.search-light-result-list').hidden = count === 0;
    $('.search-light-empty').hidden = count !== 0;
    clear.hidden = input.value.length === 0;
    $('.search-light-shortcut').hidden = input.value.length > 0;
    updateState();
  }

  function updateLight() {
    const providerId = manualLight === undefined ? environment.providerId : manualLight;
    const provider = byId.get(providerId);
    root.dataset.theme = environment.theme;
    root.dataset.light = providerId || 'lamp';
    const textures = lightTextures(providerId, environment.theme === 'dark');
    // Leave the neutral pill fully usable when Canvas is unavailable.
    root.dataset.textures = textures ? 'ready' : 'unavailable';
    if (textures) {
      root.style.setProperty('--search-light-pool-image', `url("${textures.pool}")`);
      root.style.setProperty('--search-light-rim-image', `url("${textures.rim}")`);
      root.style.setProperty('--search-light-rim-middle-image', `url("${textures.middle}")`);
    }
    root.style.setProperty('--search-light-color', provider?.rich || '#8a8fb8');
    source.textContent = `${manualLight === undefined ? '跟随桌面' : '独立试看'} · ${provider?.name || '桌灯'}`;
    follow.setAttribute('aria-pressed', String(manualLight === undefined));
    for (const swatch of swatches) {
      swatch.setAttribute('aria-pressed', String(manualLight !== undefined && swatch.dataset.light === (providerId || 'lamp')));
    }
  }

  function keepInputFocus(event) {
    // Only these light controls preserve an existing editing session. Keyboard
    // users still tab to and activate each native button normally.
    if (event.button === 0 && document.activeElement === input) event.preventDefault();
  }

  for (const swatch of swatches) {
    swatch.addEventListener('pointerdown', keepInputFocus);
    swatch.addEventListener('click', () => {
      manualLight = swatch.dataset.light === 'lamp' ? null : swatch.dataset.light;
      updateLight();
    });
  }
  follow.addEventListener('pointerdown', keepInputFocus);
  follow.addEventListener('click', () => { manualLight = undefined; updateLight(); });
  field.addEventListener('click', event => {
    if (!event.target.closest('button')) input.focus({ preventScroll: true });
  });
  field.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    updateState();
  });
  field.addEventListener('pointerleave', () => { hovered = false; updateState(); });
  input.addEventListener('input', updateResults);
  input.addEventListener('search', updateResults);
  input.addEventListener('focus', () => {
    focused = true;
    updateState();
    if (root.dataset.motion === 'on' && !document.hidden) fieldWrap.classList.add('search-light-igniting');
  });
  input.addEventListener('blur', () => {
    focused = false;
    fieldWrap.classList.remove('search-light-igniting');
    updateState();
  });
  fieldWrap.addEventListener('animationend', event => {
    if (event.animationName === 'search-light-ignite') fieldWrap.classList.remove('search-light-igniting');
  });
  clear.addEventListener('click', () => {
    input.value = '';
    updateResults();
    input.focus({ preventScroll: true });
  });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (input.value) {
      input.value = '';
      updateResults();
    } else input.blur();
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f' || !root.isConnected) return;
    // Use composedPath to respect inputs and editors nested in a shadow root.
    const target = event.composedPath()[0];
    if (target !== input && (target?.isContentEditable || target?.closest?.('input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])'))) return;
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
    event.preventDefault();
    input.focus({ preventScroll: false });
    input.select();
  });
  document.addEventListener('visibilitychange', updateState);
  motionQuery.addEventListener('change', updateState);

  const api = {
    setEnvironment(next = {}) {
      const providerId = Object.hasOwn(next, 'providerId') ? (byId.has(next.providerId) ? next.providerId : null) : environment.providerId;
      if (providerId !== environment.providerId) manualLight = undefined;
      environment = {
        theme: Object.hasOwn(next, 'theme') ? (next.theme === 'light' ? 'light' : 'dark') : environment.theme,
        providerId,
        motionEnabled: Object.hasOwn(next, 'motionEnabled') ? Boolean(next.motionEnabled) : environment.motionEnabled,
      };
      updateLight();
      updateState();
    },
  };
  mounted.set(host, api);
  updateLight();
  updateResults();
  return api;
}
