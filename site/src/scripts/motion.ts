// Shared motion behaviours, loaded once site-wide (Base.astro): scroll-reveal, stat count-up, and pausing the
// testimonial marquee on touch (hover/focus-within already pause it via CSS alone). CSS transitions/animations
// handle their own prefers-reduced-motion via the global near-zero-duration override in base.css; the two bits
// of *JS-driven* motion here (the counter's manual rAF loop, and the marquee's touch-pause timer) check the media
// query directly since that global CSS override can't reach into JS math or a setTimeout.
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
  const duration = 1200;
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

// --- Marquee touch-pause: hover/focus-within already pause it via CSS; touch devices have no hover, so tapping
// the carousel pauses it for a few seconds to actually read a card, then it resumes on its own. ---
document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  el.addEventListener('touchstart', () => {
    el.classList.add('is-paused');
    clearTimeout(resumeTimer);
  }, { passive: true });
  el.addEventListener('touchend', () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => el.classList.remove('is-paused'), 3000);
  }, { passive: true });
});
