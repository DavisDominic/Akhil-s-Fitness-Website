// Real, consented testimonials (PRD §48.14 — first name + society only, matching the consent wording clients
// agreed to). Quotes are condensed to 1–2 sentences from the client's own longer submission; wording is theirs,
// just shortened. Never ship `sample: true` items alongside these.
export interface Testimonial {
  name: string;
  society: string;
  occupation?: string;
  quote: string;
  photo?: string;
  sample?: boolean;
}

export const sampleTestimonials: Testimonial[] = [
  { name: 'Shashwat', society: 'SJR Bluewaters', occupation: 'Delivery Manager', quote: 'Akhil helped me clean up my diet, build a proper daily routine, and start showing up consistently. The real win is the lifestyle change — my food habits have completely transformed, and I’ve stayed consistent long after hitting my initial goals.' },
  { name: 'Manvi', society: 'SJR Bluewaters', occupation: 'IT Professional', quote: 'He consistently encouraged me to push beyond my comfort zone, focus on proper technique, and stay disciplined. I’ve seen a significant improvement in my core strength, stamina, and overall performance, and now train with far more confidence.' },
  { name: 'Rini', society: 'DSR Rainbow Heights', occupation: 'Economist', quote: 'With Akhil I learnt that fitness has to be a lifestyle change — I’ve lost the weight again and actually kept it off this time. He’s motivated me every step of the way, not just in training but on nutrition, recovery and overall lifestyle.' },
  { name: 'Arti', society: 'Bluewaters', occupation: 'Homemaker', quote: 'He is knowledgeable, motivating, and always ensures I perform each exercise with the correct form. I’ve noticed a significant improvement in my strength, stamina, and overall fitness.' },
  { name: 'Darshan', society: 'SJR Bluewaters', occupation: 'Silicon Design Engineer', quote: 'My strength has incredibly improved, and every session is tailored perfectly to my goals. If you want someone who genuinely invests in your progress, look no further.' },
];
