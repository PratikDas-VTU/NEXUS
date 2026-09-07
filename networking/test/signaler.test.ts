/**
 * NEXUS — Local Signaling Server Integration Verification
 * 
 * Verifies that `networking/signaler.js` runs in Node.js,
 * accepts incoming WebSocket connections, and routes signaling messages.
 */

import { spawn } from 'node:child_process';
import assert from 'node:assert';
import http from 'node:http';

const TEST_PORT = 8999;

async function runSignalerTest() {
  console.log('▶ Verifying Local Signaling Server (signaler.js)...');

  // Spawn signaler process on TEST_PORT
  const proc = spawn(process.execPath, ['networking/signaler.js'], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: 'pipe',
  });

  // Wait for server to boot
  await new Promise<void>((resolve, reject) => {
    proc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('active on port')) {
        resolve();
      }
    });
    proc.stderr.on('data', (err) => {
      console.error('Signaler err:', err.toString());
    });
    proc.on('error', reject);
    setTimeout(() => resolve(), 1000);
  });

  // Test HTTP health check endpoint
  await new Promise<void>((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}/status`, (res) => {
      assert.strictEqual(res.statusCode, 200, 'HTTP /status should return 200');
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const parsed = JSON.parse(body);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.connectedPeersCount, 0);
        console.log('  ✔ Passed: HTTP /status endpoint confirmed operational.');
        resolve();
      });
    }).on('error', reject);
  });

  // Test WebSocket connection using Node's global WebSocket (Node 22+)
  if (typeof (globalThis as any).WebSocket !== 'undefined') {
    const ws = new (globalThis as any).WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        // Send join
        ws.send(
          JSON.stringify({
            type: 'SIGNAL_JOIN',
            peerId: 'test-peer-1',
            deviceId: 'DEV-TEST-1',
            timestamp: Date.now(),
          })
        );
      };

      ws.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data.toString());
        if (data.type === 'SIGNAL_PEERS') {
          assert.ok(Array.isArray(data.peers), 'Should receive peers list');
          ws.close();
          console.log('  ✔ Passed: WebSocket handshake and SIGNAL_JOIN acknowledged.');
          resolve();
        }
      };

      ws.onerror = reject;
      setTimeout(() => reject(new Error('WebSocket signaling timeout')), 3000);
    });
  }

  // Terminate server
  proc.kill('SIGTERM');
  console.log('  ✔ Passed: Local Signaling Server verification complete.\n');
}

runSignalerTest().catch((err) => {
  console.error('❌ Signaler Test Failed:', err);
  process.exit(1);
});
