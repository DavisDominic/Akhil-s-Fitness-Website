// Single place for contact details, availability and verified figures (PRD §36, §44, §48.7 "Site configuration").
export type Availability = 'taking' | 'limited' | 'full';

export const site = {
  name: 'Akhil’s Fitness Coaching',
  tagline: 'Build fitness that lasts.',
  /** Flip to true at launch. While false every page is served with noindex. */
  indexable: false,
  /** Later controlled from Telegram (`/status`), see addendum §4.4. */
  availability: 'taking' as Availability,
  whatsapp: '919074037117', // international format, no "+"
  phone: '+91 90740 37117',
  email: 'akhilmp873@gmail.com',
  // Verified figures only (PRD §44). Do not change without Akhil's confirmation.
  metrics: [
    { value: '2,400+', label: 'Hours of hands-on training', short: 'Hours of\ncoaching' },
    { value: '100+', label: 'Clients coached', short: 'Clients\ncoached' },
    { value: '4+', label: 'Years of coaching experience', short: 'Years of\nexperience' },
  ],
} as const;

export const availabilityText: Record<Availability, string> = {
  taking: 'Taking new clients',
  limited: 'Limited availability',
  full: 'Currently full',
};

/** CTA label follows availability: when full, the same form becomes a waitlist (PRD §39, DS 4.6). */
export const trialLabel = (): string => (site.availability === 'full' ? 'Join the waitlist' : 'Book a free trial');

/** wa.me click-to-chat link. Works on free WhatsApp / WhatsApp Business; the visitor still taps Send. */
export function waLink(text?: string): string {
  const base = `https://wa.me/${site.whatsapp}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
/** For visitors who have NOT submitted the form: must not imply a submission (PRD §48.2). */
export const waGeneral = (): string =>
  waLink('Hi Akhil, I found you through your website and have a question about personal training.');

export const trialHref = '/connect#trial';
