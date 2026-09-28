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

// --- Testimonial marquee: auto-advances by moving .tcarousel's own scrollLeft every frame (it's a real
// overflow-x:auto container — see layout.css — so a finger/mouse can also drag it natively). Wraps seamlessly
// past track.scrollWidth/2 since the card list is duplicated once in the markup. Paused while genuinely hovered
// (gated to devices that actually support hover — a touch tap leaves a "sticky" :hover with nothing to clear it)
// or while a finger is down, and resumes right away once nothing is actively moving the scroll position.
// Resuming is NOT simply "on touchend": a real swipe keeps coasting via the browser's own momentum scrolling
// well after the finger lifts, and writing scrollLeft ourselves while that's still happening fights/kills the
// native momentum. A native 'scroll' listener (which fires for both a manual drag AND its momentum tail) tracks
// "something is actively scrolling this" and only lets the auto-driver resume a short idle moment after the
// last of those events. That detector compares the observed scrollLeft against our own last-written position
// rather than flagging "the next event is ours to ignore" — on iPhone Safari, scroll events from a drag/
// momentum can arrive coalesced in ways that let a real swipe slip past a simple flag, which is what let the
// auto-driver keep nudging scrollLeft forward THROUGH a user's backward swipe (unable to swipe back) and, since
// nothing was ever pulling the position down from wherever a fast swipe left it, let it reach the true trailing
// edge of the duplicated content — the dead space of iOS's own rubber-band overscroll past real content, with
// nothing left to scroll back from. The idle-settle moment now also silently re-wraps the position into
// [0, half) — invisible, since the two halves are identical content — so neither a swipe nor the auto-driver
// can ever actually reach that true edge in the first place. ---
document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
  const track = el.querySelector<HTMLElement>('.tcarousel-track');
  if (!track || reduceMotion()) return;

  const SPEED = 45; // px/s
  let paused = false; // hover / focus / finger-down
  let userScrolling = false; // a drag or its momentum is actively moving scrollLeft right now
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let last = performance.now();
  // Our own float accumulator, not re-derived from el.scrollLeft each frame: a per-frame advance at this speed
  // is well under a pixel, and reading a just-written scrollLeft back can hand us a rounded/quantized value —
  // accumulating against THAT silently loses almost the entire increment every frame instead of building up to
  // real motion. Only resynced from the real scrollLeft once the user's drag/momentum has actually settled.
  let pos = el.scrollLeft;

  const halfWidth = () => track!.scrollWidth / 2;
  const wrap = (p: number, half: number) => { const r = p % half; return r < 0 ? r + half : r; };

  function tick(now: number) {
    // Clamped so a long background/throttled gap (tab switched away, phone locked) resumes smoothly from
    // wherever it visually was instead of jumping far ahead to "catch up" for time nobody was watching.
    const dt = Math.min(now - last, 100);
    last = now;
    const half = halfWidth();
    // track.scrollWidth can still read as 0 on the very first frame or two, before layout has fully settled —
    // half would be 0, and pos % 0 is NaN, which (unlike a normal out-of-range number) never recovers on its
    // own once it poisons pos, since NaN propagates through every later frame's arithmetic forever. Skip the
    // write on any frame where half isn't yet a usable, positive number rather than let that happen.
    if (!paused && !userScrolling && half > 0) {
      pos = wrap(pos + (SPEED * dt) / 1000, half);
      el.scrollLeft = pos;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  el.addEventListener('scroll', () => {
    // A scroll event that lands close to where we last wrote pos ourselves is our own write echoing back —
    // not real user activity. Anything else is a genuine drag or its momentum tail.
    if (Math.abs(el.scrollLeft - pos) <= 2) return;
    userScrolling = true;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      userScrolling = false;
      const half = halfWidth();
      if (half > 0) {
        pos = wrap(el.scrollLeft, half);
        el.scrollLeft = pos; // no-op if already in range; otherwise an invisible re-centre, not a visible jump
      }
    }, 120);
  }, { passive: true });

  if (matchMedia('(hover: hover)').matches) {
    el.addEventListener('mouseenter', () => { paused = true; });
    el.addEventListener('mouseleave', () => { paused = false; });
  }
  el.addEventListener('focusin', () => { paused = true; });
  el.addEventListener('focusout', () => { paused = false; });

  el.addEventListener('touchstart', () => { paused = true; }, { passive: true });
  el.addEventListener('touchend', () => { paused = false; }, { passive: true });
  el.addEventListener('touchcancel', () => { paused = false; }, { passive: true });
});
