import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isHttps = process.env.HTTPS === 'true' || process.argv.includes('--https');
  const plugins: any[] = [react(), tailwindcss()];
  if (isHttps) {
    plugins.push(basicSsl());
  }

  return {
    plugins: plugins as any,
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        'react': path.resolve(__dirname, '../node_modules/react'),
        'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared'),
        '@backend': path.resolve(__dirname, '../backend'),
        '@networking': path.resolve(__dirname, '../networking'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/ws': {
          target: 'http://localhost:8080',
          ws: true,
          rewriteWsOrigin: true,
          rewrite: (path: string) => path.replace(/^\/ws/, ''),
        },
      },
    },
  };
});
