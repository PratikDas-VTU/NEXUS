import { describe, it, expect, vi } from 'vitest';
import { NativeTransport } from '../networking/nativeTransport';
import type { INativeMeshBridge, NativeConnectionStatus } from '../networking/nativeBridge';
import type { NexusTransport } from '../shared/interfaces';
import type { RelayMessage } from '../shared/protocol';

function createMockBridge(): INativeMeshBridge & {
  sentPayloads: Array<{ endpointId: string; payload: string }>;
  disconnectedEndpoints: string[];
} {
  const sentPayloads: Array<{ endpointId: string; payload: string }> = [];
  const disconnectedEndpoints: string[] = [];

  const bridge: INativeMeshBridge & {
    sentPayloads: Array<{ endpointId: string; payload: string }>;
    disconnectedEndpoints: string[];
  } = {
    sentPayloads,
    disconnectedEndpoints,
    isAvailable: () => true,
    startAdvertising: async () => true,
    stopAdvertising: async () => {},
    startDiscovery: async () => true,
    stopDiscovery: async () => {},
    connect: async () => {},
    sendPayload: vi.fn(async (endpointId: string, payload: string) => {
      sentPayloads.push({ endpointId, payload });
    }),
    disconnect: vi.fn(async (endpointId: string) => {
      disconnectedEndpoints.push(endpointId);
    }),
    disconnectAll: async () => {},
  };

  return bridge;
}

describe('Phase 6 — Step 2: NativeTransport Implementation Tests', () => {
  const dummyMsg: RelayMessage = {
    type: 'HELLO',
    protocolVersion: 1,
    senderDeviceId: 'DEV-ORIGIN',
    sessionId: 'ses-native-1',
    timestamp: 1234567890,
  };

  // ─── TEST A: SATISFIES NEXUSTRANSPORT CONTRACT ─────────────────────────────
  it('Requirement A — NativeTransport satisfies NexusTransport contract', () => {
    const bridge = createMockBridge();
    const transport: NexusTransport = new NativeTransport(bridge, 'ep-1', 'peer-1', {
      initiallyOpen: true,
    });

    expect(transport.transportType).toBe('nearby');
    expect(transport.remotePeerId).toBe('peer-1');
    expect(transport.isOpen()).toBe(true);
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.onMessage).toBe('function');
    expect(typeof transport.onClose).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  // ─── TEST B: SEND SERIALIZES AND FORWARDS RELAYMESSAGE ─────────────────────
  it('Requirement B — send() serializes and forwards RelayMessage correctly via bridge.sendPayload', async () => {
    const bridge = createMockBridge();
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: true });

    await transport.send(dummyMsg);

    expect(bridge.sendPayload).toHaveBeenCalledTimes(1);
    expect(bridge.sentPayloads.length).toBe(1);
    expect(bridge.sentPayloads[0].endpointId).toBe('ep-1');

    const deserialized = JSON.parse(bridge.sentPayloads[0].payload);
    expect(deserialized).toEqual(dummyMsg);
  });

  it('Requirement B (closed guard) — send() rejects if transport is not open', async () => {
    const bridge = createMockBridge();
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: false });

    await expect(transport.send(dummyMsg)).rejects.toThrow(
      /Cannot send on closed transport/
    );
    expect(bridge.sendPayload).not.toHaveBeenCalled();
  });

  // ─── TEST C: INCOMING PAYLOAD PARSED AND DELIVERED ─────────────────────────
  it('Requirement C — Incoming payload is parsed and delivered through onMessage()', () => {
    const bridge = createMockBridge();
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: true });

    let receivedMsg: RelayMessage | null = null;
    transport.onMessage((msg) => {
      receivedMsg = msg;
    });

    const payloadStr = JSON.stringify(dummyMsg);
    bridge.onPayloadReceived?.('ep-1', payloadStr);

    expect(receivedMsg).toEqual(dummyMsg);
  });

  // ─── TEST D: PAYLOAD FROM ANOTHER ENDPOINT IS IGNORED ──────────────────────
  it('Requirement D — Payload from another endpoint is ignored', () => {
    const bridge = createMockBridge();
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: true });

    let receivedMsg: RelayMessage | null = null;
    transport.onMessage((msg) => {
      receivedMsg = msg;
    });

    const otherMsg: RelayMessage = {
      ...dummyMsg,
      sessionId: 'other-session',
    };

    // Dispatch payload for a different endpoint 'ep-999'
    bridge.onPayloadReceived?.('ep-999', JSON.stringify(otherMsg));

    expect(receivedMsg).toBeNull();
  });

  // ─── TEST E: MALFORMED PAYLOAD DOES NOT CRASH ──────────────────────────────
  it('Requirement E — Malformed payload does not crash the transport', () => {
    const bridge = createMockBridge();
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: true });

    let receivedCount = 0;
    transport.onMessage(() => {
      receivedCount++;
    });

    // Send broken non-JSON strings
    expect(() => {
      bridge.onPayloadReceived?.('ep-1', 'NOT_VALID_JSON{:::');
      bridge.onPayloadReceived?.('ep-1', '');
      bridge.onPayloadReceived?.('ep-1', '12345'); // JSON primitive, not RelayMessage
    }).not.toThrow();

    expect(receivedCount).toBe(0);
  });

  // ─── TEST F: CONNECTED CHANGES TRANSPORT TO OPEN ───────────────────────────
  it('Requirement F — CONNECTED status changes transport to open (and initial state is closed)', () => {
    const bridge = createMockBridge();
    // Default initial state is false
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1');
    expect(transport.isOpen()).toBe(false);

    // Native connection succeeds
    bridge.onConnectionResult?.('ep-1', 'CONNECTED');
    expect(transport.isOpen()).toBe(true);
  });

  // ─── TEST G: REJECTED/ERROR/DISCONNECTED MARKS CLOSED ──────────────────────
  it('Requirement G — REJECTED / ERROR / DISCONNECTED changes transport to closed', () => {
    const bridge = createMockBridge();
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: true });
    expect(transport.isOpen()).toBe(true);

    let closeReason = '';
    transport.onClose((reason) => {
      closeReason = reason || '';
    });

    bridge.onConnectionResult?.('ep-1', 'ERROR', 'Bluetooth link timeout');

    expect(transport.isOpen()).toBe(false);
    expect(closeReason).toContain('Bluetooth link timeout');
  });

  // ─── TEST H: ONCLOSE NOTIFIES EXACTLY ONCE ─────────────────────────────────
  it('Requirement H — onClose handler is called correctly and exactly once per disconnect', () => {
    const bridge = createMockBridge();
    const transport = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: true });

    let closeCount = 0;
    transport.onClose(() => {
      closeCount++;
    });

    // Trigger disconnect via bridge
    bridge.onDisconnected?.('ep-1', 'Radio link lost');
    // Subsequent redundant bridge calls
    bridge.onDisconnected?.('ep-1', 'Radio link lost again');
    transport.close();

    expect(closeCount).toBe(1);
    expect(transport.isOpen()).toBe(false);
  });

  // ─── TEST I: CLOSE DISCONNECTS ONLY TARGET ENDPOINT ────────────────────────
  it('Requirement I — close() disconnects only the target endpoint', () => {
    const bridge = createMockBridge();
    const transport1 = new NativeTransport(bridge, 'ep-1', 'peer-1', { initiallyOpen: true });
    const transport2 = new NativeTransport(bridge, 'ep-2', 'peer-2', { initiallyOpen: true });

    transport1.close('User initiated disconnect');

    expect(bridge.disconnect).toHaveBeenCalledWith('ep-1');
    expect(bridge.disconnectedEndpoints).toContain('ep-1');
    expect(bridge.disconnectedEndpoints).not.toContain('ep-2');

    expect(transport1.isOpen()).toBe(false);
    expect(transport2.isOpen()).toBe(true);
  });

  // ─── TEST J: MULTIPLE INSTANCES DO NOT INTERFERE ───────────────────────────
  it('Requirement J — Multiple NativeTransport instances for different endpoints do not interfere with each other', async () => {
    const bridge = createMockBridge();

    const transportA = new NativeTransport(bridge, 'ep-A', 'peer-A', { initiallyOpen: true });
    const transportB = new NativeTransport(bridge, 'ep-B', 'peer-B', { initiallyOpen: true });

    const receivedA: RelayMessage[] = [];
    const receivedB: RelayMessage[] = [];

    transportA.onMessage((msg) => receivedA.push(msg));
    transportB.onMessage((msg) => receivedB.push(msg));

    const msgForA: RelayMessage = { ...dummyMsg, sessionId: 'ses-A' };
    const msgForB: RelayMessage = { ...dummyMsg, sessionId: 'ses-B' };

    // Bridge receives payloads for A and B
    bridge.onPayloadReceived?.('ep-A', JSON.stringify(msgForA));
    bridge.onPayloadReceived?.('ep-B', JSON.stringify(msgForB));

    expect(receivedA.length).toBe(1);
    expect(receivedA[0].sessionId).toBe('ses-A');

    expect(receivedB.length).toBe(1);
    expect(receivedB[0].sessionId).toBe('ses-B');

    // Transport A closes, transport B must remain open and operational
    transportA.close();
    expect(transportA.isOpen()).toBe(false);
    expect(transportB.isOpen()).toBe(true);

    const msg2ForB: RelayMessage = { ...dummyMsg, sessionId: 'ses-B2' };
    bridge.onPayloadReceived?.('ep-B', JSON.stringify(msg2ForB));
    expect(receivedB.length).toBe(2);
    expect(receivedB[1].sessionId).toBe('ses-B2');
  });
});
