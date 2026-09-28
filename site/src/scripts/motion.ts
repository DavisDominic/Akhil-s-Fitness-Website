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

// --- Testimonial marquee: auto-advances via a plain CSS transform on .tcarousel-track, driven entirely by this
// script — deliberately NOT a real scrollable element. An earlier version used overflow-x:auto + JS writing
// scrollLeft so drag/wheel worked "for free", but native scrolling has a real, browser-enforced end; a transform
// does not. On a real iPhone that native end collided with iOS's own rubber-band overscroll past the (doubled,
// for seamless wrap) content, and once stuck there no amount of re-wrapping scrollLeft from JS recovered it —
// confirmed needing a full reload. Owning position as a plain number and painting it via translateX sidesteps
// that whole class of bug: there is no native scroll boundary to ever reach or fight, so wrapping the number is
// unconditionally safe. touch-action:pan-y (layout.css) leaves vertical page scrolling to the browser while
// touchmove here handles the horizontal drag ourselves. Paused while genuinely hovered (gated to devices that
// actually support hover — a touch tap leaves a "sticky" :hover with nothing to clear it) or while a finger/
// mouse is down, resuming immediately on release — there's no native momentum to fight anymore either, since we
// are the only thing moving this element. ---
document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
  const track = el.querySelector<HTMLElement>('.tcarousel-track');
  if (!track) return;

  const SPEED = 45; // px/s
  let paused = false; // hover / focus
  let dragging = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let last = performance.now();
  let pos = 0;

  const halfWidth = () => track!.scrollWidth / 2;
  const wrap = (p: number, half: number) => { const r = p % half; return r < 0 ? r + half : r; };
  const render = () => { track!.style.transform = `translateX(${-pos}px)`; };

  function tick(now: number) {
    // Clamped so a long background/throttled gap (tab switched away, phone locked) resumes smoothly from
    // wherever it visually was instead of jumping far ahead to "catch up" for time nobody was watching.
    const dt = Math.min(now - last, 100);
    last = now;
    // prefers-reduced-motion only cancels the self-driven autoplay — dragging/swiping is the visitor's own
    // action, not motion imposed on them, so it stays available regardless (and was wrongly gated on the same
    // reduceMotion() check as autoplay before, making the whole thing inert for anyone with that preference on).
    if (!paused && !dragging && !reduceMotion()) {
      const half = halfWidth();
      // track.scrollWidth can still read as 0 on the very first frame or two, before layout has fully settled —
      // half would be 0, and pos % 0 is NaN, which never recovers on its own once it poisons pos, since NaN
      // propagates through every later frame's arithmetic forever. Skip the write until half is usable.
      if (half > 0) { pos = wrap(pos + (SPEED * dt) / 1000, half); render(); }
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
    const half = halfWidth();
    if (half <= 0) return;
    pos = wrap(dragStartPos - (clientX - dragStartX), half);
    render();
  }
  function dragEnd() { dragging = false; }

  // touch-action:pan-y (layout.css) is what's SUPPOSED to leave vertical page-scroll to the browser while this
  // handles horizontal drags — but touch-action support is inconsistent on older iOS Safari, and a horizontal
  // drag it doesn't fully honour can also start dragging the whole page sideways. So the gesture's axis is also
  // decided explicitly here on the first real movement (comparing how far it moved horizontally vs vertically),
  // and preventDefault() is called for the rest of a horizontal one as a second, CSS-independent line of
  // defense — never for a vertical one, which must stay free to scroll the page normally.
  let touchStartY = 0;
  let axis: 'x' | 'y' | null = null;
  el.addEventListener('touchstart', (e) => {
    dragStart(e.touches[0].clientX);
    touchStartY = e.touches[0].clientY;
    axis = null;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (axis === null) {
      const dx = t.clientX - dragStartX, dy = t.clientY - touchStartY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // not enough movement yet to tell
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'y') { dragging = false; return; } // hand off to native vertical page scroll entirely
    }
    if (axis === 'x') e.preventDefault();
    dragMove(t.clientX);
  }, { passive: false });
  el.addEventListener('touchend', dragEnd, { passive: true });
  el.addEventListener('touchcancel', dragEnd, { passive: true });

  // Mouse drag, for parity with the trackpad/wheel scroll a native scroll container used to give desktop for free.
  // The window-level mousemove is guarded on the left button still actually being held (buttons bit 1) — a
  // dangling `dragging=true` with no matching mouseup (dropped outside the window, a devtools/automation tool
  // synthesizing its own pointer tracking, etc.) would otherwise silently drag the carousel around forever.
  el.addEventListener('mousedown', (e) => { dragStart(e.clientX); e.preventDefault(); });
  window.addEventListener('mousemove', (e) => { if (e.buttons & 1) dragMove(e.clientX); else dragEnd(); });
  window.addEventListener('mouseup', dragEnd);

  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // clearly vertical page-scroll intent — ignore
    e.preventDefault();
    const half = halfWidth();
    if (half <= 0) return;
    pos = wrap(pos + e.deltaX, half);
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
    const half = halfWidth();
    if (half <= 0) return;
    pos = wrap(pos + (e.key === 'ArrowRight' ? 80 : -80), half);
    render();
    e.preventDefault();
  });
});
