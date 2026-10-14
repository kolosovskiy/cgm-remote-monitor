import { describe, expect, it } from 'vitest';
import { formatPhone, normalizeEmail, normalizePhone } from '../src/lib/phone.js';

describe('normalizePhone', () => {
  it('приводит украинские номера к 380XXXXXXXXX', () => {
    expect(normalizePhone('+38 (067) 123-45-67')).toBe('380671234567');
    expect(normalizePhone('067 123 45 67')).toBe('380671234567');
    expect(normalizePhone('80671234567')).toBe('380671234567');
    expect(normalizePhone('671234567')).toBe('380671234567');
    expect(normalizePhone('380671234567')).toBe('380671234567');
  });
  it('оставляет иностранные номера как есть', () => {
    expect(normalizePhone('+48 600 123 456')).toBe('48600123456');
  });
  it('возвращает null для мусора', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
  it('форматирует обратно', () => {
    expect(formatPhone('380671234567')).toBe('+380 67 123 45 67');
  });
});

describe('normalizeEmail', () => {
  it('извлекает и приводит к нижнему регистру', () => {
    expect(normalizeEmail('Ivan Petrov <Ivan.Petrov@Example.COM>')).toBe('ivan.petrov@example.com');
    expect(normalizeEmail('not an email')).toBeNull();
  });
});
