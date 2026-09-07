import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Tailwind v4 runs as a Vite plugin rather than through a PostCSS config.
    // One less build layer, and it removes the need for postcss.config.js and
    // tailwind.config.js entirely — v4 configuration lives in CSS.
    tailwindcss(),
  ],
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to :5174 if the port is taken.
    // A moved port would no longer match the server's CLIENT_URL, and CORS
    // would start failing for a reason that is not obvious from the error.
    strictPort: true,
  },
});
