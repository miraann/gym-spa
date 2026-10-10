/**
 * Project lint rules:
 * - no-physical-direction-classes: only logical Tailwind classes, so layouts mirror in RTL.
 * - no-hardcoded-ui-text: user-facing text must come from translations.
 * - no-import-meta-env-object: read build variables one at a time, so only those reach the bundle.
 * - no-raw-color-classes: colors come from the theme tokens, so the gym's brand color, dark mode
 *   and the fixed status colors work everywhere.
 */

/** Utilities that need a value: `ml-4`, `left-0`, `scroll-pr-2` (bare `left` is not a class). */
const PHYSICAL_WITH_VALUE = /^(?:m[lr]|p[lr]|scroll-m[lr]|scroll-p[lr]|left|right|inset-[lr])-/;
/** Utilities that may be bare or take a value: `border-l`, `rounded-r-md`. */
const PHYSICAL_BARE_OR_VALUE = /^(?:border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br))(?:-|$)/;
const PHYSICAL_EXACT = new Set([
  'text-left',
  'text-right',
  'float-left',
  'float-right',
  'clear-left',
  'clear-right',
]);

const LOGICAL_HINT =
  'ml/mr → ms/me, pl/pr → ps/pe, left/right → start/end, text-left → text-start, border-l → border-s, rounded-l → rounded-s';

/** Strips variants (`md:`, `hover:`, `data-[x=y]:`), the important flag and a negative sign. */
function utilityOf(token) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === '[') depth += 1;
    else if (char === ']') depth -= 1;
    else if (char === ':' && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!/, '').replace(/!$/, '').replace(/^-/, '');
}

export function findPhysicalClasses(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const utility = utilityOf(token);
      return (
        PHYSICAL_WITH_VALUE.test(utility) ||
        PHYSICAL_BARE_OR_VALUE.test(utility) ||
        PHYSICAL_EXACT.has(utility)
      );
    });
}

const noPhysicalDirectionClasses = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow physical-direction Tailwind classes (they break RTL).' },
    messages: {
      physical:
        '"{{token}}" does not mirror in Kurdish/Arabic (RTL). Use a logical class: {{hint}}.',
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      for (const token of findPhysicalClasses(text)) {
        context.report({ node, messageId: 'physical', data: { token, hint: LOGICAL_HINT } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITY =
  'bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|decoration|divide|accent|caret|placeholder|shadow|inset-shadow|inset-ring|drop-shadow';
/** Palette colors: `bg-amber-500`, `text-emerald-600/80`. */
const PALETTE_COLOR = new RegExp(`^(?:${COLOR_UTILITY})-(?:${PALETTE})-\\d{2,3}(?:/\\S+)?$`);
/** Hardcoded colors in arbitrary values: `bg-[#0f766e]`, `text-[rgb(0_0_0)]`, `[color:#fff]`. */
const ARBITRARY_COLOR =
  /\[(?:[\w-]+:)?(?:#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\()/i;

export function findRawColorClasses(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const utility = utilityOf(token);
      return PALETTE_COLOR.test(utility) || ARBITRARY_COLOR.test(utility);
    });
}

const noRawColorClasses = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow palette and hardcoded colors; use the theme tokens.' },
    messages: {
      raw: '"{{token}}" is a fixed color. Use a theme token (bg-primary, text-muted-foreground, bg-success, text-warning, text-destructive, ...), so the brand color, dark mode and status colors work.',
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      for (const token of findRawColorClasses(text)) {
        context.report({ node, messageId: 'raw', data: { token } });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};

const HAS_LETTER = /\p{L}/u;
/** JSX props whose string value is shown to the user or read by screen readers. */
const USER_FACING_PROPS = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'description',
  'heading',
  'label',
  'placeholder',
  'title',
  'tooltip',
]);

function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

const noHardcodedUiText = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow user-facing text that does not come from translations.' },
    messages: {
      hardcoded:
        'User-facing text must come from translations: t("..."). Add the Kurdish text first in packages/i18n/src/locales/ckb.',
    },
    schema: [],
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: 'hardcoded' });
    return {
      JSXText(node) {
        if (HAS_LETTER.test(node.value)) report(node);
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === 'JSXAttribute') return;
        const text = staticString(node.expression);
        if (text !== null && HAS_LETTER.test(text)) report(node);
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (!name || !USER_FACING_PROPS.has(name) || !node.value) return;
        const value =
          node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value;
        const text = staticString(value);
        if (text !== null && HAS_LETTER.test(text)) report(node.value);
      },
      CallExpression(node) {
        const { callee } = node;
        const isToast =
          (callee.type === 'Identifier' && callee.name === 'toast') ||
          (callee.type === 'MemberExpression' &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'toast');
        if (!isToast) return;
        const text = staticString(node.arguments[0]);
        if (text !== null && HAS_LETTER.test(text)) report(node.arguments[0]);
      },
    };
  },
};

/**
 * Vite replaces `import.meta.env.VITE_NAME` with that one value. Any other use of `import.meta.env`
 * (the object itself, destructuring, `[name]`, `?.`) becomes an object holding every VITE_*
 * variable of the build, which then ships in the public bundle. Vercel adds its own: git author,
 * commit messages, project ids.
 */
const noImportMetaEnvObject = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Read build variables one at a time (import.meta.env.VITE_NAME): any other use puts every VITE_* variable into the bundle.',
    },
    messages: {
      wholeObject:
        'Read one variable at a time: import.meta.env.VITE_NAME. Any other use of import.meta.env puts every VITE_* variable of the build (Vercel adds its own) into the public bundle.',
    },
    schema: [],
  },
  create(context) {
    return {
      MetaProperty(node) {
        if (node.meta.name !== 'import' || node.property.name !== 'meta') return;
        const env = node.parent;
        const isEnv =
          env.type === 'MemberExpression' &&
          env.object === node &&
          !env.computed &&
          env.property.type === 'Identifier' &&
          env.property.name === 'env';
        if (!isEnv) return;
        const read = env.parent;
        const readsOneVariable =
          read.type === 'MemberExpression' &&
          read.object === env &&
          !read.computed &&
          !read.optional;
        if (!readsOneVariable) context.report({ node: env, messageId: 'wholeObject' });
      },
    };
  },
};

export default {
  meta: { name: 'eslint-plugin-gym', version: '0.1.0' },
  rules: {
    'no-physical-direction-classes': noPhysicalDirectionClasses,
    'no-hardcoded-ui-text': noHardcodedUiText,
    'no-import-meta-env-object': noImportMetaEnvObject,
    'no-raw-color-classes': noRawColorClasses,
  },
};
