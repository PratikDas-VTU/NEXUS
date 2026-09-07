#!/usr/bin/env node
/**
 * NEXUS — Offline-First Emergency & Community Network
 * Local LAN / Hotspot Signaling Server
 * 
 * ZERO DEPENDENCY Node.js WebSocket & HTTP signaling service.
 * Runs on standard Node LTS without requiring `npm install`.
 * 
 * Usage:
 *   node networking/signaler.js
 *   PORT=8080 node networking/signaler.js
 */

import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';

const PORT = parseInt(process.env.PORT || '8080', 10);
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Connected peers: peerId -> { socket, peerId, deviceId, connectedAt }
const peers = new Map();

/** Frame encoder: converts a UTF-8 string into an unmasked WebSocket frame */
function encodeWebSocketFrame(payloadStr) {
  const payloadBuf = Buffer.from(payloadStr, 'utf8');
  const len = payloadBuf.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + opcode 1 (text)
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payloadBuf]);
}

/** Sends a JSON stringified message to a target peer */
function sendJson(peer, messageObj) {
  try {
    const raw = JSON.stringify(messageObj);
    const frame = encodeWebSocketFrame(raw);
    peer.socket.write(frame);
  } catch (err) {
    console.error(`[Signaler] Failed to send to ${peer.peerId}:`, err.message);
  }
}

/** Broadcasts a message to all connected peers except optional excluded peer */
function broadcast(messageObj, excludePeerId = null) {
  for (const [id, peer] of peers) {
    if (id !== excludePeerId) {
      sendJson(peer, messageObj);
    }
  }
}

/** Minimal stream parser for incoming masked WebSocket frames */
function createFrameParser(onMessage, onClose) {
  let buffer = Buffer.alloc(0);

  return function handleData(chunk) {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      // Close frame (opcode 8)
      if (opcode === 0x08) {
        onClose();
        return;
      }

      // Ping (opcode 9) -> Respond with Pong (opcode 10)
      if (opcode === 0x09) {
        buffer = buffer.subarray(offset);
        continue;
      }

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskKeyLen = isMasked ? 4 : 0;
      const totalFrameLen = offset + maskKeyLen + payloadLen;

      if (buffer.length < totalFrameLen) {
        // Incomplete frame, wait for more chunks
        return;
      }

      let payload = buffer.subarray(offset + maskKeyLen, totalFrameLen);

      if (isMasked) {
        const mask = buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.alloc(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payload[i] ^ mask[i % 4];
        }
        payload = unmasked;
      }

      // Advance buffer
      buffer = buffer.subarray(totalFrameLen);

      if (opcode === 0x01) {
        // Text frame
        const text = payload.toString('utf8');
        try {
          const parsed = JSON.parse(text);
          onMessage(parsed);
        } catch (e) {
          console.warn('[Signaler] Malformed JSON received:', e.message);
        }
      }
    }
  };
}

// Helper to unmask Chrome mDNS .local hostnames with real client IPv4
function unmaskMdns(str, replacementIp) {
  if (!str || typeof str !== 'string' || !replacementIp || replacementIp === '127.0.0.1' || replacementIp.startsWith('fe80')) {
    return str;
  }
  return str.replace(/[a-zA-Z0-9-]+\.local/gi, replacementIp);
}

// Create HTTP server for both health checks and WebSocket upgrade
const server = http.createServer((req, res) => {
  if (req.url === '/status' || req.url === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'NEXUS LAN Signaling Server',
        connectedPeersCount: peers.size,
        peers: Array.from(peers.values()).map((p) => ({
          peerId: p.peerId,
          deviceId: p.deviceId,
          remoteIp: p.remoteIp,
          connectedAt: p.connectedAt,
        })),
        timestamp: Date.now(),
      })
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('NEXUS Local LAN Signaling Server is running. Connect via ws://<this-ip>:' + PORT);
});

// Handle WebSocket HTTP Upgrade
server.on('upgrade', (req, socket, head) => {
  const secKey = req.headers['sec-websocket-key'];
  if (!secKey) {
    socket.destroy();
    return;
  }

  const rawIp = socket.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
  const remoteIp = rawIp.replace(/^.*:/, '');

  // RFC 6455 Handshake
  const hash = crypto
    .createHash('sha1')
    .update(secKey + WS_GUID)
    .digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
    '\r\n',
  ];

  socket.write(responseHeaders.join('\r\n'));

  let currentPeerId = null;

  const cleanup = () => {
    if (currentPeerId && peers.has(currentPeerId)) {
      peers.delete(currentPeerId);
      console.log(`[Signaler] Peer disconnected: ${currentPeerId} (Remaining: ${peers.size})`);
      broadcast({
        type: 'SIGNAL_PEER_LEFT',
        peerId: currentPeerId,
        timestamp: Date.now(),
      });
    }
    socket.destroy();
  };

  const handleMessage = (msg) => {
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'SIGNAL_JOIN': {
        const { peerId, deviceId } = msg;
        if (!peerId) return;

        currentPeerId = peerId;
        const newPeer = {
          socket,
          peerId,
          deviceId: deviceId || `DEV-${peerId.slice(0, 6)}`,
          remoteIp,
          connectedAt: Date.now(),
        };

        // Send existing peers list to the newly joined peer (excluding self)
        const existingPeers = Array.from(peers.values())
          .filter((p) => p.peerId !== peerId)
          .map((p) => ({
            peerId: p.peerId,
            deviceId: p.deviceId,
            remoteIp: p.remoteIp,
          }));

        sendJson(newPeer, {
          type: 'SIGNAL_PEERS',
          peers: existingPeers,
          timestamp: Date.now(),
        });

        // Store peer and notify all other peers
        peers.set(peerId, newPeer);
        console.log(`[Signaler] Peer joined: ${peerId} (Device: ${newPeer.deviceId}, IP: ${remoteIp}, Total: ${peers.size})`);

        broadcast(
          {
            type: 'SIGNAL_PEER_JOINED',
            peer: { peerId, deviceId: newPeer.deviceId, remoteIp },
            timestamp: Date.now(),
          },
          peerId
        );
        break;
      }

      case 'SIGNAL_OFFER': {
        const { toPeerId, sdp } = msg;
        if (!toPeerId) return;

        console.log(`[Signaler] ➔ Forwarding SIGNAL_OFFER from ${currentPeerId} to ${toPeerId}`);
        const target = peers.get(toPeerId);
        const sender = peers.get(currentPeerId);
        if (target) {
          let forwardedMsg = msg;
          if (sender?.remoteIp && typeof sdp === 'object' && sdp?.sdp) {
            const unmaskedSdp = unmaskMdns(sdp.sdp, sender.remoteIp);
            forwardedMsg = {
              ...msg,
              sdp: {
                ...sdp,
                sdp: unmaskedSdp,
              },
            };
          }
          sendJson(target, forwardedMsg);
        } else {
          console.warn(`[Signaler] ⚠ Target peer ${toPeerId} not found for OFFER`);
          sendJson({ socket, peerId: currentPeerId }, {
            type: 'SIGNAL_ERROR',
            error: `Target peer ${toPeerId} not found for OFFER`,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'SIGNAL_ANSWER': {
        const { toPeerId, sdp } = msg;
        if (!toPeerId) return;

        console.log(`[Signaler] ➔ Forwarding SIGNAL_ANSWER from ${currentPeerId} to ${toPeerId}`);
        const target = peers.get(toPeerId);
        const sender = peers.get(currentPeerId);
        if (target) {
          let forwardedMsg = msg;
          if (sender?.remoteIp && typeof sdp === 'object' && sdp?.sdp) {
            const unmaskedSdp = unmaskMdns(sdp.sdp, sender.remoteIp);
            forwardedMsg = {
              ...msg,
              sdp: {
                ...sdp,
                sdp: unmaskedSdp,
              },
            };
          }
          sendJson(target, forwardedMsg);
        } else {
          console.warn(`[Signaler] ⚠ Target peer ${toPeerId} not found for ANSWER`);
          sendJson({ socket, peerId: currentPeerId }, {
            type: 'SIGNAL_ERROR',
            error: `Target peer ${toPeerId} not found for ANSWER`,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'SIGNAL_CANDIDATE': {
        const { toPeerId, candidate } = msg;
        if (!toPeerId) return;

        const target = peers.get(toPeerId);
        const sender = peers.get(currentPeerId);
        if (target) {
          let forwardedMsg = msg;
          if (sender?.remoteIp && typeof candidate === 'object' && candidate?.candidate) {
            const originalCand = candidate.candidate;
            const unmasked = unmaskMdns(originalCand, sender.remoteIp);
            if (unmasked !== originalCand) {
              console.log(`[Signaler] ⚡ Unmasked mDNS candidate from ${currentPeerId} with IP ${sender.remoteIp}`);
            }
            forwardedMsg = {
              ...msg,
              candidate: {
                ...candidate,
                candidate: unmasked,
              },
            };
          }
          console.log(`[Signaler] ➔ Forwarding SIGNAL_CANDIDATE from ${currentPeerId} to ${toPeerId}`);
          sendJson(target, forwardedMsg);
        } else {
          console.warn(`[Signaler] ⚠ Target peer ${toPeerId} not found for CANDIDATE`);
        }
        break;
      }

      case 'SIGNAL_RELAY': {
        const { toPeerId, relayMessage } = msg;
        if (!toPeerId || !relayMessage) return;

        const target = peers.get(toPeerId);
        if (target) {
          sendJson(target, {
            type: 'SIGNAL_RELAY',
            fromPeerId: currentPeerId,
            toPeerId,
            relayMessage,
            timestamp: Date.now(),
          });
        }
        break;
      }

      default:
        console.warn(`[Signaler] Unrecognized message type: ${msg.type}`);
    }
  };

  const parser = createFrameParser(handleMessage, cleanup);
  socket.on('data', parser);
  socket.on('error', (err) => {
    console.error(`[Signaler] Socket error:`, err.message);
    cleanup();
  });
  socket.on('close', cleanup);
  socket.on('end', cleanup);
});

// Helper to list available LAN addresses
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ iface: name, address: net.address });
      }
    }
  }
  return ips;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m[Signaler Error] Port ${PORT} is already in use.\x1b[0m`);
  } else {
    console.error(`[Signaler Error]`, err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`📡 NEXUS Local LAN Signaling Server active on port ${PORT}`);
  console.log('====================================================');
  console.log('Local LAN Access Addresses:');
  const ips = getLanIps();
  if (ips.length === 0) {
    console.log(`  ws://localhost:${PORT}`);
  } else {
    for (const { iface, address } of ips) {
      console.log(`  ws://${address}:${PORT}  (${iface})`);
    }
    console.log(`  ws://localhost:${PORT}`);
  }
  console.log('----------------------------------------------------');
  console.log('Teammates on the same Wi-Fi/Hotspot can connect to one of the above.');
  console.log('HTTP health check: http://localhost:' + PORT + '/status');
  console.log('====================================================');
});
