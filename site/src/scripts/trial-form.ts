// Free-trial form behaviour (PRD §21, §48.8): inline validation, values preserved on every failure, disabled +
// "Sending…" while in flight, retry after a network failure, WhatsApp fallback, duplicate protection (idempotency key).
import { normalizeIndianMobile, validateTrial, type FieldErrors, type TrialInput } from '../lib/validate';
import { readSource } from './source';
import { track } from './track';

const form = document.querySelector<HTMLFormElement>('form[data-form="trial"]');
if (form) init(form);

function init(form: HTMLFormElement) {
  const key = crypto.randomUUID(); // one per form session: retries reuse it, so the server can never store two leads
  const waBase = form.dataset.waBase ?? '';
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitLabel = submit.innerHTML;
  const errorBox = document.getElementById('trial-error')!;
  const errorText = errorBox.querySelector<HTMLElement>('[data-error-text]')!;
  const errorWa = errorBox.querySelector<HTMLAnchorElement>('[data-wa]')!;
  const successes = { trial: document.getElementById('trial-success')!, waitlist: document.getElementById('waitlist-success')! };
  let sending = false;
  let started = false;

  const fields = ['name', 'whatsapp', 'society', 'goal', 'regularTrainingTime'] as const;
  const wrapOf = (name: string) => (form.elements.namedItem(name) instanceof RadioNodeList
    ? (form.elements.namedItem(name) as RadioNodeList)[0]
    : (form.elements.namedItem(name) as Element)).closest<HTMLElement>('.field')!;
  const inputsOf = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)];
  // "goal" is a checkbox group (multiple selections) — read the checked ones and join them the same way
  // validateTrial expects (comma-joined), rather than the single-value RadioNodeList.value getter.
  const value = (name: string) => {
    if (name === 'goal') return inputsOf('goal').filter((i) => i.checked).map((i) => i.value).join(',');
    const el = form.elements.namedItem(name);
    return el instanceof RadioNodeList ? el.value : (el as HTMLInputElement | null)?.value ?? '';
  };
  const read = (): Partial<Record<keyof TrialInput, string>> => ({
    name: value('name'), whatsapp: value('whatsapp'), society: value('society'), occupation: value('occupation'),
    goal: value('goal'), goalOther: value('goalOther'), regularTrainingTime: value('regularTrainingTime'),
  });

  function setError(name: string, message?: string) {
    const wrap = wrapOf(name);
    wrap.classList.toggle('error', !!message);
    let msg = wrap.querySelector<HTMLElement>('.msg[data-live]');
    inputsOf(name).forEach((i) => {
      if (i.type === 'radio' || i.type === 'checkbox') return;
      i.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (msg) i.setAttribute('aria-describedby', msg.id);
    });
    if (!message) { msg?.remove(); return; }
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'msg';
      msg.dataset.live = '';
      msg.id = `trial-${name}-err`;
      msg.setAttribute('role', 'alert');
      msg.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-alert"/></svg><span></span>';
      wrap.appendChild(msg);
      inputsOf(name).forEach((i) => { if (i.type !== 'radio' && i.type !== 'checkbox') i.setAttribute('aria-describedby', msg!.id); });
    }
    msg.querySelector('span')!.textContent = message;
  }

  function showErrors(errors: FieldErrors) {
    fields.forEach((f) => setError(f, errors[f]));
    const first = fields.find((f) => errors[f]);
    if (first) (inputsOf(first)[0] as HTMLElement | undefined)?.focus();
  }

  // Inline validation: on leaving a field, and live once a field is already showing an error.
  form.addEventListener('focusout', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.name || t.type === 'radio' || t.type === 'checkbox' || !(fields as readonly string[]).includes(t.name)) return;
    if (t.name === 'whatsapp') {
      const n = normalizeIndianMobile(t.value);
      if (n) t.value = `${n.slice(0, 5)} ${n.slice(5)}`;
    }
    if (t.value.trim() === '' && !wrapOf(t.name).classList.contains('error')) return; // don't nag before they've typed
    const r = validateTrial(read());
    setError(t.name, r.ok ? undefined : r.errors[t.name as keyof FieldErrors]);
  });
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!started) { started = true; track('trial_form_start'); }
    if (!t.name || !wrapOf(t.name).classList.contains('error')) return;
    const r = validateTrial(read());
    setError(t.name, r.ok ? undefined : r.errors[t.name as keyof FieldErrors]);
  });
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'goal') setError('goal');
  });

  const setSending = (on: boolean) => {
    sending = on;
    form.setAttribute('aria-busy', String(on));
    form.querySelectorAll<HTMLInputElement>('input,textarea').forEach((i) => { if (!i.closest('.hp')) i.disabled = on; });
    if (on) {
      submit.setAttribute('aria-busy', 'true');
      submit.innerHTML = '<svg class="icon sm spin" aria-hidden="true" focusable="false"><use href="#i-spinner"/></svg> Sending…';
    } else {
      submit.removeAttribute('aria-busy');
      submit.innerHTML = submitLabel;
    }
  };

  const waLink = (text: string) => `${waBase}?text=${encodeURIComponent(text)}`;
  function fail(message: string, name: string) {
    errorText.textContent = message;
    errorWa.href = waLink(`Hi Akhil, I tried to request a free trial on your website but it didn’t go through. I’m ${name || 'a new visitor'}.`);
    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function succeed(kind: 'trial' | 'waitlist', name: string) {
    const box = successes[kind];
    box.querySelectorAll<HTMLElement>('[data-name]').forEach((n) => (n.textContent = name));
    box.querySelectorAll<HTMLAnchorElement>('[data-wa-now]').forEach((a) => {
      a.href = waLink(`Hi Akhil, I’m ${name}. I just submitted a ${kind === 'waitlist' ? 'waitlist request' : 'free trial request'} through your website.`);
    });
    form.hidden = true;
    errorBox.hidden = true;
    box.hidden = false;
    const h = box.querySelector<HTMLElement>('[data-focus]');
    h?.focus();
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    track('trial_submit_success', { type: kind });
  }

  async function send() {
    const values = read();
    const v = validateTrial(values);
    if (!v.ok) { showErrors(v.errors); return; }
    errorBox.hidden = true;
    const src = readSource();
    const payload = { ...values, ...src, idempotencyKey: key, website: value('website') };
    const first = v.value.name.split(' ')[0];
    setSending(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('/api/trial', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) { succeed(json.leadType === 'waitlist' ? 'waitlist' : 'trial', json.name || first); return; }
      if (res.status === 400 && json?.errors) { showErrors(json.errors as FieldErrors); return; }
      if (res.status === 429) { fail('That’s a lot of attempts in a short time. Please wait a few minutes, or message Akhil directly on WhatsApp.', first); return; }
      fail('Something went wrong on our side. Your details are still here.', first);
    } catch {
      fail('We couldn’t reach the server. Check your connection. Your details are still here.', first);
    } finally {
      clearTimeout(timer);
      if (!form.hidden) setSending(false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending) return; // duplicate-submit guard (the server also dedupes on the idempotency key)
    track('trial_submit_attempt');
    void send();
  });
  errorBox.querySelector('[data-retry]')?.addEventListener('click', () => form.requestSubmit());

  // "Other" goal reveals an optional free-text field — shown whenever the "other" checkbox itself is checked,
  // regardless of which checkbox in the group just changed (several can be checked at once now). It sits right
  // after the chip row, which can land below the fold on a small screen right when it's revealed — scrolled
  // into view so it's never just silently appearing off-screen.
  const other = document.getElementById('goal-other');
  const otherBox = form.querySelector<HTMLInputElement>('input[name="goal"][value="other"]');
  form.querySelectorAll<HTMLInputElement>('input[name="goal"]').forEach((r) => r.addEventListener('change', () => {
    if (!other || !otherBox) return;
    const wasHidden = other.hidden;
    other.hidden = !otherBox.checked;
    if (wasHidden && !other.hidden) other.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
}
