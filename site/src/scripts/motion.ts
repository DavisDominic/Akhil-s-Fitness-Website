// Shared motion behaviours, loaded once site-wide (Base.astro): scroll-reveal and stat count-up. CSS
// transitions/animations handle their own prefers-reduced-motion via the global near-zero-duration override in
// base.css; the counter's manual rAF loop checks the media query directly since that global CSS override can't
// reach into JS math. (The testimonial carousel used to live here too — it's a plain native-scrolling element
// now, no JS involved at all; see .tcarousel in layout.css.)
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
