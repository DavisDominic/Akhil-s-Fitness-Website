// Run with: npm test   (Node's built-in test runner; no extra dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSociety, cleanSource, normalizeIndianMobile, prettyMobile, validateTestimonial, validateTrial } from './validate.ts';

test('Indian mobile numbers are accepted in every common format', () => {
  for (const ok of ['9876543210', '98765 43210', '+91 98765-43210', '+919876543210', '919876543210', '09876543210', '091 98765 43210', '(98765) 43210']) {
    assert.equal(normalizeIndianMobile(ok), '9876543210', ok);
  }
});

test('invalid mobile numbers are rejected', () => {
  for (const bad of ['', '12345', '5876543210', '98765432101', '+1 415 555 0100', 'abcdefghij', '98765 4321']) {
    assert.equal(normalizeIndianMobile(bad), null, bad);
  }
});

test('validateTrial normalises and returns E.164', () => {
  const r = validateTrial({ name: '  Priya   Sharma ', whatsapp: '+91 98765-43210', society: 'SJR  Bluewaters', goal: 'weight-loss', regularTrainingTime: 'Weekday mornings' });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.name, 'Priya Sharma');
    assert.equal(r.value.whatsappE164, '919876543210');
    assert.equal(r.value.society, 'SJR Bluewaters');
  }
});

test('validateTrial reports every bad field at once', () => {
  const r = validateTrial({ name: '', whatsapp: '1', society: '', goal: 'nope', regularTrainingTime: '' });
  assert.ok(!r.ok);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ['goal', 'name', 'regularTrainingTime', 'society', 'whatsapp']);
});

test('length caps and goal allowlist are enforced', () => {
  const base = { name: 'Priya', whatsapp: '9876543210', society: 'X Society', goal: 'strength', regularTrainingTime: 'evenings' };
  assert.ok(validateTrial(base).ok);
  assert.ok(!validateTrial({ ...base, name: 'a'.repeat(81) }).ok);
  assert.ok(!validateTrial({ ...base, goal: '<script>' }).ok);
  assert.ok(!validateTrial({ ...base, goalOther: 'x'.repeat(121) }).ok);
});

test('occupation is optional but capped', () => {
  const base = { name: 'Priya', whatsapp: '9876543210', society: 'X Society', goal: 'strength', regularTrainingTime: 'evenings' };
  const noOcc = validateTrial(base);
  assert.ok(noOcc.ok);
  if (noOcc.ok) assert.equal(noOcc.value.occupation, '');
  const withOcc = validateTrial({ ...base, occupation: '  Software engineer  ' });
  assert.ok(withOcc.ok);
  if (withOcc.ok) assert.equal(withOcc.value.occupation, 'Software engineer');
  assert.ok(!validateTrial({ ...base, occupation: 'x'.repeat(81) }).ok);
});

test('source values outside the QR allowlist collapse to "direct"', () => {
  assert.equal(cleanSource('poster'), 'poster');
  assert.equal(cleanSource('mygate'), 'mygate');
  assert.equal(cleanSource('business-card'), 'business-card');
  for (const v of ['evil', '<x>', '', null, undefined, 'referral']) assert.equal(cleanSource(v), 'direct');
});

test('society slug is sanitised', () => {
  assert.equal(cleanSociety('SJR-Bluewaters'), 'sjr-bluewaters');
  for (const v of ['../etc', 'a b', 'x'.repeat(41), '', null]) assert.equal(cleanSociety(v), null);
});

test('prettyMobile formats for display', () => assert.equal(prettyMobile('919876543210'), '+91 98765 43210'));

test('validateTestimonial normalises and requires consent', () => {
  const base = { name: '  Priya   Sharma ', society: 'SJR  Bluewaters', quote: 'Great coaching, highly recommend.', consent: 'on' };
  const r = validateTestimonial(base);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.name, 'Priya Sharma');
    assert.equal(r.value.society, 'SJR Bluewaters');
    assert.equal(r.value.occupation, '');
  }
  assert.ok(!validateTestimonial({ ...base, consent: undefined }).ok);
  assert.ok(!validateTestimonial({ ...base, consent: 'false' }).ok);
});

test('validateTestimonial accepts a real boolean consent too (client-side read())', () => {
  const base = { name: 'Priya', society: 'X Society', quote: 'Great coaching, highly recommend.' };
  assert.ok(validateTestimonial({ ...base, consent: true }).ok);
  assert.ok(!validateTestimonial({ ...base, consent: false }).ok);
});

test('validateTestimonial reports every bad field at once', () => {
  const r = validateTestimonial({ name: '', society: '', quote: 'short', consent: false });
  assert.ok(!r.ok);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ['consent', 'name', 'quote', 'society']);
});

test('validateTestimonial length caps', () => {
  const base = { name: 'Priya', society: 'X Society', quote: 'Great coaching, highly recommend.', consent: 'on' };
  assert.ok(validateTestimonial(base).ok);
  assert.ok(!validateTestimonial({ ...base, name: 'a'.repeat(81) }).ok);
  assert.ok(!validateTestimonial({ ...base, occupation: 'x'.repeat(81) }).ok);
  assert.ok(!validateTestimonial({ ...base, quote: 'x'.repeat(1001) }).ok);
});
