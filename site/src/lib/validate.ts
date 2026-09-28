// Shared by the browser (inline validation) and the server (authoritative validation). Pure functions, no DOM.
// Trial form fields: PRD §14/§48.8.

export const GOALS = ['weight-loss', 'strength', 'stamina', 'mobility', 'general-fitness', 'other'] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABEL: Record<Goal, string> = {
  'weight-loss': 'Weight loss',
  strength: 'Strength',
  stamina: 'Stamina',
  mobility: 'Mobility',
  'general-fitness': 'General fitness',
  other: 'Other',
};

/** Only the sources that QR codes can carry (addendum §4). Anything else becomes "direct". */
export const URL_SOURCES = ['poster', 'mygate', 'business-card'] as const;
export type Source = (typeof URL_SOURCES)[number] | 'direct' | 'referral' | 'other';
export const cleanSource = (v: unknown): Source =>
  (URL_SOURCES as readonly string[]).includes(String(v)) ? (v as Source) : 'direct';
export const cleanSociety = (v: unknown): string | null => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(s) ? s : null;
};

export interface TrialInput {
  name: string;
  whatsapp: string;
  society: string;
  occupation?: string; // optional; not in the PRD form spec, added so Akhil can prepare his pitch before the trial
  goal: string;
  goalOther?: string;
  regularTrainingTime: string;
}
export type FieldErrors = Partial<Record<keyof TrialInput, string>>;

const collapse = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Accepts "98765 43210", "+91 98765-43210", "091 98765 43210", "919876543210"... and returns the 10-digit
 * Indian mobile number (starts 6-9), or null.
 */
export function normalizeIndianMobile(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/[^\d+]/g, '');
  d = d.replace(/^\+/, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  else if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const MESSAGES = {
  name: 'Please enter your name.',
  whatsapp: 'Enter a 10-digit mobile number.',
  society: 'Please enter your apartment or society.',
  goal: 'Pick at least one goal.',
  regularTrainingTime: 'Tell Akhil roughly when you’d like to train.',
} as const;

/** Accepts either an array of goal values (checkboxes, serialised to JSON) or a comma-joined string (FormData /
 * a single legacy value) — normalises both to a deduped, allowlist-filtered, comma-joined string for storage. */
const cleanGoals = (v: unknown): string => {
  const list = Array.isArray(v) ? v : String(v ?? '').split(',');
  const valid = list.map((g) => collapse(String(g))).filter((g) => (GOALS as readonly string[]).includes(g));
  return [...new Set(valid)].join(',');
};

export function validateTrial(input: Partial<Record<keyof TrialInput, unknown>>): { ok: true; value: Required<TrialInput> & { whatsappE164: string } } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = collapse(input.name);
  const society = collapse(input.society);
  const occupation = collapse(input.occupation);
  const goal = cleanGoals(input.goal);
  const goalOther = collapse(input.goalOther);
  const time = collapse(input.regularTrainingTime);
  const mobile = normalizeIndianMobile(input.whatsapp);

  if (name.length < 2 || name.length > 80) errors.name = MESSAGES.name;
  if (!mobile) errors.whatsapp = MESSAGES.whatsapp;
  if (society.length < 2 || society.length > 100) errors.society = MESSAGES.society;
  if (occupation.length > 80) errors.occupation = 'Please keep this under 80 characters.';
  if (!goal) errors.goal = MESSAGES.goal;
  if (time.length < 2 || time.length > 160) errors.regularTrainingTime = MESSAGES.regularTrainingTime;
  if (goalOther.length > 120) errors.goalOther = 'Please keep this under 120 characters.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, whatsapp: `+91${mobile}`, whatsappE164: `91${mobile}`, society, occupation, goal, goalOther, regularTrainingTime: time },
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** "+91 98765 43210" for display. */
export const prettyMobile = (e164: string) => `+${e164.slice(0, 2)} ${e164.slice(2, 7)} ${e164.slice(7)}`;
