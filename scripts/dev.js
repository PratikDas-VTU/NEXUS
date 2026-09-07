import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(rootDir, 'frontend');

const isWin = process.platform === 'win32';
const nodeCmd = process.execPath;

// Find Vite binary path
let viteBin = path.resolve(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) {
  viteBin = path.resolve(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
}

console.log('\x1b[1m\x1b[35m====================================================\x1b[0m');
console.log('\x1b[1m\x1b[36m🚀 NEXUS — Starting Full Stack (Signaler + Frontend)\x1b[0m');
console.log('\x1b[1m\x1b[35m====================================================\x1b[0m');
console.log('\x1b[36m[SIGNALER]\x1b[0m Target: ws://localhost:8080 & http://localhost:8080/status');
console.log('\x1b[32m[FRONTEND]\x1b[0m Target: http://localhost:3000 (LAN: --host=0.0.0.0)');
console.log('\x1b[1m\x1b[35m====================================================\x1b[0m\n');

function pipeWithPrefix(stream, prefix, colorCode) {
  if (!stream) return;
  let buffer = '';
  stream.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`${colorCode}${prefix}\x1b[0m ${line}`);
      }
    }
  });
}

// 1. Launch Signaling Server
const signaler = spawn(nodeCmd, ['networking/signaler.js'], {
  cwd: rootDir,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});
pipeWithPrefix(signaler.stdout, '[SIGNALER]', '\x1b[36m');
pipeWithPrefix(signaler.stderr, '[SIGNALER ERR]', '\x1b[31m');

// 2. Launch Vite Frontend Dev Server directly with Node
const frontend = spawn(nodeCmd, [viteBin, '--port=3000', '--host=0.0.0.0'], {
  cwd: frontendDir,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});
pipeWithPrefix(frontend.stdout, '[FRONTEND]', '\x1b[32m');
pipeWithPrefix(frontend.stderr, '[FRONTEND ERR]', '\x1b[33m');

let isCleaningUp = false;
function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log('\n\x1b[33mShutting down NEXUS services...\x1b[0m');
  try {
    signaler.kill('SIGINT');
  } catch {}
  try {
    frontend.kill('SIGINT');
  } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

signaler.on('exit', (code) => {
  if (code !== null && code !== 0 && !isCleaningUp) {
    console.error(`\x1b[31m[SIGNALER] exited with code ${code}\x1b[0m`);
  }
});

frontend.on('exit', (code) => {
  if (code !== null && code !== 0 && !isCleaningUp) {
    console.error(`\x1b[31m[FRONTEND] exited with code ${code}\x1b[0m`);
  }
});
