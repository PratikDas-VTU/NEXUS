/**
 * NEXUS — Autonomous Mesh Architecture & UI Decoupling Tests
 * (Phase 6 — Step 5B.6)
 * 
 * Verifies the 12 core requirements for autonomous mesh operation:
 * 1. Single stable mesh controller lifetime
 * 2. Tab unmount independence (mesh does not stop on UI unmount)
 * 3. Automatic discovery triggers deterministic lower-ID initiator
 * 4. Higher-ID receiver does not initiate (waits for incoming connection)
 * 5. Deferral when stable device ID is absent (no guessing with endpointId)
 * 6. Duplicate connection prevention
 * 7. Connection success creates one NativeTransport and registers with RelayEngine
 * 8. HELLO begins automatically through existing RelayEngine upon connection
 * 9. Connection failure cleans transport cleanly
 * 10. Incident creation triggers peer synchronization over NativeTransport
 * 11. Queued incidents persist while disconnected and sync upon later connection
 * 12. Multiple peers can coexist simultaneously over Nearby P2P Cluster
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NearbyMeshController } from '../frontend/src/services/nearbyMeshController';
import { RelayEngine } from '../networking/relayEngine';
import { MockStorageAdapter } from '../networking/mockStorageAdapter';
import type {
  INativeMeshBridge,
  NativePeerEndpoint,
  NativeConnectionStatus,
  NativeBridgeStatus,
  EndpointListenerCallbacks,
} from '../networking/nativeBridge';
import type { RelayMessage } from '../shared/protocol';

function createMockBridge(initialAvailable = true): INativeMeshBridge & {
  callbacks: EndpointListenerCallbacks;
  sentPayloads: Array<{ endpointId: string; payload: string }>;
  connectCalls: Array<{ endpointId: string; deviceName?: string }>;
  triggerFound: (ep: NativePeerEndpoint) => void;
  triggerLost: (id: string) => void;
  triggerInitiated: (ep: NativePeerEndpoint) => void;
  triggerResult: (id: string, status: NativeConnectionStatus, msg?: string) => void;
  triggerPayload: (id: string, payload: string) => void;
  triggerDisconnected: (id: string, reason?: string) => void;
} {
  const callbacks: EndpointListenerCallbacks = {};
  const sentPayloads: Array<{ endpointId: string; payload: string }> = [];
  const connectCalls: Array<{ endpointId: string; deviceName?: string }> = [];

  const bridge: any = {
    callbacks,
    sentPayloads,
    connectCalls,
    isAvailable: vi.fn(() => initialAvailable),
    checkStatus: vi.fn(async (): Promise<NativeBridgeStatus> => ({
      available: initialAvailable,
      status: initialAvailable ? 'ready' : 'browser_environment',
      platform: 'android',
    })),
    addEndpointListener: vi.fn((cbs: EndpointListenerCallbacks) => {
      Object.assign(callbacks, cbs);
      return () => {
        Object.keys(callbacks).forEach((key) => delete (callbacks as any)[key]);
      };
    }),
    startAdvertising: vi.fn(async () => true),
    stopAdvertising: vi.fn(async () => {}),
    startDiscovery: vi.fn(async () => true),
    stopDiscovery: vi.fn(async () => {}),
    connect: vi.fn(async (endpointId: string, deviceName?: string) => {
      connectCalls.push({ endpointId, deviceName });
    }),
    sendPayload: vi.fn(async (endpointId: string, payload: string) => {
      sentPayloads.push({ endpointId, payload });
      callbacks.onPayloadReceived?.(endpointId, payload);
    }),
    disconnect: vi.fn(async () => {}),
    disconnectAll: vi.fn(async () => {}),

    triggerFound(ep: NativePeerEndpoint) {
      callbacks.onEndpointFound?.(ep);
    },
    triggerLost(id: string) {
      callbacks.onEndpointLost?.(id);
    },
    triggerInitiated(ep: NativePeerEndpoint) {
      callbacks.onConnectionInitiated?.(ep);
    },
    triggerResult(id: string, status: NativeConnectionStatus, msg?: string) {
      callbacks.onConnectionResult?.(id, status, msg);
    },
    triggerPayload(id: string, payload: string) {
      if (typeof bridge.onPayloadReceived === 'function') {
        bridge.onPayloadReceived(id, payload);
      } else {
        callbacks.onPayloadReceived?.(id, payload);
      }
    },
    triggerDisconnected(id: string, reason?: string) {
      callbacks.onDisconnected?.(id, reason);
    },
  };

  return bridge;
}

describe('Autonomous Mesh Architecture (Phase 6 — Step 5B.6)', () => {
  let bridgeA: ReturnType<typeof createMockBridge>;
  let storageA: MockStorageAdapter;
  let relayA: RelayEngine;

  beforeEach(() => {
    bridgeA = createMockBridge(true);
    storageA = new MockStorageAdapter();
    relayA = new RelayEngine('node-aaa', storageA);
  });

  // ─── 1. SINGLE STABLE CONTROLLER & LIFECYCLE ───────────────────────────────
  it('1. updates local device ID without re-instantiating or dropping listeners', () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-initial',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    controller.updateLocalDeviceId('node-updated');
    expect((controller as any).localDeviceId).toBe('node-updated');
  });

  it('2. tab unmount / listener unsubscription does not stop advertising or discovery', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    await controller.startScan();
    expect(controller.isScanning).toBe(true);
    expect(controller.advertising).toBe(true);
    expect(controller.discovery).toBe(true);

    // Simulate NetworkTab mounting: subscribe to state
    const unsubscribeTab = controller.subscribe(() => {});

    // Simulate NetworkTab unmounting (e.g. user switches to Feed or Map tab)
    unsubscribeTab();

    // Verify mesh continues running uninterrupted!
    expect(controller.isScanning).toBe(true);
    expect(controller.advertising).toBe(true);
    expect(controller.discovery).toBe(true);
    expect(bridgeA.stopDiscovery).not.toHaveBeenCalled();
    expect(bridgeA.stopAdvertising).not.toHaveBeenCalled();
  });

  // ─── 3. DETERMINISTIC TIE-BREAKING AUTO-CONNECT ───────────────────────────
  it('3. lower-ID node acts as deterministic initiator and calls connect()', () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    // Remote peer has higher stable device ID 'node-bbb'
    bridgeA.triggerFound({
      endpointId: 'ep-b',
      endpointName: 'node-bbb',
      serviceId: 'nexus-mesh-v1',
    });

    expect(bridgeA.connectCalls.length).toBe(1);
    expect(bridgeA.connectCalls[0]).toEqual({
      endpointId: 'ep-b',
      deviceName: 'node-aaa',
    });
    expect(controller.nodes[0].status).toBe('CONNECTING');
  });

  it('4. higher-ID node acts as receiver and does NOT initiate connection', () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-zzz',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    // Remote peer has lower stable device ID 'node-aaa'
    bridgeA.triggerFound({
      endpointId: 'ep-a',
      endpointName: 'node-aaa',
      serviceId: 'nexus-mesh-v1',
    });

    // Higher ID must NOT initiate connect!
    expect(bridgeA.connectCalls.length).toBe(0);
    expect(controller.nodes[0].status).toBe('DISCOVERED');
  });

  it('5. defers auto-connection when stable device ID is absent (no guessing with endpointId)', () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    // Endpoint with empty endpointName (unknown stable ID)
    bridgeA.triggerFound({
      endpointId: 'ep-unknown',
      endpointName: '',
      serviceId: 'nexus-mesh-v1',
    });

    expect(bridgeA.connectCalls.length).toBe(0);
  });

  it('6. prevents duplicate connection attempts while one is already pending or connecting', () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    bridgeA.triggerFound({
      endpointId: 'ep-b',
      endpointName: 'node-bbb',
      serviceId: 'nexus-mesh-v1',
    });
    expect(bridgeA.connectCalls.length).toBe(1);

    // Repeated endpointFound while CONNECTING
    bridgeA.triggerFound({
      endpointId: 'ep-b',
      endpointName: 'node-bbb',
      serviceId: 'nexus-mesh-v1',
    });

    // Must not call connect() again!
    expect(bridgeA.connectCalls.length).toBe(1);
  });

  // ─── 7. RELAY ENGINE INTEGRATION & PROTOCOL HANDSHAKE ─────────────────────
  it('7. connection result CONNECTED creates NativeTransport and initiates HELLO via RelayEngine', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    bridgeA.triggerFound({
      endpointId: 'ep-b',
      endpointName: 'node-bbb',
      serviceId: 'nexus-mesh-v1',
    });

    // Remote accepts and Nearby connection completes
    bridgeA.triggerResult('ep-b', 'CONNECTED');

    expect(controller.nodes[0].status).toBe('CONNECTED');
    expect(controller.getActiveTransports().length).toBe(1);

    // Allow initiateHandshake async microtask to complete
    await new Promise((resolve) => setTimeout(resolve, 25));

    // RelayEngine should have registered the transport and sent HELLO
    expect(bridgeA.sentPayloads.length).toBeGreaterThan(0);
    const firstMsg: RelayMessage = JSON.parse(bridgeA.sentPayloads[0].payload);
    expect(firstMsg.type).toBe('HELLO');
    expect(firstMsg.senderDeviceId).toBe('node-aaa');

    // RelayEngine session should exist for node-bbb
    const session = relayA.getPeerSession('node-bbb');
    expect(session).toBeDefined();
    expect(session?.state).toBe('HELLO_SENT');
  });

  it('8. connection result failure cleans up transport and marks node DISCONNECTED', () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    bridgeA.triggerFound({
      endpointId: 'ep-b',
      endpointName: 'node-bbb',
      serviceId: 'nexus-mesh-v1',
    });

    bridgeA.triggerResult('ep-b', 'REJECTED', 'User rejected connection');

    expect(controller.nodes[0].status).toBe('DISCONNECTED');
    expect(controller.nodes[0].connectionError).toContain('rejected');
    expect(controller.getActiveTransports().length).toBe(0);
  });

  // ─── 9. INCIDENT CREATION & SYNCHRONIZATION ───────────────────────────────
  it('9. incident creation triggers peer sync and propagates MANIFEST across NativeTransport', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    bridgeA.triggerFound({
      endpointId: 'ep-b',
      endpointName: 'node-bbb',
      serviceId: 'nexus-mesh-v1',
    });
    bridgeA.triggerResult('ep-b', 'CONNECTED');

    const initialSentCount = bridgeA.sentPayloads.length;

    // Simulate incident creation in local storage
    await storageA.ingestRelayedIncident({
      incidentId: 'inc-test-101',
      senderDeviceId: 'node-aaa',
      timestamp: Date.now(),
      type: 'medical',
      priority: 'P0',
      status: 'reported',
      location: { latitude: 13.2, longitude: 80.0 },
      peopleAffected: 1,
      version: 1,
      ttl: 3600,
      hopCount: 0,
    });

    // Trigger peer sync (as done by ServiceContext.createIncident)
    await relayA.triggerPeerSync();

    // Verify MANIFEST message was dispatched across bridgeA
    expect(bridgeA.sentPayloads.length).toBeGreaterThan(initialSentCount);
    const latestPayload: RelayMessage = JSON.parse(
      bridgeA.sentPayloads[bridgeA.sentPayloads.length - 1].payload
    );
    expect(latestPayload.type).toBe('MANIFEST');
    if (latestPayload.type === 'MANIFEST') {
      expect(latestPayload.items.some((item) => item.incidentId === 'inc-test-101')).toBe(true);
    }
  });

  // ─── 10. MULTIPLE PEERS COEXISTENCE ───────────────────────────────────────
  it('10. multiple peers can coexist simultaneously over Nearby P2P Cluster', () => {
    const controller = new NearbyMeshController({
      localDeviceId: 'node-mid',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    // Peer 1 (node-zzz, higher ID -> waits for node-mid to initiate)
    bridgeA.triggerFound({
      endpointId: 'ep-zzz',
      endpointName: 'node-zzz',
      serviceId: 'nexus-mesh-v1',
    });
    expect(bridgeA.connectCalls.some((c) => c.endpointId === 'ep-zzz')).toBe(true);
    bridgeA.triggerResult('ep-zzz', 'CONNECTED');

    // Peer 2 (node-aaa, lower ID -> node-aaa initiates, node-mid receives)
    bridgeA.triggerFound({
      endpointId: 'ep-aaa',
      endpointName: 'node-aaa',
      serviceId: 'nexus-mesh-v1',
    });
    // node-mid did not call connect for ep-aaa because node-mid > node-aaa
    expect(bridgeA.connectCalls.some((c) => c.endpointId === 'ep-aaa')).toBe(false);

    // Incoming connection initiated from node-aaa
    bridgeA.triggerInitiated({
      endpointId: 'ep-aaa',
      endpointName: 'node-aaa',
      serviceId: 'nexus-mesh-v1',
    });
    bridgeA.triggerResult('ep-aaa', 'CONNECTED');

    // Both transports should exist concurrently
    expect(controller.getActiveTransports().length).toBe(2);
    expect(controller.nodes.filter((n) => n.status === 'CONNECTED').length).toBe(2);

    expect(relayA.getPeerSession('node-zzz')).toBeDefined();
    expect(relayA.getPeerSession('node-aaa')).toBeDefined();
  });

  // ─── 11. OFFLINE OUTBOX STORE-CARRY-FORWARD ───────────────────────────────
  it('11. disconnected incident remains queued and later connection synchronizes queued incident via MANIFEST', async () => {
    // 1. Device is completely offline / disconnected initially
    await storageA.ingestRelayedIncident({
      incidentId: 'inc-offline-999',
      senderDeviceId: 'node-aaa',
      timestamp: Date.now(),
      type: 'safety',
      priority: 'P1',
      status: 'stored',
      location: { latitude: 13.2384, longitude: 80.0094 },
      peopleAffected: 2,
      version: 1,
      ttl: 7200,
      hopCount: 0,
    });

    const manifestBefore = await storageA.getManifest();
    expect(manifestBefore.some((m) => m.incidentId === 'inc-offline-999')).toBe(true);

    const controller = new NearbyMeshController({
      localDeviceId: 'node-aaa',
      bridge: bridgeA,
      relayEngine: relayA,
      autoConnect: true,
    });

    // 2. Device later walks into physical proximity with Node B
    bridgeA.triggerFound({
      endpointId: 'ep-b',
      endpointName: 'node-bbb',
      serviceId: 'nexus-mesh-v1',
    });
    bridgeA.triggerResult('ep-b', 'CONNECTED');

    await new Promise((resolve) => setTimeout(resolve, 25));

    // 3. Node B replies with HELLO
    bridgeA.triggerPayload(
      'ep-b',
      JSON.stringify({
        type: 'HELLO',
        senderDeviceId: 'node-bbb',
        protocolVersion: 1,
        sessionId: 'ses-b',
        timestamp: Date.now(),
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 25));

    // 4. Node A must have transmitted its local MANIFEST containing the offline incident!
    const manifestMsg = bridgeA.sentPayloads
      .map((p) => JSON.parse(p.payload) as RelayMessage)
      .find((msg) => msg.type === 'MANIFEST');

    expect(manifestMsg).toBeDefined();
    if (manifestMsg && manifestMsg.type === 'MANIFEST') {
      expect(manifestMsg.items.some((i) => i.incidentId === 'inc-offline-999')).toBe(true);
    }
  });
});
