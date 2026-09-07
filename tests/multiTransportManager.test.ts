import { describe, it, expect, vi } from 'vitest';
import {
  MultiTransportManager,
  DEFAULT_TRANSPORT_PRIORITIES,
} from '../networking/multiTransportManager';
import { RelayEngine } from '../networking/relayEngine';
import { MockStorageAdapter } from '../networking/mockStorageAdapter';
import type { NexusTransport, TransportType } from '../shared/interfaces';
import type { RelayMessage } from '../shared/protocol';

/** Helper to create mock NexusTransports with controllable state */
function createMockTransport(
  remotePeerId: string,
  transportType: TransportType,
  initiallyOpen = true,
  priority?: number
): NexusTransport & {
  isOpenState: boolean;
  messageHandlers: Array<(msg: RelayMessage) => void>;
  closeHandlers: Array<(reason?: string) => void>;
  sentMessages: RelayMessage[];
  setOpen: (open: boolean) => void;
  emitIncomingMessage: (msg: RelayMessage) => void;
  emitClose: (reason?: string) => void;
} {
  const messageHandlers: Array<(msg: RelayMessage) => void> = [];
  const closeHandlers: Array<(reason?: string) => void> = [];
  const sentMessages: RelayMessage[] = [];
  let isOpenState = initiallyOpen;

  const transport: any = {
    remotePeerId,
    transportType,
    isOpenState,
    messageHandlers,
    closeHandlers,
    sentMessages,
    ...(priority !== undefined ? { priority } : {}),

    isOpen: () => transport.isOpenState,

    send: vi.fn(async (msg: RelayMessage) => {
      if (!transport.isOpen()) {
        throw new Error(`Cannot send on closed transport: ${transportType}`);
      }
      transport.sentMessages.push(msg);
    }),

    onMessage: (handler: (msg: RelayMessage) => void) => {
      messageHandlers.push(handler);
    },

    onClose: (handler: (reason?: string) => void) => {
      closeHandlers.push(handler);
    },

    close: vi.fn(() => {
      transport.isOpenState = false;
      for (const h of closeHandlers) {
        h('Closed by test');
      }
    }),

    setOpen: (open: boolean) => {
      transport.isOpenState = open;
    },

    emitIncomingMessage: (msg: RelayMessage) => {
      for (const h of messageHandlers) {
        h(msg);
      }
    },

    emitClose: (reason?: string) => {
      transport.isOpenState = false;
      for (const h of closeHandlers) {
        h(reason);
      }
    },
  };

  return transport;
}

describe('Phase 4: Multi-Transport Connection Manager Tests', () => {
  // ─── TEST 1: SINGLE TRANSPORT ─────────────────────────────────────────────
  it('Test 1 — Single transport: selects WebRTC as preferred when open', () => {
    const manager = new MultiTransportManager();
    const rtc = createMockTransport('peer-B', 'webrtc', true);

    manager.registerTransport(rtc);

    const preferred = manager.getPreferredTransport('peer-B');
    expect(preferred).toBeDefined();
    expect(preferred?.transportType).toBe('webrtc');
    expect(preferred?.remotePeerId).toBe('peer-B');
  });

  // ─── TEST 2: TWO TRANSPORTS ───────────────────────────────────────────────
  it('Test 2 — Two transports: selects highest-priority WebRTC (100) over WebSocket (50)', () => {
    const manager = new MultiTransportManager();
    const rtc = createMockTransport('peer-B', 'webrtc', true);
    const ws = createMockTransport('peer-B', 'websocket', true);

    manager.registerTransport(ws);
    manager.registerTransport(rtc);

    const preferred = manager.getPreferredTransport('peer-B');
    expect(preferred).toBeDefined();
    expect(preferred?.transportType).toBe('webrtc');
    expect(manager.getTransports('peer-B').length).toBe(2);
  });

  // ─── TEST 3: PRIMARY DISAPPEARS ───────────────────────────────────────────
  it('Test 3 — Primary disappears: falls back to WebSocket when WebRTC is closed', () => {
    const manager = new MultiTransportManager();
    const rtc = createMockTransport('peer-B', 'webrtc', false); // CLOSED
    const ws = createMockTransport('peer-B', 'websocket', true); // OPEN

    manager.registerTransport(rtc);
    manager.registerTransport(ws);

    const preferred = manager.getPreferredTransport('peer-B');
    expect(preferred).toBeDefined();
    expect(preferred?.transportType).toBe('websocket');
  });

  // ─── TEST 4: ONLY FALLBACK ────────────────────────────────────────────────
  it('Test 4 — Only fallback: selects WebSocket when it is the only transport', () => {
    const manager = new MultiTransportManager();
    const ws = createMockTransport('peer-B', 'websocket', true);

    manager.registerTransport(ws);

    const preferred = manager.getPreferredTransport('peer-B');
    expect(preferred).toBeDefined();
    expect(preferred?.transportType).toBe('websocket');
  });

  // ─── TEST 5: BOTH UNAVAILABLE ─────────────────────────────────────────────
  it('Test 5 — Both unavailable: returns undefined when both transports are closed', () => {
    const manager = new MultiTransportManager();
    const rtc = createMockTransport('peer-B', 'webrtc', false);
    const ws = createMockTransport('peer-B', 'websocket', false);

    manager.registerTransport(rtc);
    manager.registerTransport(ws);

    const preferred = manager.getPreferredTransport('peer-B');
    expect(preferred).toBeUndefined();
  });

  // ─── TEST 6: MULTIPLE TRANSPORTS RETAINED ─────────────────────────────────
  it('Test 6 — Multiple transports retained: retains both transports simultaneously without premature shutdown', () => {
    const manager = new MultiTransportManager();
    const rtc = createMockTransport('peer-B', 'webrtc', true);
    const ws = createMockTransport('peer-B', 'websocket', true);

    manager.registerTransport(rtc);
    manager.registerTransport(ws);

    const transports = manager.getTransports('peer-B');
    expect(transports.length).toBe(2);
    expect(manager.hasTransport('peer-B', 'webrtc')).toBe(true);
    expect(manager.hasTransport('peer-B', 'websocket')).toBe(true);

    // Lower priority transport is NOT closed
    expect(ws.isOpen()).toBe(true);
    expect(ws.close).not.toHaveBeenCalled();
  });

  // ─── TEST 7: NO DUPLICATE SENDS ───────────────────────────────────────────
  it('Test 7 — No duplicate sends: selects exactly ONE preferred transport for a send operation', async () => {
    const manager = new MultiTransportManager();
    const rtc = createMockTransport('peer-B', 'webrtc', true);
    const ws = createMockTransport('peer-B', 'websocket', true);

    manager.registerTransport(rtc);
    manager.registerTransport(ws);

    const dummyMsg: RelayMessage = {
      type: 'HELLO',
      protocolVersion: 1,
      senderDeviceId: 'DEV-A',
      sessionId: 'ses-1',
      timestamp: Date.now(),
    };

    // Send via manager API
    await manager.send('peer-B', dummyMsg);

    // Only WebRTC should have received the send call
    expect(rtc.send).toHaveBeenCalledTimes(1);
    expect(rtc.sentMessages.length).toBe(1);
    expect(ws.send).toHaveBeenCalledTimes(0);
    expect(ws.sentMessages.length).toBe(0);

    // If WebRTC closes, the next send goes exclusively to WebSocket
    rtc.setOpen(false);
    await manager.send('peer-B', dummyMsg);

    expect(rtc.send).toHaveBeenCalledTimes(1); // Unchanged
    expect(ws.send).toHaveBeenCalledTimes(1); // Called once now
    expect(ws.sentMessages.length).toBe(1);
  });

  // ─── TEST 8: FUTURE TRANSPORT COMPATIBILITY (MOCK BLE) ─────────────────────
  it('Test 8 — Future transport compatibility: registers mock BLE and honors priority ranking', () => {
    const manager = new MultiTransportManager();

    // Default BLE priority is 30, WebSocket is 50, WebRTC is 100
    expect(DEFAULT_TRANSPORT_PRIORITIES['ble']).toBe(30);

    const ble = createMockTransport('peer-B', 'ble', true);
    const ws = createMockTransport('peer-B', 'websocket', true);

    manager.registerTransport(ble);
    manager.registerTransport(ws);

    // WebSocket (50) > BLE (30)
    expect(manager.getPreferredTransport('peer-B')?.transportType).toBe('websocket');

    // If custom priority makes BLE higher priority (e.g., local offline priority mode)
    const customManager = new MultiTransportManager({
      priorities: {
        ble: 200, // Custom high priority
      },
    });
    customManager.registerTransport(ble);
    customManager.registerTransport(ws);

    expect(customManager.getPreferredTransport('peer-B')?.transportType).toBe('ble');
  });

  // ─── ADDITIONAL INTEGRATION & LIFECYCLE TESTS ─────────────────────────────
  describe('ManagedPeerTransport & RelayEngine Integration', () => {
    it('provides a unified ManagedPeerTransport that implements NexusTransport', async () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-C', 'webrtc', true);
      manager.registerTransport(rtc);

      const managed = manager.getPeerTransport('peer-C');
      expect(managed.remotePeerId).toBe('peer-C');
      expect(managed.transportType).toBe('webrtc');
      expect(managed.isOpen()).toBe(true);

      let receivedMsg: RelayMessage | null = null;
      managed.onMessage((msg) => {
        receivedMsg = msg;
      });

      const testMsg: RelayMessage = {
        type: 'ACK',
        protocolVersion: 1,
        senderDeviceId: 'DEV-C',
        sessionId: 'ses-1',
        acceptedIncidentIds: [],
        timestamp: Date.now(),
      };

      // Inbound message through underlying transport forwards to managed transport listener
      rtc.emitIncomingMessage(testMsg);
      expect(receivedMsg).toBe(testMsg);
    });

    it('keeps RelayEngine session alive when primary transport drops and secondary remains', async () => {
      const storage = new MockStorageAdapter();
      const manager = new MultiTransportManager();
      const engine = new RelayEngine('DEV-LOCAL', storage, manager);

      const rtc = createMockTransport('peer-D', 'webrtc', true);
      const ws = createMockTransport('peer-D', 'websocket', true);

      // Register WebRTC -> establishes session and sends HELLO
      engine.registerTransport(rtc);

      const status1 = engine.getStatus();
      expect(status1.activePeers.length).toBe(1);
      expect(status1.activePeers[0].peerId).toBe('peer-D');

      // Register WebSocket -> tracked in manager, does NOT duplicate session in RelayEngine
      engine.registerTransport(ws);
      const status2 = engine.getStatus();
      expect(status2.activePeers.length).toBe(1);

      // WebRTC closes
      rtc.emitClose('WebRTC network disconnect');

      // Peer remains connected in RelayEngine via WebSocket!
      const status3 = engine.getStatus();
      expect(status3.activePeers.length).toBe(1);
      expect(manager.getPreferredTransport('peer-D')?.transportType).toBe('websocket');

      // Both close -> now peer disconnects
      ws.emitClose('WebSocket disconnect');
      const status4 = engine.getStatus();
      expect(status4.activePeers.length).toBe(0);
    });

    it('removes specific transport types cleanly via removeTransport(peerId, type)', () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-E', 'webrtc', true);
      const ws = createMockTransport('peer-E', 'websocket', true);

      manager.registerTransport(rtc);
      manager.registerTransport(ws);
      expect(manager.getTransports('peer-E').length).toBe(2);

      manager.removeTransport('peer-E', 'webrtc');
      expect(manager.getTransports('peer-E').length).toBe(1);
      expect(manager.hasTransport('peer-E', 'webrtc')).toBe(false);
      expect(manager.hasTransport('peer-E', 'websocket')).toBe(true);
      expect(manager.getPreferredTransport('peer-E')?.transportType).toBe('websocket');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: TRANSPORT HEALTH & AUTOMATIC PATH SWITCHING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Phase 5: Transport Health & Automatic Path Switching', () => {
    const dummyMsg: RelayMessage = {
      type: 'HELLO',
      protocolVersion: 1,
      senderDeviceId: 'DEV-TEST',
      sessionId: 'ses-phase5',
      timestamp: Date.now(),
    };

    // ─── TEST 1: HEALTHY PRIORITY ───────────────────────────────────────────
    it('Phase 5 Test 1 — Healthy priority: WebRTC healthy + WebSocket healthy -> WebRTC selected', () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      manager.registerTransport(rtc);
      manager.registerTransport(ws);

      expect(manager.isHealthy('peer-P5', 'webrtc')).toBe(true);
      expect(manager.isHealthy('peer-P5', 'websocket')).toBe(true);

      const preferred = manager.getPreferredTransport('peer-P5');
      expect(preferred?.transportType).toBe('webrtc');
    });

    // ─── TEST 2: WEBRTC FAILURES ────────────────────────────────────────────
    it('Phase 5 Test 2 — WebRTC failures: 3 consecutive send failures mark WebRTC unhealthy -> WebSocket selected', async () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      // Make WebRTC fail on send
      rtc.send = vi.fn(async () => {
        throw new Error('DataChannel buffer clogged / send failure');
      });

      manager.registerTransport(rtc);
      manager.registerTransport(ws);

      // Send 3 messages: each time WebRTC fails, manager retries and succeeds via WebSocket
      await manager.send('peer-P5', dummyMsg);
      expect(manager.getHealth('peer-P5', 'webrtc')?.consecutiveFailures).toBe(1);

      await manager.send('peer-P5', dummyMsg);
      expect(manager.getHealth('peer-P5', 'webrtc')?.consecutiveFailures).toBe(2);

      await manager.send('peer-P5', dummyMsg);
      expect(manager.getHealth('peer-P5', 'webrtc')?.consecutiveFailures).toBe(3);
      expect(manager.isHealthy('peer-P5', 'webrtc')).toBe(false);

      // Now WebRTC is unhealthy -> preferred switches to WebSocket directly
      const preferred = manager.getPreferredTransport('peer-P5');
      expect(preferred?.transportType).toBe('websocket');
    });

    // ─── TEST 3: AUTOMATIC RETRY ────────────────────────────────────────────
    it('Phase 5 Test 3 — Automatic retry: WebRTC send fails -> same message retried once through WebSocket', async () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      rtc.send = vi.fn(async () => {
        throw new Error('Immediate RTC drop');
      });

      manager.registerTransport(rtc);
      manager.registerTransport(ws);

      await manager.send('peer-P5', dummyMsg);

      // WebRTC was attempted once and failed
      expect(rtc.send).toHaveBeenCalledTimes(1);
      // WebSocket was called as fallback retry for the exact same message
      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(ws.sentMessages[0]).toBe(dummyMsg);
    });

    // ─── TEST 4: NO DUPLICATE SUCCESSFUL SENDS ──────────────────────────────
    it('Phase 5 Test 4 — No duplicate successful sends: when WebRTC succeeds, WebSocket does NOT receive the message', async () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      manager.registerTransport(rtc);
      manager.registerTransport(ws);

      await manager.send('peer-P5', dummyMsg);

      expect(rtc.send).toHaveBeenCalledTimes(1);
      expect(ws.send).toHaveBeenCalledTimes(0);
      expect(ws.sentMessages.length).toBe(0);
    });

    // ─── TEST 5: BOTH TRANSPORTS UNHEALTHY ──────────────────────────────────
    it('Phase 5 Test 5 — Both transports unhealthy: send fails normally when all transports are unhealthy', async () => {
      const manager = new MultiTransportManager({ maxConsecutiveFailures: 2 });
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      rtc.send = vi.fn(async () => {
        throw new Error('RTC dead');
      });
      ws.send = vi.fn(async () => {
        throw new Error('WS dead');
      });

      manager.registerTransport(rtc);
      manager.registerTransport(ws);

      // Attempt 1: RTC fails, retries WS which also fails -> throws
      await expect(manager.send('peer-P5', dummyMsg)).rejects.toThrow('WS dead');

      // Attempt 2: RTC fails (now 2 failures, unhealthy), retries WS (now 2 failures, unhealthy) -> throws
      await expect(manager.send('peer-P5', dummyMsg)).rejects.toThrow('WS dead');

      // Both are now unhealthy
      expect(manager.isHealthy('peer-P5', 'webrtc')).toBe(false);
      expect(manager.isHealthy('peer-P5', 'websocket')).toBe(false);
      expect(manager.getPreferredTransport('peer-P5')).toBeUndefined();

      // Attempt 3: No healthy transport available -> fails cleanly
      await expect(manager.send('peer-P5', dummyMsg)).rejects.toThrow(
        /No open healthy transport available/
      );
    });

    // ─── TEST 6: RECOVERY ───────────────────────────────────────────────────
    it('Phase 5 Test 6 — Recovery: WebRTC unhealthy -> WebSocket preferred; WebRTC recovers -> WebRTC preferred again', async () => {
      const manager = new MultiTransportManager({ maxConsecutiveFailures: 1 });
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      rtc.send = vi.fn(async () => {
        throw new Error('Temporary glitch');
      });

      manager.registerTransport(rtc);
      manager.registerTransport(ws);

      // Cause RTC failure
      await manager.send('peer-P5', dummyMsg);
      expect(manager.isHealthy('peer-P5', 'webrtc')).toBe(false);
      expect(manager.getPreferredTransport('peer-P5')?.transportType).toBe('websocket');

      // WebRTC recovers (e.g. re-connection or mark healthy)
      rtc.send = vi.fn(async (msg) => {
        rtc.sentMessages.push(msg);
      });
      manager.markTransportHealthy('peer-P5', 'webrtc');

      expect(manager.isHealthy('peer-P5', 'webrtc')).toBe(true);
      expect(manager.getPreferredTransport('peer-P5')?.transportType).toBe('webrtc');

      // Send now uses WebRTC
      await manager.send('peer-P5', dummyMsg);
      expect(rtc.send).toHaveBeenCalledTimes(1);
    });

    // ─── TEST 7: TRANSPORT DISAPPEARANCE ────────────────────────────────────
    it('Phase 5 Test 7 — Transport disappearance: WebRTC closes -> WebSocket immediately preferred', () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      manager.registerTransport(rtc);
      manager.registerTransport(ws);
      expect(manager.getPreferredTransport('peer-P5')?.transportType).toBe('webrtc');

      // WebRTC drops/closes
      rtc.emitClose('Ice connection failed');

      expect(manager.getPreferredTransport('peer-P5')?.transportType).toBe('websocket');
    });

    // ─── TEST 8: MULTIPLE TRANSPORT COEXISTENCE ─────────────────────────────
    it('Phase 5 Test 8 — Multiple transport coexistence: retains both transports registered in health tracking', () => {
      const manager = new MultiTransportManager();
      const rtc = createMockTransport('peer-P5', 'webrtc', true);
      const ws = createMockTransport('peer-P5', 'websocket', true);

      manager.registerTransport(rtc);
      manager.registerTransport(ws);

      const allTransports = manager.getTransports('peer-P5');
      expect(allTransports.length).toBe(2);

      const health = manager.getAllHealth('peer-P5');
      expect(health.webrtc).toBeDefined();
      expect(health.websocket).toBeDefined();
      expect(health.webrtc.isHealthy).toBe(true);
      expect(health.websocket.isHealthy).toBe(true);
    });
  });
});
