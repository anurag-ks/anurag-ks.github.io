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

  /* ---------- Hero: the field photo as live ASCII ---------- */
  const RAMP = ' .,:-~=+*#%@';
  const SUBJECT_RAMP = '*#%@';
  const ASCII_INK = '#14161e';
  const ASCII_ACCENT = '#f43c00';
  const BG_GAMMA = 1.0;
  const BG_WEIGHT = 0.75;
  const SWELL_AMPLITUDE = 0.07;       // a breeze rolling over the terraces
  const FRAME_MS = 50;              // idle animation runs at ~20fps
  const DECODE_MS = 1600;
  const HOVER_CELLS = 5;
  const RESIZE_DEBOUNCE_MS = 150;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const debounce = (fn, ms) => {
    let timer;
    return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  };

  function loadAsciiMap(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({ w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data });
      };
      img.onerror = () => reject(new Error(`Could not load ${src}`));
      img.src = src;
    });
  }

  /** Font size that gives roughly the target column count for the canvas width. */
  function asciiFontSize(width) {
    const targetCols = width < 420 ? 78 : width < 700 ? 112 : 132;
    return Math.max(7, Math.min(13, width / targetCols / 0.6));
  }

  async function initAscii() {
    const fig = document.querySelector('[data-ascii]');
    const canvas = fig && fig.querySelector('[data-ascii-canvas]');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;
    const sizeEl = fig.querySelector('[data-ascii-size]');
    const [focalX, focalY] = fig.dataset.focal.split(',').map(Number);

    let map;
    try {
      map = await loadAsciiMap(fig.dataset.src);
    } catch (err) {
      fig.hidden = true;            // no art is better than a broken canvas
      return;
    }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    let grid = null;                // { cols, rows, cw, ch, lum: Float32Array, sub: Uint8Array, reveal: Float32Array }
    let pointer = null;
    let start = performance.now();
    let isVisible = true;

    const build = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = asciiFontSize(w);
      ctx.font = `${size}px "Geist Mono", ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      const cw = ctx.measureText('M').width;
      const ch = size * 1.12;
      const cols = Math.ceil(w / cw), rows = Math.ceil(h / ch);

      // Cover-fit the map into the grid, keeping the subject (focal point) in view.
      const scale = Math.max(w / map.w, h / map.h);
      const ox = Math.min(0, Math.max(w - map.w * scale, w / 2 - focalX * map.w * scale));
      const oy = Math.min(0, Math.max(h - map.h * scale, h / 2 - focalY * map.h * scale));
      const lum = new Float32Array(cols * rows);
      const sub = new Uint8Array(cols * rows);
      const reveal = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const mx = Math.min(map.w - 1, Math.max(0, Math.floor(((c + 0.5) * cw - ox) / scale)));
          const my = Math.min(map.h - 1, Math.max(0, Math.floor(((r + 0.5) * ch - oy) / scale)));
          const k = (my * map.w + mx) * 4;
          const i = r * cols + c;
          lum[i] = map.data[k] / 255;
          sub[i] = map.data[k + 1] > 90 ? 1 : 0;
          reveal[i] = (c / cols) * 0.65 + Math.random() * 0.35;   // a wave of decoding, left to right
        }
      }
      grid = { cols, rows, cw, ch, lum, sub, reveal };
      sizeEl.textContent = `${cols} × ${rows} chars`;
    };

    const glyph = (i, t, decode) => {
      const { lum, sub, reveal, cols } = grid;
      if (decode < reveal[i]) return RAMP[1 + Math.floor(Math.random() * (RAMP.length - 1))];
      const dark = 1 - lum[i];
      if (sub[i]) return SUBJECT_RAMP[Math.min(3, Math.floor((0.35 + 0.65 * dark) * 4))];
      const c = i % cols, r = (i / cols) | 0;
      const swell = prefersReducedMotion ? 0 : Math.sin(c * 0.11 - r * 0.35 + t * 0.0014) * SWELL_AMPLITUDE;
      const v = clamp01(Math.pow(dark, BG_GAMMA) * BG_WEIGHT + swell * dark);
      return RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
    };

    const draw = (t) => {
      const { cols, rows, cw, ch, sub } = grid;
      const decode = prefersReducedMotion ? 1 : clamp01((t - start) / DECODE_MS) * 1.001;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const hc = pointer ? Math.floor(pointer.x / cw) : -99;
      const hr = pointer ? Math.floor(pointer.y / ch) : -99;
      for (const pass of [0, 1]) {                       // batch by colour: landscape, then subject
        ctx.fillStyle = pass ? ASCII_ACCENT : ASCII_INK;
        for (let r = 0; r < rows; r++) {
          let line = '';
          for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            const near = Math.abs(c - hc) <= HOVER_CELLS && Math.abs(r - hr) <= HOVER_CELLS / 2;
            if (sub[i] !== pass) { line += ' '; continue; }
            line += near && Math.random() < 0.6 ? RAMP[4 + Math.floor(Math.random() * 8)] : glyph(i, t, decode);
          }
          ctx.fillText(line, 0, r * ch);
        }
      }
    };

    let last = 0;
    const loop = (t) => {
      if (isVisible && !document.hidden && t - last >= FRAME_MS) { last = t; draw(t); }
      requestAnimationFrame(loop);
    };

    build();
    if (prefersReducedMotion) {
      draw(performance.now());
      window.addEventListener('resize', debounce(() => { build(); draw(performance.now()); }, RESIZE_DEBOUNCE_MS));
      return;
    }
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    canvas.addEventListener('pointerleave', () => { pointer = null; });
    window.addEventListener('resize', debounce(() => { build(); start = performance.now() - DECODE_MS; }, RESIZE_DEBOUNCE_MS));
    new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; }).observe(canvas);
    start = performance.now();
    requestAnimationFrame(loop);
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
  initAscii();
  initWordReveal();
  initWave();
  initReveal();
  initFocusRows();
})();
