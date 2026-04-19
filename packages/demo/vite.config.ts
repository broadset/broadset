import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

const plugins: PluginOption[] = [tailwindcss(), react()];

// https://vite.dev/config/
export default defineConfig({
  define: {
    'process.env.PATH_BOOL_DEV_ASSERTS': JSON.stringify('0'),
  },
  plugins,
});
