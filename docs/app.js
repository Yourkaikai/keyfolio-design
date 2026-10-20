import { PROVIDERS, getCardLight } from './light.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const root = document.documentElement;
const memoryStore = new Map();
const storage = {
  get(key, fallback) { if (memoryStore.has(key)) return memoryStore.get(key); try { return localStorage.getItem(`kf-showcase-${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { memoryStore.set(key, value); try { localStorage.setItem(`kf-showcase-${key}`, value); return true; } catch { return false; } },
};
let theme = storage.get('theme', 'dark') === 'light' ? 'light' : 'dark';
let selected = null;
let hovered = null;
let hoverTimer;
let pointerOwner = null;
let toastTimer;
let ambientTarget = '';
let scrollQuietUntil = 0;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let motionPreference = storage.get('motion', 'on') !== 'off';
const isMoving = () => motionPreference && !motionQuery.matches;
const byId = new Map(PROVIDERS.map((p) => [p.id, p]));
const samples = {
  openai: { head: 'SK–19FA', tail: '7F2A', latency: 126, pinned: true },
  claude: { head: 'SK–72C8', tail: '8D31', latency: 183, pinned: true },
  gemini: { head: 'AI–4B92', tail: 'C4F6', latency: 94 },
  deepseek: { head: 'SK–A3D1', tail: 'B3E5', latency: 68 },
  nvidia: { head: 'NV–6E10', tail: '2D90', latency: 142 },
  kimi: { head: 'SK–82F4', tail: '9E17', latency: 85 },
};
const paths = {
  moon: '<path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5 8.5 8.5 0 1 0 20.5 13.2Z"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  star: '<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z"/>',
};
const icon = (name) => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${paths[name] ?? ''}</svg>`;

function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2200);
}

async function copyText(value, message, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement('textarea');
      input.value = value;
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      button?.focus({ preventScroll: true });
      if (!copied) throw new Error('Clipboard unavailable');
    }
    showToast(message);
    if (button?.classList.contains('copy-button')) {
      button.classList.add('copied');
      $('.copy-icon', button).innerHTML = icon('check');
      clearTimeout(button.copyTimer);
      button.copyTimer = setTimeout(() => {
        button.classList.remove('copied');
        $('.copy-icon', button).innerHTML = icon('copy');
      }, 1500);
    }
  } catch {
    showToast('浏览器未允许复制，请重试');
  }
}

function createCards() {
  $('#card-grid').innerHTML = PROVIDERS.map((p, i) => {
    const s = samples[p.id];
    return `<article class="card" data-provider="${p.id}" style="--arrival:${480 + i * 70}ms;--breath:${5.4 + i * .63}s;--phase:${-i * 1.21}s">
      <div class="pool" aria-hidden="true"></div><div class="card-plane" aria-hidden="true"><div class="card-core"></div><div class="card-lobe"></div><div class="card-spot"></div></div>
      <div class="card-content"><div class="card-top"><img class="provider-glyph" src="./assets/providers/${p.id}.svg" alt="">${s.pinned ? `<span class="pinned-star">${icon('star')}</span>` : ''}</div><div class="card-bottom"><h3 class="card-name">${p.name}</h3><div class="key-line"><span>${s.head}</span><span class="key-dots">•••• ••••</span><span>${s.tail}</span></div><div class="card-status"><i class="status-dot"></i><span class="mono">${s.latency} ms</span></div></div></div>
      <button class="card-select" aria-label="选择 ${p.name}，查看光色" aria-pressed="false"></button><button class="copy-button" aria-label="复制 ${p.name} 演示标识"><span class="copy-icon">${icon('copy')}</span><span class="copy-feedback" aria-hidden="true">已复制</span></button>
    </article>`;
  }).join('');

  $$('.card').forEach((card) => {
    const id = card.dataset.provider;
    let pointerSample = null;
    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      pointerOwner = id;
      card.classList.add('is-hovered');
      pointerSample = { x: event.clientX, y: event.clientY, time: performance.now() };
      armHover(id, 140);
    });
    card.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      if (pointerSample && now - pointerSample.time > 8) {
        const dt = (now - pointerSample.time) / 1000;
        const speed = Math.hypot(event.clientX - pointerSample.x, event.clientY - pointerSample.y) / dt;
        if (speed > 650 && hovered !== id) armHover(id, 140);
        else if (hovered !== id && !hoverTimer && now >= scrollQuietUntil) armHover(id, 90);
        pointerSample = { x: event.clientX, y: event.clientY, time: now };
      }
      if (!isMoving()) return;
      const rect = card.getBoundingClientRect();
      const dx = Math.max(-10, Math.min(10, (event.clientX - rect.left - rect.width * .65) / rect.width * 24));
      const dy = Math.max(-8, Math.min(8, (event.clientY - rect.top - rect.height * .65) / rect.height * 18));
      card.style.setProperty('--mx', `${dx}px`);
      card.style.setProperty('--my', `${dy}px`);
    });
    card.addEventListener('pointerleave', () => {
      clearHoverTimer();
      if (pointerOwner === id) pointerOwner = null;
      card.classList.remove('is-hovered');
      card.style.setProperty('--mx', '0px');
      card.style.setProperty('--my', '0px');
      if (hovered === id) { hovered = null; updateAmbient(); }
      pointerSample = null;
    });
    $('.card-select', card).addEventListener('click', () => selectProvider(selected === id ? null : id));
    $('.copy-button', card).addEventListener('click', (event) => copyText(`KEYFOLIO-DEMO-${id.toUpperCase()}-NOT-A-REAL-KEY`, '演示标识已复制', event.currentTarget));
  });
}

function clearHoverTimer() { clearTimeout(hoverTimer); hoverTimer = undefined; }

function armHover(id, wait) {
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    hoverTimer = undefined;
    if (pointerOwner !== id || performance.now() < scrollQuietUntil) return;
    hovered = id;
    updateAmbient();
  }, wait);
}

function applyLights() {
  $$('.card').forEach((card) => {
    const light = getCardLight(card.dataset.provider, theme === 'dark');
    card.style.setProperty('--card-body', light.body);
    card.style.setProperty('--pool', light.poolColor);
    $('.card-core', card).style.backgroundImage = `url("${light.coreUrl}")`;
    $('.card-lobe', card).style.backgroundImage = `url("${light.lobeUrl}")`;
    $('.card-spot', card).style.backgroundImage = `url("${light.spotUrl}")`;
  });
}

function updateAmbient(force = false) {
  const id = hovered ?? selected;
  const provider = byId.get(id);
  const committed = !!provider && (id === selected);
  const target = `${theme}:${id ?? 'rest'}:${committed}`;
  if (target === ambientTarget && !force) return;
  ambientTarget = target;
  $('#ambient-label').textContent = provider ? `${provider.name} · ${committed ? '已选中' : '预览中'}` : '桌灯';
  $('#ambient-dot').style.background = provider ? provider.rich : '';
  const host = $('#room-color');
  if (!provider) { host.style.opacity = '0'; return; }
  const layer = document.createElement('div');
  layer.style.cssText = `position:absolute;inset:0;opacity:0;transition:opacity 550ms cubic-bezier(.2,0,0,1);background:radial-gradient(ellipse 90% 85% at 55% -20%,${provider.rich},transparent 78%)`;
  host.style.background = 'none';
  host.style.opacity = theme === 'dark' ? (committed ? '.20' : '.12') : (committed ? '.065' : '.04');
  const oldLayers = [...host.children];
  host.append(layer);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    layer.style.opacity = '1';
    oldLayers.forEach((old) => old.style.opacity = '0');
  }));
  setTimeout(() => oldLayers.forEach((old) => old.remove()), 580);
}

function selectProvider(id, { restoreFocus = false } = {}) {
  const previous = selected;
  selected = id;
  $$('.card').forEach((card) => {
    const on = card.dataset.provider === id;
    card.classList.toggle('selected', on);
    $('.card-select', card).setAttribute('aria-pressed', String(on));
  });
  $('#deck-layout').classList.toggle('with-inspector', !!id);
  $('#inspector').hidden = !id;
  const narrow = matchMedia('(max-width: 600px)').matches;
  if (id) {
    renderInspector();
    if (narrow) $('#inspector').scrollIntoView({ block: 'start', behavior: isMoving() ? 'smooth' : 'auto' });
  }
  updateAmbient();
  if (restoreFocus && previous) $(`[data-provider="${previous}"] .card-select`)?.focus({ preventScroll: !narrow });
}

function renderInspector() {
  const p = byId.get(selected);
  if (!p) return;
  const light = getCardLight(p.id, theme === 'dark');
  $('#inspector').style.setProperty('--inspector-tint', p.rich);
  $('#inspector').innerHTML = `<div class="inspector-header"><span>物件的光色</span><button class="inspector-close" aria-label="关闭卡片详情">${icon('close')}</button></div><img class="provider-glyph" src="./assets/providers/${p.id}.svg" alt=""><h3>${p.name}</h3><p class="inspector-subtitle">光从身份而来，也回到它的空间。</p><div class="inspector-colors"><div class="inspector-color"><i style="background:${p.rich}"></i><span>${p.rich}</span></div><div class="inspector-color"><i style="background:${light.partnerColor}"></i><span>副光 ${p.turn > 0 ? '+' : ''}${p.turn}°</span></div><div class="inspector-color"><i style="background:${light.body}"></i><span>深色字底</span></div></div><dl><div><dt>卡面</dt><dd>深墨 · 局部受光</dd></div><div><dt>边界</dt><dd>18 px · 细线与投影</dd></div><div><dt>文字</dt><dd>白字 · 暗面留白</dd></div><div><dt>交互</dt><dd>悬停预览 · 点击留光</dd></div></dl><button class="button primary inspector-copy">复制身份色 ${icon('copy')}</button><p class="inspector-note">按 Esc 或点击关闭可回到桌面。<br>这里展示的是设计色彩，不连接任何厂商服务。</p>`;
  $('.inspector-close').addEventListener('click', () => selectProvider(null, { restoreFocus: true }));
  $('.inspector-copy').addEventListener('click', (event) => copyText(p.rich, `${p.name} 身份色已复制`, event.currentTarget));
}

function renderSwatches() {
  const swatches = theme === 'dark'
    ? [['桌面','#0C0C0F'], ['表面','#1B1B1F'], ['边界','#2E2E36'], ['次文字','#A2A2AB'], ['主文字','#FFFFFF']]
    : [['桌面','#F1F1F3'], ['表面','#FFFFFF'], ['边界','#DFDFE4'], ['次文字','#56565E'], ['主文字','#141416']];
  $('#color-swatches').innerHTML = swatches.map(([name, hex]) => `<button class="color-swatch" aria-label="复制${name}色值 ${hex}" data-color="${hex}"><i class="swatch-surface" style="background:${hex}"></i><span class="swatch-name">${name}</span><span class="swatch-hex">${hex}</span></button>`).join('');
  $$('.color-swatch').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.color, `${button.dataset.color} 已复制`, button)));
}

function applyTheme() {
  root.dataset.theme = theme;
  $('meta[name=theme-color]').content = theme === 'dark' ? '#111114' : '#f1f1f3';
  $('#theme-label').textContent = theme === 'dark' ? '夜间' : '日间';
  $('#theme-icon').innerHTML = icon(theme === 'dark' ? 'moon' : 'sun');
  $('#theme-toggle').setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
  applyLights();
  renderSwatches();
  if (selected) renderInspector();
  updateAmbient(true);
}

function applyMotion() {
  root.classList.toggle('motion-off', !isMoving());
  const button = $('#motion-toggle');
  button.setAttribute('aria-checked', String(isMoving()));
  button.disabled = motionQuery.matches;
  $('#motion-note').textContent = motionQuery.matches ? '系统已开启减少动态效果' : motionPreference ? '让物件保留一点生命感' : '保留静态光色，暂停呼吸与微光';
}

function saveName() {
  const name = $('#sample-name').value.trim();
  if (!name) { $('#name-feedback').textContent = '先为这张卡片取个名字。'; $('#sample-name').focus(); return; }
  const persisted = storage.set('sample-name', name);
  $('#saved-name').textContent = name;
  $('#name-feedback').textContent = persisted ? `已保存「${name}」` : '名称已更新；此浏览器仅在当前页面保留。';
  showToast(persisted ? '名称已保存' : '名称已更新，暂存于当前页面');
}

createCards();
$('#identity-strip').innerHTML = PROVIDERS.map((p) => `<span class="identity-color" title="${p.name} · ${p.rich}" style="background:${p.rich}"></span>`).join('');
const savedName = storage.get('sample-name', '日常创作');
$('#sample-name').value = savedName;
$('#saved-name').textContent = savedName;
applyTheme();
applyMotion();
$('#theme-toggle').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; storage.set('theme', theme); applyTheme(); });
$('#reset-light').addEventListener('click', () => { clearHoverTimer(); hovered = null; selectProvider(null); });
$('#save-sample').addEventListener('click', saveName);
$('#sample-name').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) saveName(); });
$('#sample-name').addEventListener('input', () => { $('#name-feedback').textContent = '输入完成后，保存到这张卡片。'; });
$('#cancel-sample').addEventListener('click', () => { $('#sample-name').value = storage.get('sample-name', '日常创作'); $('#name-feedback').textContent = '已恢复到上次保存的名称。'; });
$('#motion-toggle').addEventListener('click', () => { motionPreference = !motionPreference; storage.set('motion', motionPreference ? 'on' : 'off'); applyMotion(); });
motionQuery.addEventListener('change', applyMotion);
document.addEventListener('visibilitychange', () => root.classList.toggle('page-hidden', document.hidden));
window.addEventListener('scroll', () => { scrollQuietUntil = performance.now() + 200; clearHoverTimer(); if (hovered) { hovered = null; updateAmbient(); } }, { passive: true });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected) selectProvider(null, { restoreFocus: true }); });
$$('.state-chip').forEach((button) => button.addEventListener('click', () => {
  $$('.state-chip').forEach((other) => { const on = other === button; other.classList.toggle('active', on); other.setAttribute('aria-pressed', String(on)); });
  const state = button.dataset.state;
  $('#row-status').className = `row-status ${state}`;
  $('#row-status').innerHTML = `<i class="status-dot"></i>${{ ready: '已就绪', loading: '验证中', error: '网络异常' }[state]}`;
}));
