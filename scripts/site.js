(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FLOAT_NAV_OFFSET = 60;
  const ORB_DOT_ROWS = 22;
  const ORB_DOT_COLS = 44;
  const ORB_SPIN_SPEED = 0.00012;
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

  /* ---------- Hero orb: dotted globe with a warm glow ---------- */
  function initOrb() {
    const canvas = document.querySelector('[data-orb]');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;

    const points = [];
    for (let i = 1; i < ORB_DOT_ROWS; i++) {
      const lat = (i / ORB_DOT_ROWS) * Math.PI - Math.PI / 2;
      const cols = Math.max(6, Math.round(ORB_DOT_COLS * Math.cos(lat)));
      for (let j = 0; j < cols; j++) points.push({ lat, lon: (j / cols) * Math.PI * 2 });
    }

    let size = 0;
    let pointer = { x: 0, y: 0 };
    let isVisible = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t) => {
      const c = size / 2;
      const r = size * 0.42;
      ctx.clearRect(0, 0, size, size);

      const glow = ctx.createRadialGradient(c + pointer.x * 20, c + pointer.y * 20, 0, c, c, r * 1.05);
      glow.addColorStop(0, 'rgba(255, 214, 10, 0.95)');
      glow.addColorStop(0.28, 'rgba(255, 140, 0, 0.85)');
      glow.addColorStop(0.62, 'rgba(244, 60, 0, 0.35)');
      glow.addColorStop(1, 'rgba(244, 60, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(c, c, r * 1.05, 0, Math.PI * 2); ctx.fill();

      const spin = t * ORB_SPIN_SPEED + pointer.x * 0.4;
      const tilt = -0.35 + pointer.y * 0.2;
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

      for (const p of points) {
        const lon = p.lon + spin;
        const x = Math.cos(p.lat) * Math.sin(lon);
        const y0 = Math.sin(p.lat);
        const z0 = Math.cos(p.lat) * Math.cos(lon);
        const y = y0 * cosT - z0 * sinT;
        const z = y0 * sinT + z0 * cosT;
        const depth = (z + 1) / 2;
        ctx.globalAlpha = 0.12 + depth * 0.78;
        ctx.fillStyle = '#0f0f10';
        ctx.beginPath();
        ctx.arc(c + x * r, c + y * r, 0.6 + depth * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t) => {
      if (isVisible) draw(t);
      requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);

    if (prefersReducedMotion) { draw(0); return; }

    window.addEventListener('pointermove', (e) => {
      pointer = { x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 };
    }, { passive: true });
    new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; }).observe(canvas);
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
  initOrb();
  initWordReveal();
  initWave();
  initReveal();
  initFocusRows();
})();
