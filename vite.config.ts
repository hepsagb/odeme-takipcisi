import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vercel ortam değişkenlerini yükle
  // Fix: Property 'cwd' does not exist on type 'Process'
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Kod içindeki process.env.API_KEY'i gerçek anahtarla değiştir
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});