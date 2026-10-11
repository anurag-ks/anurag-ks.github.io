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

  /* ---------- Hero: turn, ignite, dive into the lenses ---------- */
  const LENS_X = 0.4997;           // lens centre of pose-3, as a fraction of the frame
  const LENS_Y = 0.2383;
  const MAX_ZOOM = 22;

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const ramp = (p, a, b) => {      // smoothstep between a and b
    const t = clamp01((p - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  function initHero() {
    const hero = document.querySelector('[data-hero]');
    const figure = hero && hero.querySelector('[data-hero-figure]');
    if (!figure || prefersReducedMotion) return;

    const layer = (sel) => figure.querySelector(sel);
    const pose1 = layer('[data-pose="1"]');
    const pose2 = layer('[data-pose="2"]');
    const glow2 = layer('[data-glow="2"]');
    const pose3 = layer('[data-pose="3"]');
    const glow3 = layer('[data-glow="3"]');
    const flash = hero.querySelector('[data-hero-flash]');
    const fades = [...hero.querySelectorAll('[data-hero-fade]')];
    figure.style.setProperty('--lens-x', `${LENS_X * 100}%`);
    figure.style.setProperty('--lens-y', `${LENS_Y * 100}%`);

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = hero.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp01(-rect.top / (rect.height - vh));

      const turn1 = ramp(p, 0.1, 0.26);
      const turn2 = ramp(p, 0.3, 0.44);
      // Each new pose fades in on top; the one beneath stays solid until it is covered.
      pose1.style.opacity = turn1 < 1 ? '1' : '0';
      pose2.style.opacity = turn2 < 1 ? String(turn1) : '0';
      glow2.style.opacity = String(ramp(p, 0.2, 0.3) * (1 - turn2));
      pose3.style.opacity = String(turn2);
      glow3.style.opacity = String(turn2);
      fades.forEach((el) => { el.style.opacity = String(1 - ramp(p, 0.04, 0.18)); });

      // Dive: keep the lenses fixed while scaling, then drift them to the viewport centre.
      const dive = ramp(p, 0.46, 0.94);
      const scale = Math.exp(Math.log(MAX_ZOOM) * dive * dive);
      const drift = ramp(p, 0.46, 0.72);
      const w = figure.offsetWidth, h = figure.offsetHeight;
      const lensX = (window.innerWidth - w) / 2 + LENS_X * w;
      const lensY = vh - h + LENS_Y * h;
      const tx = drift * (window.innerWidth / 2 - lensX);
      const ty = drift * (vh / 2 - lensY);
      figure.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
      flash.style.opacity = String(ramp(p, 0.8, 0.97));
    };
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
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
  initHero();
  initWordReveal();
  initWave();
  initReveal();
  initFocusRows();
})();
