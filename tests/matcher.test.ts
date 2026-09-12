import { describe, expect, it } from 'vitest';
import { findMatchingRule, normalizeText } from '../src/domain/matcher.js';
import type { KeywordRule } from '../src/domain/types.js';

const rules: KeywordRule[] = [
  { id: 1, phrase: 'получить гайд', matchMode: 'contains', priority: 100, responseId: 10 },
  { id: 2, phrase: 'гайд', matchMode: 'any_word', priority: 10, responseId: 11 },
];

describe('keyword matcher', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeText('  ПОЛУЧИТЬ,  гайд! ')).toBe('получить гайд');
  });

  it('selects the highest-priority matching rule', () => {
    expect(findMatchingRule('Хочу получить гайд, пожалуйста', rules)?.responseId).toBe(10);
  });

  it('bounds untrusted input length', () => {
    expect(normalizeText('a'.repeat(10_000))).toHaveLength(2_000);
  });
});
