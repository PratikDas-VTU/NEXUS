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

  // Test WebSocket multi-peer signaling & routing using Node's global WebSocket (Node 22+)
  if (typeof (globalThis as any).WebSocket !== 'undefined') {
    const ws1 = new (globalThis as any).WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    const ws2 = new (globalThis as any).WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

    await new Promise<void>((resolve, reject) => {
      let peer1Joined = false;
      let peer2GotPeer1 = false;
      let offerReceivedByPeer1 = false;
      let relayReceivedByPeer2 = false;

      ws1.onopen = () => {
        ws1.send(
          JSON.stringify({
            type: 'SIGNAL_JOIN',
            peerId: 'peer-1',
            deviceId: 'DEV-PEER-1',
            timestamp: Date.now(),
          })
        );
      };

      ws1.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data.toString());
        if (data.type === 'SIGNAL_PEERS') {
          peer1Joined = true;
          // Connect peer 2 once peer 1 is joined
          ws2.send(
            JSON.stringify({
              type: 'SIGNAL_JOIN',
              peerId: 'peer-2',
              deviceId: 'DEV-PEER-2',
              timestamp: Date.now(),
            })
          );
        } else if (data.type === 'SIGNAL_OFFER') {
          assert.strictEqual(data.fromPeerId, 'peer-2');
          offerReceivedByPeer1 = true;
          // Peer 1 sends a fallback relay message to peer 2
          ws1.send(
            JSON.stringify({
              type: 'SIGNAL_RELAY',
              toPeerId: 'peer-2',
              relayMessage: { type: 'HELLO', senderDeviceId: 'DEV-PEER-1', sessionId: 'ses-1' },
              timestamp: Date.now(),
            })
          );
        }
      };

      ws2.onopen = () => {
        // Wait for peer 1 to finish join before peer 2 joins
      };

      ws2.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data.toString());
        if (data.type === 'SIGNAL_PEERS') {
          assert.ok(Array.isArray(data.peers), 'Peer 2 should receive peers list');
          assert.ok(data.peers.some((p: any) => p.peerId === 'peer-1'), 'Peer 2 should see peer-1');
          peer2GotPeer1 = true;
          // Peer 2 sends an offer to Peer 1
          ws2.send(
            JSON.stringify({
              type: 'SIGNAL_OFFER',
              fromPeerId: 'peer-2',
              toPeerId: 'peer-1',
              sdp: { type: 'offer', sdp: 'v=0\r\no=mock 123 456 IN IP4 mock.local\r\n' },
              timestamp: Date.now(),
            })
          );
        } else if (data.type === 'SIGNAL_RELAY') {
          assert.strictEqual(data.fromPeerId, 'peer-1');
          assert.strictEqual(data.relayMessage?.type, 'HELLO');
          relayReceivedByPeer2 = true;

          ws1.close();
          ws2.close();
          console.log('  ✔ Passed: Multi-peer discovery, OFFER forwarding, and SIGNAL_RELAY verified.');
          resolve();
        }
      };

      ws1.onerror = reject;
      ws2.onerror = reject;
      setTimeout(() => reject(new Error('Multi-peer signaling test timeout')), 4000);
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
