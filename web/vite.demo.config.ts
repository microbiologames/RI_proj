import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build de la démonstration : un seul fichier, sans requête réseau.
 * `inlineDynamicImports` supprime le découpage en morceaux — indispensable
 * puisque la page publiée ne peut pas aller chercher un second fichier.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-demo',
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'demo/index.html',
      output: { inlineDynamicImports: true },
    },
  },
});
