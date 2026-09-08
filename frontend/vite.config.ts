import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { spawn } from 'child_process';
import net from 'net';
import { defineConfig, Plugin } from 'vite';

/**
 * Ensures the NEXUS LAN Signaling Server (port 8080) is active whenever Vite runs,
 * regardless of whether the developer ran `npm run dev` or `npm run dev:frontend`.
 */
function nexusSignalerPlugin(): Plugin {
  let signalerProcess: any = null;

  return {
    name: 'nexus-signaler-plugin',
    configureServer(server) {
      const socket = new net.Socket();
      socket.setTimeout(400);

      socket.on('connect', () => {
        socket.destroy();
        console.log('\x1b[36m[NEXUS Vite]\x1b[0m Signaling server already active on port 8080.');
      });

      socket.on('error', () => {
        socket.destroy();
        const rootDir = path.resolve(__dirname, '..');
        const signalerScript = path.resolve(rootDir, 'networking', 'signaler.js');
        console.log('\x1b[36m[NEXUS Vite]\x1b[0m Auto-launching LAN Signaling Server (port 8080)...');
        signalerProcess = spawn(process.execPath, [signalerScript], {
          cwd: rootDir,
          env: process.env,
          stdio: 'inherit',
        });

        signalerProcess.on('error', (err: any) => {
          console.error('\x1b[31m[NEXUS Vite] Failed to auto-start signaler:\x1b[0m', err);
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
      });

      socket.connect(8080, '127.0.0.1');

      const cleanup = () => {
        if (signalerProcess) {
          try {
            signalerProcess.kill('SIGINT');
          } catch {}
          signalerProcess = null;
        }
      };

      process.on('exit', cleanup);
      server.httpServer?.on('close', cleanup);
    },
  };
}

export default defineConfig(() => {
  const isHttps = process.env.HTTPS === 'true' || process.argv.includes('--https');
  const plugins: any[] = [react(), tailwindcss(), nexusSignalerPlugin()];
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
        'leaflet': path.resolve(__dirname, '../node_modules/leaflet'),
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
