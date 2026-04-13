import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  define: {
    'process.env.PATH_BOOL_DEV_ASSERTS': JSON.stringify('0'),
  },
  plugins: [tailwindcss(), react()],
});
