import type { KeywordRule } from './types.js';

const MAX_INPUT_LENGTH = 2_000;

export function normalizeText(value: string): string {
  return value
    .slice(0, MAX_INPUT_LENGTH)
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function findMatchingRule(input: string, rules: KeywordRule[]): KeywordRule | null {
  const normalizedInput = normalizeText(input);
  if (!normalizedInput) return null;
  const inputWords = new Set(normalizedInput.split(' '));

  return (
    rules
      .filter((rule) => matches(normalizedInput, inputWords, rule))
      .sort((left, right) => right.priority - left.priority || left.id - right.id)[0] ?? null
  );
}

function matches(input: string, inputWords: Set<string>, rule: KeywordRule): boolean {
  const phrase = normalizeText(rule.phrase);
  if (!phrase) return false;
  const words = phrase.split(' ');

  switch (rule.matchMode) {
    case 'exact':
      return input === phrase;
    case 'contains':
      return ` ${input} `.includes(` ${phrase} `);
    case 'any_word':
      return words.some((word) => inputWords.has(word));
    case 'all_words':
      return words.every((word) => inputWords.has(word));
  }
}
