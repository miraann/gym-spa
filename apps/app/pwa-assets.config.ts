import {
  createResizeOptions,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

// Run `pnpm generate:icons` after changing public/logo.svg.
// Maskable and Apple icons get padded by the OS mask, so pad them with the brand color, not white.
const brandPadding = createResizeOptions(false, { background: '#0f766e' });

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: brandPadding },
    apple: { ...minimal2023Preset.apple, resizeOptions: brandPadding },
  },
  images: ['public/logo.svg'],
});
