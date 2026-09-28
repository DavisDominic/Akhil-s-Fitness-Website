// Remember where the visitor came from (QR poster / MyGate / business card) for the whole visit, because the QR
// lands on Home but the form lives on Connect. Allowlist-validated; contains no personal data (PRD §48.4).
import { cleanSociety, cleanSource, type Source } from '../lib/validate';
import { track } from './track';

const KEY = 'af_src';

export function readSource(): { source: Source; sourceSociety: string | null } {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (v) return { source: cleanSource(v.source), sourceSociety: cleanSociety(v.society) };
  } catch { /* storage blocked: fall through */ }
  return { source: 'direct', sourceSociety: null };
}

try {
  const p = new URLSearchParams(location.search);
  if (p.has('source') || p.has('society')) {
    sessionStorage.setItem(KEY, JSON.stringify({ source: cleanSource(p.get('source')), society: cleanSociety(p.get('society')) }));
  }
} catch { /* private mode etc. */ }

// One delegated listener for every CTA / WhatsApp link that carries data-track.
document.addEventListener('click', (e) => {
  const el = (e.target as Element | null)?.closest<HTMLElement>('[data-track]');
  if (el?.dataset.track) track(el.dataset.track, { where: el.dataset.where ?? 'page' });
});
