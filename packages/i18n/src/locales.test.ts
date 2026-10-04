import { describe, expect, it } from 'vitest';
import { LANGUAGE_CODES } from './languages';
import { NAMESPACES, resources } from './resources';

/** Flattens a translation tree into `path → text`; arrays are indexed (`months[0]`). */
function flatten(tree: unknown): Map<string, string> {
  const leaves = new Map<string, string>();
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      leaves.set(path, node);
    } else if (Array.isArray(node)) {
      node.forEach((child: unknown, index) => {
        walk(child, `${path}[${String(index)}]`);
      });
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    } else {
      throw new Error(`Unexpected value at "${path}"`);
    }
  };
  walk(tree, '');
  return leaves;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

describe.each(NAMESPACES)('namespace "%s"', (namespace) => {
  const source = flatten(resources.ckb[namespace]);

  it.each(LANGUAGE_CODES)('%s has no empty texts', (language) => {
    const empty = [...flatten(resources[language][namespace])]
      .filter(([, text]) => text.trim() === '')
      .map(([path]) => path);
    expect(empty).toEqual([]);
  });

  it.each(LANGUAGE_CODES.filter((language) => language !== 'ckb'))(
    '%s has exactly the same keys as Kurdish',
    (language) => {
      const target = flatten(resources[language][namespace]);
      expect([...target.keys()].sort()).toEqual([...source.keys()].sort());
    },
  );

  it.each(LANGUAGE_CODES.filter((language) => language !== 'ckb'))(
    '%s uses the same {{placeholders}} as Kurdish',
    (language) => {
      const target = flatten(resources[language][namespace]);
      for (const [path, text] of source) {
        expect(placeholders(target.get(path) ?? ''), path).toEqual(placeholders(text));
      }
    },
  );
});
