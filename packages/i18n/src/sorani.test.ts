import { describe, expect, it } from 'vitest';
import { NAMESPACES, resources } from './resources';

/**
 * Spelling guard for the Kurdish (Sorani) source texts.
 *
 * Note: ه (U+0647) is NOT banned — it is the correct Sorani letter for the /h/ sound
 * (هەینی، هاوکاتکردن). It is only wrong at the end of a word, where the vowel ە is meant.
 */
const FORBIDDEN_IN_KURDISH: readonly { char: string; problem: string }[] = [
  { char: 'ي', problem: 'Arabic ي — use Kurdish ی (U+06CC)' },
  { char: 'ك', problem: 'Arabic ك — use Kurdish ک (U+06A9)' },
  { char: 'ى', problem: 'Arabic ى — use Kurdish ی (U+06CC)' },
  { char: 'ة', problem: 'Arabic ة — use ە (U+06D5)' },
  { char: 'ۀ', problem: 'ۀ — use ە (U+06D5)' },
  { char: 'ھ', problem: 'ھ — use ه (U+0647) for /h/' },
];

/** Typical slips when Arabic is typed on a Kurdish keyboard. */
const FORBIDDEN_IN_ARABIC: readonly { char: string; problem: string }[] = [
  { char: 'ی', problem: 'Kurdish ی — use Arabic ي (U+064A) or ى (U+0649)' },
  { char: 'ک', problem: 'Kurdish ک — use Arabic ك (U+0643)' },
  { char: 'ە', problem: 'Kurdish ە — use ة or ه' },
];

/** Words that legitimately end with ه in Sorani. Add here only after checking the spelling. */
const ALLOWED_FINAL_HEH = new Set<string>([]);

function textsOf(language: 'ckb' | 'ar'): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const walk = (node: unknown, where: string): void => {
    if (typeof node === 'string') out.push({ where, text: node });
    else if (Array.isArray(node)) {
      node.forEach((child: unknown, index) => {
        walk(child, `${where}[${String(index)}]`);
      });
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, `${where}.${key}`);
    }
  };
  for (const namespace of NAMESPACES) walk(resources[language][namespace], namespace);
  return out;
}

function findProblems(
  language: 'ckb' | 'ar',
  forbidden: readonly { char: string; problem: string }[],
): string[] {
  const problems: string[] = [];
  for (const { where, text } of textsOf(language)) {
    for (const { char, problem } of forbidden) {
      if (text.includes(char)) problems.push(`${where}: ${problem} in "${text}"`);
    }
    if (language === 'ckb') problems.push(...soraniWordProblems(where, text));
  }
  return problems;
}

function soraniWordProblems(where: string, text: string): string[] {
  const problems: string[] = [];
  if (/[ً-ْ]/u.test(text)) {
    problems.push(`${where}: Arabic diacritics (harakat) are not used in Sorani: "${text}"`);
  }
  if (/[۰-۹]/u.test(text)) {
    problems.push(`${where}: Persian digits — use Western digits or ٠-٩: "${text}"`);
  }
  for (const word of text.match(/\p{L}+/gu) ?? []) {
    if (/^[ەێۆ]/u.test(word)) {
      problems.push(`${where}: "${word}" starts with a vowel letter — add ئ before it`);
    }
    if (word.endsWith('ه') && !ALLOWED_FINAL_HEH.has(word)) {
      problems.push(`${where}: "${word}" ends with ه — should it be ە?`);
    }
  }
  return problems;
}

describe('Kurdish (Sorani) spelling', () => {
  it('uses Sorani letters, not Arabic substitutes', () => {
    expect(findProblems('ckb', FORBIDDEN_IN_KURDISH)).toEqual([]);
  });

  it('catches the mistakes it is meant to catch', () => {
    // Guard against the checker silently passing everything.
    expect(soraniWordProblems('x', 'کراوه')).toHaveLength(1);
    expect(soraniWordProblems('x', 'ەندام')).toHaveLength(1);
    expect(soraniWordProblems('x', 'هەینی')).toEqual([]);
  });
});

describe('Arabic spelling', () => {
  it('uses Arabic letters, not Kurdish look-alikes', () => {
    expect(findProblems('ar', FORBIDDEN_IN_ARABIC)).toEqual([]);
  });
});
