(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FLOAT_NAV_OFFSET = 60;
  const WAVE_BARS = 56;

  /* ---------- Floating nav ---------- */
  function initNav() {
    const nav = document.querySelector('[data-nav]');
    if (!nav) return;
    let ticking = false;
    const update = () => {
      nav.classList.toggle('is-floating', window.scrollY > FLOAT_NAV_OFFSET);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- Hero: a machine scans the field ---------- */
  const MAP_SRC_W = 1200;          // source photo size the data map was sampled from
  const MAP_SRC_H = 1600;
  const HOVER_RADIUS = 80;
  const INK_RGB = '20, 22, 30';
  const ACCENT_RGB = '244, 60, 0';
  const CREAM_HEX = '#ece4c9';

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const ramp = (p, a, b) => clamp01((p - a) / (b - a));

  function loadFieldMap(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({ cols: c.width, rows: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data });
      };
      img.onerror = () => reject(new Error(`Could not load ${src}`));
      img.src = src;
    });
  }

  async function initField() {
    const hero = document.querySelector('[data-hero]');
    const fig = hero && hero.querySelector('[data-field]');
    const canvas = fig && fig.querySelector('[data-field-canvas]');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;

    const scanEl = fig.querySelector('[data-field-scan]');
    const pctEl = fig.querySelector('[data-field-pct]');
    const boxEl = fig.querySelector('[data-field-box]');
    const countEl = fig.querySelector('[data-field-count]');
    const box = JSON.parse(fig.dataset.box);

    let map;
    try {
      map = await loadFieldMap('assets/hero/field-map.png');
    } catch (err) {
      canvas.remove();              // the plain photo still works without the data layer
      return;
    }

    const state = { scan: 0, boxIn: 0, emph: 0 };
    let geo = null;
    let pointer = null;
    let lastKey = '';

    const layout = () => {
      const fw = canvas.clientWidth, fh = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(fw * dpr); canvas.height = Math.round(fh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scale = Math.max(fw / MAP_SRC_W, fh / MAP_SRC_H);   // matches object-fit: cover
      const ox = (fw - MAP_SRC_W * scale) / 2, oy = (fh - MAP_SRC_H * scale) / 2;
      geo = { fw, fh, scale, ox, oy, cell: (MAP_SRC_W / map.cols) * scale };
      Object.assign(boxEl.style, {
        left: `${ox + box.x * MAP_SRC_W * scale}px`, top: `${oy + box.y * MAP_SRC_H * scale}px`,
        width: `${box.w * MAP_SRC_W * scale}px`, height: `${box.h * MAP_SRC_H * scale}px`,
      });
      lastKey = '';
    };

    const draw = () => {
      const { fw, fh, ox, oy, cell } = geo;
      const scanY = state.scan * fh;
      const key = `${scanY.toFixed(1)}|${state.boxIn.toFixed(3)}|${state.emph.toFixed(3)}|${pointer ? pointer.x + ',' + pointer.y : ''}`;
      if (key === lastKey) return;
      lastKey = key;

      ctx.clearRect(0, 0, fw, fh);
      if (scanY > 0) {
        ctx.fillStyle = CREAM_HEX;
        ctx.fillRect(0, 0, fw, scanY);
      }
      const half = cell / 2;
      const inkAlpha = 1 - 0.5 * state.emph;
      let drawn = 0;
      for (let j = 0; j < map.rows; j++) {
        const cy = oy + (j + 0.5) * cell;
        if (cy > scanY || cy < -cell || cy > fh + cell) continue;
        const grow = clamp01((scanY - cy) / 36);          // dots swell in just behind the scan line
        for (let i = 0; i < map.cols; i++) {
          const cx = ox + (i + 0.5) * cell;
          if (cx < -cell || cx > fw + cell) continue;
          const k = (j * map.cols + i) * 4;
          const dark = 1 - map.data[k] / 255;
          const isPerson = map.data[k + 1] > 115;
          let r = half * (0.12 + 0.88 * Math.sqrt(dark));
          if (isPerson) r = Math.max(r, half * 0.55);
          if (pointer) {
            const d = Math.hypot(cx - pointer.x, cy - pointer.y);
            if (d < HOVER_RADIUS) r *= 1 + 0.6 * (1 - d / HOVER_RADIUS);
          }
          r = Math.min(r * grow, half * 1.05);
          if (r < 0.3) continue;
          ctx.fillStyle = isPerson ? `rgb(${ACCENT_RGB})` : `rgba(${INK_RGB}, ${inkAlpha})`;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          drawn++;
        }
      }

      const scanning = state.scan > 0 && state.scan < 1;
      scanEl.style.opacity = scanning ? '1' : '0';
      scanEl.style.setProperty('--scan-y', `${scanY}px`);
      pctEl.textContent = `Scanning ${Math.round(state.scan * 100)}%`;
      boxEl.style.opacity = String(state.boxIn);
      boxEl.style.transform = `scale(${1.08 - 0.08 * state.boxIn})`;
      countEl.textContent = `${drawn.toLocaleString('en-US')} points`;
    };

    let ticking = false;
    const update = () => {
      ticking = false;
      if (prefersReducedMotion) {
        Object.assign(state, { scan: 1, boxIn: 1, emph: 1 });
      } else {
        const rect = hero.getBoundingClientRect();
        const p = clamp01(-rect.top / (rect.height - window.innerHeight));
        state.scan = ramp(p, 0.03, 0.62);
        state.boxIn = ramp(p, 0.62, 0.74);
        state.emph = ramp(p, 0.64, 0.82);
      }
      draw();
    };
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) };
      request();
    });
    canvas.addEventListener('pointerleave', () => { pointer = null; request(); });
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', () => { layout(); request(); });
    layout();
    update();
  }

  /* ---------- Statement word reveal tied to scroll ---------- */
  function initWordReveal() {
    const blocks = [...document.querySelectorAll('[data-reveal-words]')];
    if (!blocks.length || prefersReducedMotion) return;

    const splitBlocks = blocks.map((el) => {
      const words = el.textContent.trim().split(/\s+/);
      el.setAttribute('aria-label', words.join(' '));
      el.textContent = '';
      const spans = words.map((w, i) => {
        const span = document.createElement('span');
        span.className = 'word';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = w;
        el.appendChild(span);
        if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
        return span;
      });
      return { el, spans };
    });

    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      for (const { el, spans } of splitBlocks) {
        const rect = el.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, (vh * 0.85 - rect.top) / (vh * 0.55)));
        const lit = Math.round(progress * spans.length);
        spans.forEach((s, i) => s.classList.toggle('is-lit', i < lit));
      }
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- Waveform viz ---------- */
  function initWave() {
    const svg = document.querySelector('[data-wave]');
    if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg';
    const width = 600, mid = 180, gap = 10, start = (width - WAVE_BARS * gap) / 2;
    for (let i = 0; i < WAVE_BARS; i++) {
      const env = Math.sin((i / WAVE_BARS) * Math.PI);
      const h = Math.max(6, env * (40 + 90 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31))));
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(start + i * gap));
      rect.setAttribute('y', String(mid - h / 2));
      rect.setAttribute('width', '4');
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '2');
      if (i > WAVE_BARS * 0.55 && i < WAVE_BARS * 0.8) rect.setAttribute('class', 'is-accent');
      svg.appendChild(rect);
    }
  }

  /* ---------- Generic reveal on intersect ---------- */
  function initReveal() {
    const targets = document.querySelectorAll('[data-rise], .case');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.2 });
    targets.forEach((el) => io.observe(el));
  }

  /* ---------- Focus rows: highlight the row nearest viewport centre ---------- */
  function initFocusRows() {
    const rows = [...document.querySelectorAll('.focus__row')];
    if (!rows.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-active', entry.isIntersecting));
    }, { rootMargin: '-45% 0px -45% 0px' });
    rows.forEach((row) => io.observe(row));
  }

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  initNav();
  initField();
  initWordReveal();
  initWave();
  initReveal();
  initFocusRows();
})();
