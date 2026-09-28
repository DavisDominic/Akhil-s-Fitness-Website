// Shared motion behaviours, loaded once site-wide (Base.astro): scroll-reveal, stat count-up, and the
// testimonial marquee's auto-scroll. CSS transitions/animations handle their own prefers-reduced-motion via the
// global near-zero-duration override in base.css; the *JS-driven* motion here (the counter's manual rAF loop,
// and the marquee's scrollLeft loop) checks the media query directly since that global CSS override can't reach
// into JS math or a rAF loop.
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Scroll-reveal: fade + rise the first time an element enters the viewport, then stop watching it. ---
if ('IntersectionObserver' in window) {
  const revealIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-visible');
        revealIo.unobserve(e.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
  );
  document.querySelectorAll('.reveal').forEach((el) => revealIo.observe(el));

  // --- Stat count-up: "2,400+" style numbers animate from 0 up to their own value once visible. ---
  const countTargets = document.querySelectorAll<HTMLElement>('.phil-stats-row b, .metrics .metric b');
  if (countTargets.length && !reduceMotion()) {
    const countIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          countIo.unobserve(e.target);
          animateCount(e.target as HTMLElement);
        }
      },
      { threshold: 0.4 },
    );
    countTargets.forEach((el) => countIo.observe(el));
  }
}

function animateCount(el: HTMLElement) {
  const final = el.textContent ?? '';
  const target = parseInt(final.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(target) || target <= 0) return;
  const duration = 1000;
  const start = performance.now();
  const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  function frame(now: number) {
    const p = Math.min(1, (now - start) / duration);
    const value = Math.round(target * easeOutExpo(p));
    el.textContent = value.toLocaleString('en-US');
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = final; // restores the exact original string (comma + "+") on completion
  }
  requestAnimationFrame(frame);
}

// --- Testimonial marquee: two genuinely different mechanisms depending on platform — see setupNativeScroll and
// setupTransformDriven below for why. isIOS also covers iPadOS, which reports as "MacIntel" but is touch-
// capable, unlike a real Mac. ---
const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
  const track = el.querySelector<HTMLElement>('.tcarousel-track');
  if (!track) return;
  if (isIOS) setupNativeScroll(el, track);
  else setupTransformDriven(el, track);
});

// The card list is rendered 3x in the markup (index.astro) so there's a full extra copy of buffer on each side
// of whichever one is "current" — shared by both mechanisms below.
function loopWidthOf(track: HTMLElement) { return track.scrollWidth / 3; }

// --- iOS: genuine native scrolling (see .tcarousel--ios in layout.css). No autoplay (per explicit request), so
// there's nothing to fight momentum with — native touch/scroll handling is simply more reliable than any
// hand-rolled equivalent, and repeated attempts to patch a custom touch/transform implementation for iOS
// specifically kept surfacing new problems (dead space at the loop seam, non-smooth dragging) rather than
// fewer. JS here only ever touches scrollLeft once scrolling has fully settled (never mid-gesture, never
// fighting momentum): if that's landed in the first or third copy, it silently jumps by exactly one loop-width
// into the equivalent spot in the middle copy — invisible, since all three copies are pixel-identical. ---
function setupNativeScroll(el: HTMLElement, track: HTMLElement) {
  el.classList.add('tcarousel--ios');
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function recentre() {
    const lw = loopWidthOf(track);
    if (lw <= 0) return;
    // A loop, not a single if/else: realistically only ever runs once (a single settled scroll can't drift more
    // than about a screen's width, well under one lw), but a loop costs nothing and stays correct regardless.
    while (el.scrollLeft < lw * 0.5) el.scrollLeft += lw;
    while (el.scrollLeft > lw * 1.5) el.scrollLeft -= lw;
  }

  function start() {
    const lw = loopWidthOf(track);
    if (lw <= 0) { requestAnimationFrame(start); return; } // layout not settled yet — try again next frame
    el.scrollLeft = lw; // begin in the middle copy, so there's a full copy's worth of room either direction
  }
  requestAnimationFrame(start);

  el.addEventListener('scroll', () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(recentre, 150);
  }, { passive: true });
}

// --- Non-iOS (desktop, Android): auto-advances via a plain CSS transform on .tcarousel-track, driven entirely
// by this script — deliberately NOT a real scrollable element, since a native scroll container's momentum
// fights a continuously-writing autoplay driver (see the iOS branch above for why that's a real problem there).
// Paused while genuinely hovered (gated to devices that actually support hover — a touch tap leaves a "sticky"
// :hover with nothing to clear it) or while a finger/mouse is down, resuming immediately on release. ---
function setupTransformDriven(el: HTMLElement, track: HTMLElement) {
  const SPEED = 45; // px/s
  let paused = false; // hover / focus
  let dragging = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let last = performance.now();
  let pos = 0;

  const wrap = (p: number, lw: number) => { const r = p % lw; return r < 0 ? r + lw : r; };
  const render = () => { track.style.transform = `translateX(${-pos}px)`; };

  function tick(now: number) {
    // Clamped so a long background/throttled gap (tab switched away, phone locked) resumes smoothly from
    // wherever it visually was instead of jumping far ahead to "catch up" for time nobody was watching.
    const dt = Math.min(now - last, 100);
    last = now;
    // prefers-reduced-motion only cancels the self-driven autoplay — dragging/swiping is the visitor's own
    // action, not motion imposed on them, so it stays available regardless.
    if (!paused && !dragging && !reduceMotion()) {
      const lw = loopWidthOf(track);
      // track.scrollWidth can still read as 0 on the very first frame or two, before layout has fully settled —
      // lw would be 0, and pos % 0 is NaN, which never recovers on its own once it poisons pos, since NaN
      // propagates through every later frame's arithmetic forever. Skip the write until lw is usable.
      if (lw > 0) { pos = wrap(pos + (SPEED * dt) / 1000, lw); render(); }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function dragStart(clientX: number) {
    dragging = true;
    dragStartX = clientX;
    dragStartPos = pos;
  }
  function dragMove(clientX: number) {
    if (!dragging) return;
    // Deliberately NOT wrapped here — only tick()'s own autoplay step and dragEnd() below wrap. A real finger
    // isn't perfectly monotonic; if the raw value happens to hover right at the wrap boundary, wrapping on
    // every touchmove could flip the result between two very different-looking positions frame to frame from
    // ordinary sub-pixel jitter, which read as the carousel "wriggling". A CSS transform has no problem with a
    // value outside [0, lw) for the short, bounded span of a single drag gesture.
    pos = dragStartPos - (clientX - dragStartX);
    render();
  }
  function dragEnd() {
    dragging = false;
    const lw = loopWidthOf(track);
    if (lw > 0) pos = wrap(pos, lw); // bring it back in range now that nothing is actively rendering it
  }

  el.addEventListener('touchstart', (e) => dragStart(e.touches[0].clientX), { passive: true });
  el.addEventListener('touchmove', (e) => dragMove(e.touches[0].clientX), { passive: true });
  el.addEventListener('touchend', dragEnd, { passive: true });
  el.addEventListener('touchcancel', dragEnd, { passive: true });

  // Mouse drag, for parity with the trackpad/wheel scroll a native scroll container used to give desktop for free.
  el.addEventListener('mousedown', (e) => { dragStart(e.clientX); e.preventDefault(); });
  window.addEventListener('mousemove', (e) => { if (e.buttons & 1) dragMove(e.clientX); else dragEnd(); });
  window.addEventListener('mouseup', dragEnd);

  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // clearly vertical page-scroll intent — ignore
    e.preventDefault();
    const lw = loopWidthOf(track);
    if (lw <= 0) return;
    pos = wrap(pos + e.deltaX, lw);
    render();
  }, { passive: false });

  if (matchMedia('(hover: hover)').matches) {
    el.addEventListener('mouseenter', () => { paused = true; });
    el.addEventListener('mouseleave', () => { paused = false; });
  }
  el.addEventListener('focusin', () => { paused = true; });
  el.addEventListener('focusout', () => { paused = false; });

  // Arrow-key scrolling: a plain transform isn't a native scroll container the browser handles this for
  // automatically anymore, so it's reimplemented here to keep the tabindex/role on this element meaningful.
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const lw = loopWidthOf(track);
    if (lw <= 0) return;
    pos = wrap(pos + (e.key === 'ArrowRight' ? 80 : -80), lw);
    render();
    e.preventDefault();
  });
}
