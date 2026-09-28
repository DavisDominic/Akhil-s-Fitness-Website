// Testimonial form behaviour: inline validation, real submission to /api/testimonial, success/error states.
// Simpler than the trial form on purpose — no idempotency key (a duplicate testimonial is a minor annoyance,
// not a double-booking) and no WhatsApp fallback on failure (this isn't time-sensitive the way a trial request is).
import { validateTestimonial, type TestimonialFieldErrors } from '../lib/validate';
import { track } from './track';

const form = document.querySelector<HTMLFormElement>('form[data-form="testimonial"]');
if (form) init(form);

function init(form: HTMLFormElement) {
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitLabel = submit.innerHTML;
  const status = document.getElementById('testimonial-status')!;
  let sending = false;
  let started = false;

  const fields = ['name', 'society', 'quote', 'consent'] as const;
  const fieldEl = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
  const wrapOf = (name: string) => fieldEl(name)!.closest<HTMLElement>('.field')!;
  const value = (name: string) => {
    const el = fieldEl(name);
    if (!el) return '';
    return el instanceof HTMLInputElement && el.type === 'checkbox' ? String(el.checked) : el.value;
  };
  const read = () => ({
    name: value('name'), society: value('society'), occupation: value('occupation'),
    quote: value('quote'), consent: value('consent') === 'true',
  });

  function setError(name: string, message?: string) {
    const wrap = wrapOf(name);
    wrap.classList.toggle('error', !!message);
    let msg = wrap.querySelector<HTMLElement>('.msg[data-live]');
    fieldEl(name)?.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (!message) { msg?.remove(); return; }
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'msg';
      msg.dataset.live = '';
      msg.setAttribute('role', 'alert');
      msg.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-alert"/></svg><span></span>';
      wrap.appendChild(msg);
    }
    msg.querySelector('span')!.textContent = message;
  }

  function showErrors(errors: TestimonialFieldErrors) {
    fields.forEach((f) => setError(f, errors[f]));
    const first = fields.find((f) => errors[f]);
    if (first) fieldEl(first)?.focus();
  }

  // Inline validation: on leaving a field, and live once a field is already showing an error.
  form.addEventListener('focusout', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.name || t.type === 'checkbox' || !(fields as readonly string[]).includes(t.name)) return;
    if (t.value.trim() === '' && !wrapOf(t.name).classList.contains('error')) return; // don't nag before they've typed
    const r = validateTestimonial(read());
    setError(t.name, r.ok ? undefined : r.errors[t.name as keyof TestimonialFieldErrors]);
  });
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!started) { started = true; track('testimonial_form_start'); }
    if (!t.name || !wrapOf(t.name).classList.contains('error')) return;
    const r = validateTestimonial(read());
    setError(t.name, r.ok ? undefined : r.errors[t.name as keyof TestimonialFieldErrors]);
  });
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'consent') setError('consent');
  });

  const alertHtml = (icon: string, title: string, body: string, tone: 'ok' | 'bad') =>
    `<div class="alert ${tone}" role="${tone === 'bad' ? 'alert' : 'status'}"><svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${icon}"/></svg><div><b>${title}</b><p>${body}</p></div></div>`;

  const setSending = (on: boolean) => {
    sending = on;
    form.setAttribute('aria-busy', String(on));
    form.querySelectorAll<HTMLInputElement>('input,textarea').forEach((i) => { if (!i.closest('.hp')) i.disabled = on; });
    submit.innerHTML = on ? '<svg class="icon sm spin" aria-hidden="true" focusable="false"><use href="#i-spinner"/></svg> Sending…' : submitLabel;
  };

  async function send() {
    const v = validateTestimonial(read());
    if (!v.ok) { showErrors(v.errors); return; }
    setSending(true);
    status.innerHTML = '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('/api/testimonial', { method: 'POST', body: new FormData(form), signal: ctrl.signal });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        form.hidden = true;
        status.innerHTML = alertHtml('check-circle', 'Thank you', 'Akhil will review this before it appears on the site.', 'ok');
        track('testimonial_submit_success');
        return;
      }
      if (res.status === 400 && json?.errors) { showErrors(json.errors as TestimonialFieldErrors); return; }
      if (res.status === 429) { status.innerHTML = alertHtml('alert', 'Too many attempts', 'Please wait a few minutes and try again.', 'bad'); return; }
      status.innerHTML = alertHtml('alert', 'That didn’t send', 'Something went wrong on our side. Please try again.', 'bad');
    } catch {
      status.innerHTML = alertHtml('alert', 'That didn’t send', 'Check your connection and try again.', 'bad');
    } finally {
      clearTimeout(timer);
      if (!form.hidden) setSending(false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending) return;
    track('testimonial_submit_attempt');
    void send();
  });
}
