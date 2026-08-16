// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { remarkClaimMarkers } from './src/lib/remark-claim-markers.mjs';

export default defineConfig({
  site: 'https://moroccan-history-from-the-archives.pages.dev',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkClaimMarkers],
    // Syntax highlighting is off: the only inline code in this corpus is
    // archival references and status tokens, which get semantic treatment
    // from the remark plugin rather than a language grammar.
    syntaxHighlight: false,
    gfm: true,
    smartypants: false, // the corpus already uses real typographic marks
  },
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      // The dossier pages ship no JS at all; the visualisation routes are the
      // only ones that hydrate, and they are opt-in.
      cssCodeSplit: true,
    },
  },
});
