import { defineConfig } from 'vite';
import promiseVisualizer from './plugin/vite-plugin.js';

export default defineConfig({
  plugins: [promiseVisualizer()],
  server: {
    port: 3000
  },
  root: 'example',
  base: './'
});
