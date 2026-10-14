import { describe, expect, it } from 'vitest';
import { checkCondition, getPath, matches, render } from '../src/automation/engine.js';

const ctx = { lead: { source: 'TELEGRAM', amount: 1500, customFields: { city: 'Киев' } }, contact: { name: 'Иван' }, message: { text: 'Хочу заказать доставку' } };

describe('automation conditions', () => {
  it('getPath читает вложенные пути', () => {
    expect(getPath(ctx, 'lead.customFields.city')).toBe('Киев');
    expect(getPath(ctx, 'lead.missing.deep')).toBeUndefined();
  });
  it('операторы сравнения', () => {
    expect(checkCondition(ctx, { field: 'lead.source', op: 'eq', value: 'TELEGRAM' })).toBe(true);
    expect(checkCondition(ctx, { field: 'lead.source', op: 'neq', value: 'TELEGRAM' })).toBe(false);
    expect(checkCondition(ctx, { field: 'lead.source', op: 'in', value: ['VIBER', 'TELEGRAM'] })).toBe(true);
    expect(checkCondition(ctx, { field: 'message.text', op: 'contains', value: 'доставк' })).toBe(true);
    expect(checkCondition(ctx, { field: 'lead.amount', op: 'gt', value: 1000 })).toBe(true);
    expect(checkCondition(ctx, { field: 'lead.amount', op: 'lt', value: 1000 })).toBe(false);
    expect(checkCondition(ctx, { field: 'lead.ownerId', op: 'empty' })).toBe(true);
    expect(checkCondition(ctx, { field: 'contact.name', op: 'not_empty' })).toBe(true);
  });
  it('все условия объединяются через AND', () => {
    expect(matches(ctx, [{ field: 'lead.source', op: 'eq', value: 'TELEGRAM' }, { field: 'lead.amount', op: 'gt', value: 100 }])).toBe(true);
    expect(matches(ctx, [{ field: 'lead.source', op: 'eq', value: 'TELEGRAM' }, { field: 'lead.amount', op: 'gt', value: 5000 }])).toBe(false);
    expect(matches(ctx, [])).toBe(true);
  });
  it('render подставляет переменные', () => {
    expect(render('Связаться с {{contact.name}} ({{ lead.source }}) {{nope}}', ctx)).toBe('Связаться с Иван (TELEGRAM) ');
  });
});
