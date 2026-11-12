/* Built Together — scroll/parallax engine (vanilla, rAF-driven) */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - t, 3);

  /* ---- split hero letters ---- */
  $$('[data-split]').forEach((el, li) => {
    const txt = el.textContent;
    el.textContent = '';
    [...txt].forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      s.style.animationDelay = `${0.15 + li * 0.25 + i * 0.045}s`;
      el.appendChild(s);
    });
  });

  /* ---- split chapter titles into masked words ---- */
  $$('.chapter-head__title').forEach(h => {
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(w => {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
            const outer = document.createElement('span'); outer.className = 'word';
            const inner = document.createElement('span'); inner.textContent = w;
            outer.appendChild(inner); frag.appendChild(outer);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(h);
    let d = 0;
    $$('.word > span', h).forEach(s => { s.style.transitionDelay = `${d}s`; d += 0.08; });
  });

  /* ---- reveal-on-enter ---- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { threshold: 0.25 });
  $$('.reveal, .chapter-head').forEach(el => io.observe(el));

  /* ---- chapter nav ---- */
  const nav = $('.chapters');
  const navLinks = $$('.chapters a');
  const chapterEls = $$('[data-chapter]');

  /* ---- cached elements ---- */
  const bar = $('.progress__bar');
  const hero = $('.hero'), heroImg = $('.hero__img'), heroContent = $('.hero__content');
  const speedEls = $$('[data-speed]');
  const pImgs = $$('.parallax-img');
  const hs = $('.hscroll'), hsTrack = $('.hscroll__track'), hsImgs = $$('.hscroll__panel img');
  const rc = $('.reveal-circle'), rcImg = $('.reveal-circle__img');
  const mz = $('.mask-zoom'), mzImg = $('.mask-zoom__img');
  const fin = $('.finale'), finFrame = $('.finale__frame'), finImg = $('.finale__img');

  /* progress of a tall sticky section: 0 when its top hits viewport top, 1 when its bottom hits viewport bottom */
  const stickyProgress = el => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight));
  };

  /* ---- SVG text mask setup ---- */
  const svg = $('.mask-zoom__svg');
  const mzRect = $('.mz-rect', svg), mzCover = $('.mz-cover', svg), mzG = $('.mz-g', svg);
  const mzTexts = $$('.mz-text', svg), mzMeasure = $('.mz-measure', svg); // mask text has no geometry, so measure a twin
  let mzOrigin = { x: 0, y: 0 };
  function layoutMask() {
    const w = innerWidth, h = innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    [mzRect, mzCover].forEach(r => { r.setAttribute('width', w); r.setAttribute('height', h); });
    mzTexts.forEach(t => {
      t.setAttribute('x', w / 2);
      t.setAttribute('y', h / 2);
      t.setAttribute('font-size', Math.min(w * 0.42, h * 0.95));
    });
    // zoom origin: inside the left stroke of the "O" so the image floods in
    try {
      const b = mzMeasure.getExtentOfChar(1);
      mzOrigin = { x: b.x + b.width * 0.13, y: b.y + b.height * 0.5 };
    } catch (e) { mzOrigin = { x: w / 2, y: h / 2 }; }
  }
  document.fonts && document.fonts.ready.then(layoutMask);
  layoutMask();
  addEventListener('resize', layoutMask);

  /* ---- main frame ---- */
  let ticking = false;
  function frame() {
    ticking = false;
    const vh = innerHeight, sy = scrollY;
    const docH = document.documentElement.scrollHeight - vh;
    bar.style.transform = `scaleX(${clamp(sy / docH)})`;

    // hero
    const hp = clamp(sy / hero.offsetHeight);
    if (!reduce) {
      heroImg.style.transform = `translate3d(0, ${hp * 18}%, 0) scale(${1.05 + hp * 0.2})`;
      heroContent.style.transform = `translate3d(0, ${hp * -120}px, 0)`;
    }
    heroContent.style.opacity = 1 - hp * 1.4;
    nav.classList.toggle('is-on', hp > 0.85);

    if (!reduce) {
      // generic data-speed parallax (relative to viewport center)
      speedEls.forEach(el => {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const off = (r.top + r.height / 2 - vh / 2);
        el.style.transform = `translate3d(0, ${off * parseFloat(el.dataset.speed)}px, 0)`;
      });

      // image parallax within clipped frame
      pImgs.forEach(img => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const p = clamp((vh - r.top) / (vh + r.height));
        img.style.transform = `translate3d(0, ${-p * 23}%, 0)`;
      });
    }

    // horizontal pinned strip
    {
      const p = stickyProgress(hs);
      const max = hsTrack.scrollWidth - innerWidth;
      hsTrack.style.transform = `translate3d(${-p * max}px, 0, 0)`;
      if (!reduce) hsImgs.forEach((img, i) => {
        const r = img.parentElement.getBoundingClientRect();
        const c = (r.left + r.width / 2 - innerWidth / 2) / innerWidth;
        img.style.transform = `translate3d(${c * -10 - 6}%, 0, 0)`;
      });
    }

    // circle reveal
    {
      const p = stickyProgress(rc);
      const t = ease(clamp(p / 0.75));
      rcImg.style.clipPath = `circle(${lerp(9, 76, t)}% at 50% 50%)`;
      rcImg.style.transform = `scale(${lerp(1.25, 1, t)}) rotate(${lerp(-4, 0, t)}deg)`;
      rc.classList.toggle('is-open', t > 0.92);
    }

    // text mask zoom
    {
      const p = stickyProgress(mz);
      const t = clamp((p - 0.12) / 0.7);
      const s = Math.pow(16, ease(t)); // 1 → 16 (larger glyphs stop rendering inside masks)
      mzG.setAttribute('transform', `translate(${mzOrigin.x} ${mzOrigin.y}) scale(${s}) translate(${-mzOrigin.x} ${-mzOrigin.y})`);
      mzCover.style.opacity = clamp(1 - (t - 0.45) / 0.3);
      mzImg.style.transform = `scale(${lerp(1.25, 1, ease(t))})`;
      mz.classList.toggle('is-open', t > 0.95);
    }

    // finale zoom-out to framed photo
    {
      const p = stickyProgress(fin);
      const t = ease(clamp(p / 0.7));
      const insetV = lerp(0, 12, t), insetH = lerp(0, 8, t);
      finFrame.style.inset = `${insetV}vh ${insetH}vw`;
      finFrame.style.borderRadius = `${t * 8}px`;
      finImg.style.transform = `scale(${lerp(1.9, 1, t)})`;
      fin.classList.toggle('is-words', p > 0.55);
    }

    // active chapter
    let active = null;
    chapterEls.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.5 && r.bottom > vh * 0.5) active = el.dataset.chapter;
    });
    navLinks.forEach(a => a.classList.toggle('is-active', a.dataset.ch === active));
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', req);
  frame();
})();
