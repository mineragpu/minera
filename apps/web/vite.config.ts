import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { BRAND } from '@dayagpu/shared';
import { docsPlugin } from './plugins/docs/plugin.ts';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Fills the brand placeholders in index.html, so the name lives only in the shared brand file. */
function brandHtml(): Plugin {
  const values: Readonly<Record<string, string>> = {
    __BRAND_TITLE__: `${BRAND.name} · ${BRAND.tagline}`,
    __BRAND_DESCRIPTION__: BRAND.oneLiner,
  };
  return {
    name: 'brand-html',
    transformIndexHtml(html) {
      return html.replace(/__BRAND_[A-Z]+__/g, (token) => {
        const value = values[token];
        if (value === undefined) throw new Error(`index.html uses an unknown brand token: ${token}`);
        return escapeHtml(value);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), brandHtml(), docsPlugin('../../docs')],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
