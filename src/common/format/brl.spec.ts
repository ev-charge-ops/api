import { formatBrl } from './brl.js';

describe('formatBrl', () => {
  it('formats cents as Brazilian reais with a regular space', () => {
    expect(formatBrl(1041)).toBe('R$ 10,41');
    expect(formatBrl(25)).toBe('R$ 0,25');
    expect(formatBrl(123456)).toBe('R$ 1.234,56');
  });
});
