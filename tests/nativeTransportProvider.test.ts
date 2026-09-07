import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NativeTransportProvider,
  DEFAULT_NEXUS_SERVICE_ID,
  DEFAULT_NATIVE_PRIORITY,
} from '../networking/nativeTransportProvider';
import type { INexusTransportProvider } from '../networking/transportProvider';
import type {
  INativeMeshBridge,
  NativePeerEndpoint,
  NativeConnectionStatus,
} from '../networking/nativeBridge';
import type { NexusTransport } from '../shared/interfaces';

function createMockBridge(isAvailable = true): INativeMeshBridge & {
  isAdvertising: boolean;
  isDiscovering: boolean;
  advertisedName?: string;
  advertisedServiceId?: string;
  discoveredServiceId?: string;
  connectedEndpoints: string[];
  disconnectedEndpoints: string[];
  sentPayloads: Array<{ endpointId: string; payload: string }>;
  simulateEndpointFound: (endpoint: NativePeerEndpoint) => void;
  simulateEndpointLost: (endpointId: string) => void;
  simulateConnectionResult: (
    endpointId: string,
    status: NativeConnectionStatus,
    msg?: string
  ) => void;
  simulateDisconnected: (endpointId: string, reason?: string) => void;
} {
  const connectedEndpoints: string[] = [];
  const disconnectedEndpoints: string[] = [];
  const sentPayloads: Array<{ endpointId: string; payload: string }> = [];

  const bridge: any = {
    isAvailable: () => isAvailable,
    isAdvertising: false,
    isDiscovering: false,
    connectedEndpoints,
    disconnectedEndpoints,
    sentPayloads,

    startAdvertising: vi.fn(async (deviceName: string, serviceId: string) => {
      bridge.isAdvertising = true;
      bridge.advertisedName = deviceName;
      bridge.advertisedServiceId = serviceId;
      return true;
    }),

    stopAdvertising: vi.fn(async () => {
      bridge.isAdvertising = false;
    }),

    startDiscovery: vi.fn(async (serviceId: string) => {
      bridge.isDiscovering = true;
      bridge.discoveredServiceId = serviceId;
      return true;
    }),

    stopDiscovery: vi.fn(async () => {
      bridge.isDiscovering = false;
    }),

    connect: vi.fn(async (endpointId: string) => {
      connectedEndpoints.push(endpointId);
    }),

    sendPayload: vi.fn(async (endpointId: string, payload: string) => {
      sentPayloads.push({ endpointId, payload });
    }),

    disconnect: vi.fn(async (endpointId: string) => {
      disconnectedEndpoints.push(endpointId);
    }),

    disconnectAll: vi.fn(async () => {
      bridge.isAdvertising = false;
      bridge.isDiscovering = false;
    }),

    simulateEndpointFound: (endpoint: NativePeerEndpoint) => {
      bridge.onEndpointFound?.(endpoint);
    },

    simulateEndpointLost: (endpointId: string) => {
      bridge.onEndpointLost?.(endpointId);
    },

    simulateConnectionResult: (
      endpointId: string,
      status: NativeConnectionStatus,
      msg?: string
    ) => {
      bridge.onConnectionResult?.(endpointId, status, msg);
    },

    simulateDisconnected: (endpointId: string, reason?: string) => {
      bridge.onDisconnected?.(endpointId, reason);
    },
  };

  return bridge;
}

describe('Phase 6 — Step 3: NativeTransportProvider Tests', () => {
  let bridge: ReturnType<typeof createMockBridge>;
  let provider: NativeTransportProvider;

  beforeEach(() => {
    bridge = createMockBridge(true);
    provider = new NativeTransportProvider({
      bridge,
      localDeviceId: 'DEV-LOCAL',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
      priority: DEFAULT_NATIVE_PRIORITY,
    });
  });

  // ─── TEST A: SATISFIES INEXUSTRANSPORTPROVIDER ────────────────────────────
  it('Test A — Provider satisfies INexusTransportProvider contract', () => {
    const p: INexusTransportProvider = provider;

    expect(p.id).toBe('nearby');
    expect(p.name).toBe('Native Nearby Connections');
    expect(p.transportType).toBe('nearby');
    expect(p.priority).toBe(80);
    expect(p.isSupported()).toBe(true);
    expect(typeof p.start).toBe('function');
    expect(typeof p.stop).toBe('function');
    expect(typeof p.onTransportReady).toBe('function');
  });

  // ─── TEST B: STARTS ADVERTISING ───────────────────────────────────────────
  it('Test B — Provider starts advertising on the correct serviceId', async () => {
    await provider.start();

    expect(bridge.startAdvertising).toHaveBeenCalledWith('DEV-LOCAL', DEFAULT_NEXUS_SERVICE_ID);
    expect(bridge.isAdvertising).toBe(true);
  });

  // ─── TEST C: STARTS DISCOVERY ─────────────────────────────────────────────
  it('Test C — Provider starts discovery on the correct serviceId', async () => {
    await provider.start();

    expect(bridge.startDiscovery).toHaveBeenCalledWith(DEFAULT_NEXUS_SERVICE_ID);
    expect(bridge.isDiscovering).toBe(true);
  });

  // ─── TEST D: STOPS BOTH CLEANLY ───────────────────────────────────────────
  it('Test D — Provider stops advertising and discovery cleanly', async () => {
    await provider.start();
    await provider.stop();

    expect(bridge.stopAdvertising).toHaveBeenCalled();
    expect(bridge.stopDiscovery).toHaveBeenCalled();
    expect(bridge.isAdvertising).toBe(false);
    expect(bridge.isDiscovering).toBe(false);
  });

  // ─── TEST E: ENDPOINT DISCOVERY TRIGGERS CONNECTION ───────────────────────
  it('Test E — Endpoint discovery triggers native connection initiation', async () => {
    await provider.start();

    bridge.simulateEndpointFound({
      endpointId: 'ep-node-1',
      endpointName: 'NEXUS-NODE-1',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    });

    expect(bridge.connect).toHaveBeenCalledWith('ep-node-1');
  });

  // ─── TEST F: DUPLICATE DISCOVERY PREVENTED ─────────────────────────────────
  it('Test F — Duplicate endpoint discovery does not create duplicate connection attempts', async () => {
    await provider.start();

    const endpoint: NativePeerEndpoint = {
      endpointId: 'ep-node-dup',
      endpointName: 'NEXUS-NODE-DUP',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    };

    // First discovery initiates connection
    bridge.simulateEndpointFound(endpoint);
    expect(bridge.connect).toHaveBeenCalledTimes(1);

    // Second discovery for same pending endpoint is ignored
    bridge.simulateEndpointFound(endpoint);
    expect(bridge.connect).toHaveBeenCalledTimes(1);
  });

  // ─── TEST G: CONNECTED CREATES EXACTLY ONE NATIVETRANSPORT ────────────────
  it('Test G — CONNECTED status creates exactly one NativeTransport', async () => {
    await provider.start();

    bridge.simulateEndpointFound({
      endpointId: 'ep-node-g',
      endpointName: 'NEXUS-NODE-G',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    });

    bridge.simulateConnectionResult('ep-node-g', 'CONNECTED');

    expect(provider.getActiveTransports().length).toBe(1);
    const transport = provider.getTransport('ep-node-g');
    expect(transport).toBeDefined();
    expect(transport?.transportType).toBe('nearby');
    expect(transport?.remotePeerId).toBe('NEXUS-NODE-G');
    expect(transport?.isOpen()).toBe(true);
  });

  // ─── TEST H: ONTRANSPORTREADY FIRES EXACTLY ONCE ──────────────────────────
  it('Test H — onTransportReady fires exactly once for that connection', async () => {
    await provider.start();

    let readyCount = 0;
    let readyTransport: NexusTransport | null = null;
    provider.onTransportReady((t) => {
      readyCount++;
      readyTransport = t;
    });

    bridge.simulateEndpointFound({
      endpointId: 'ep-node-h',
      endpointName: 'NEXUS-NODE-H',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    });

    bridge.simulateConnectionResult('ep-node-h', 'CONNECTED');

    // Subsequent redundant CONNECTED callbacks are guarded
    bridge.simulateConnectionResult('ep-node-h', 'CONNECTED');

    expect(readyCount).toBe(1);
    expect(readyTransport).toBeDefined();
    expect(readyTransport?.remotePeerId).toBe('NEXUS-NODE-H');
  });

  // ─── TEST I: REJECTED/ERROR DO NOT EMIT ONTRANSPORTREADY ──────────────────
  it('Test I — REJECTED / ERROR do not emit onTransportReady', async () => {
    await provider.start();

    let readyCount = 0;
    provider.onTransportReady(() => {
      readyCount++;
    });

    bridge.simulateEndpointFound({
      endpointId: 'ep-node-fail',
      endpointName: 'NEXUS-NODE-FAIL',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    });

    bridge.simulateConnectionResult('ep-node-fail', 'REJECTED', 'User rejected connection');

    expect(readyCount).toBe(0);
    expect(provider.getActiveTransports().length).toBe(0);
  });

  // ─── TEST J: DISCONNECTED CLEANS UP PEER ──────────────────────────────────
  it('Test J — DISCONNECTED cleans up the corresponding peer and emits onPeerLost', async () => {
    await provider.start();

    let lostPeerId = '';
    provider.onPeerLost((pId) => {
      lostPeerId = pId;
    });

    bridge.simulateEndpointFound({
      endpointId: 'ep-node-j',
      endpointName: 'NEXUS-NODE-J',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    });

    bridge.simulateConnectionResult('ep-node-j', 'CONNECTED');
    expect(provider.getActiveTransports().length).toBe(1);

    // Endpoint disconnects
    bridge.simulateDisconnected('ep-node-j', 'Radio range exceeded');

    expect(provider.getActiveTransports().length).toBe(0);
    expect(lostPeerId).toBe('NEXUS-NODE-J');
  });

  // ─── TEST K: MULTIPLE ENDPOINTS COEXIST INDEPENDENTLY ─────────────────────
  it('Test K — Multiple endpoints can coexist independently', async () => {
    await provider.start();

    const readyPeers: string[] = [];
    provider.onTransportReady((t) => {
      readyPeers.push(t.remotePeerId);
    });

    // Peer 1 connects
    bridge.simulateEndpointFound({
      endpointId: 'ep-1',
      endpointName: 'PEER-1',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    });
    bridge.simulateConnectionResult('ep-1', 'CONNECTED');

    // Peer 2 connects
    bridge.simulateEndpointFound({
      endpointId: 'ep-2',
      endpointName: 'PEER-2',
      serviceId: DEFAULT_NEXUS_SERVICE_ID,
    });
    bridge.simulateConnectionResult('ep-2', 'CONNECTED');

    expect(readyPeers).toEqual(['PEER-1', 'PEER-2']);
    expect(provider.getActiveTransports().length).toBe(2);
    expect(provider.getActiveEndpointIds()).toEqual(['ep-1', 'ep-2']);
  });

  // ─── TEST L: ENDPOINT A DISCONNECT DOES NOT AFFECT ENDPOINT B ─────────────
  it('Test L — Endpoint A disconnecting does not affect Endpoint B', async () => {
    await provider.start();

    bridge.simulateEndpointFound({ endpointId: 'ep-A', endpointName: 'PEER-A', serviceId: DEFAULT_NEXUS_SERVICE_ID });
    bridge.simulateConnectionResult('ep-A', 'CONNECTED');

    bridge.simulateEndpointFound({ endpointId: 'ep-B', endpointName: 'PEER-B', serviceId: DEFAULT_NEXUS_SERVICE_ID });
    bridge.simulateConnectionResult('ep-B', 'CONNECTED');

    expect(provider.getActiveTransports().length).toBe(2);

    // Disconnect A
    bridge.simulateDisconnected('ep-A', 'Left range');

    expect(provider.getActiveTransports().length).toBe(1);
    expect(provider.isEndpointConnected('ep-A')).toBe(false);
    expect(provider.isEndpointConnected('ep-B')).toBe(true);
  });

  // ─── TEST M: ENDPOINT LOST IS HANDLED CORRECTLY ───────────────────────────
  it('Test M — Endpoint lost from scan is handled correctly', async () => {
    await provider.start();

    let lostPeer = '';
    provider.onPeerLost((id) => {
      lostPeer = id;
    });

    bridge.simulateEndpointFound({ endpointId: 'ep-scan', endpointName: 'PEER-SCAN', serviceId: DEFAULT_NEXUS_SERVICE_ID });
    bridge.simulateEndpointLost('ep-scan');

    expect(lostPeer).toBe('PEER-SCAN');
  });

  // ─── TEST N: REDISCOVERY AND RECONNECTION AFTER PREVIOUS DISCONNECT ───────
  it('Test N — Provider can rediscover and reconnect an endpoint after a previous disconnect', async () => {
    await provider.start();

    const endpoint = { endpointId: 'ep-reconn', endpointName: 'PEER-RECONN', serviceId: DEFAULT_NEXUS_SERVICE_ID };

    // Initial connection
    bridge.simulateEndpointFound(endpoint);
    bridge.simulateConnectionResult('ep-reconn', 'CONNECTED');
    expect(provider.getActiveTransports().length).toBe(1);

    // Drop
    bridge.simulateDisconnected('ep-reconn', 'temporary drop');
    expect(provider.getActiveTransports().length).toBe(0);

    // Rediscovered later
    bridge.simulateEndpointFound(endpoint);
    expect(bridge.connect).toHaveBeenCalledTimes(2);

    bridge.simulateConnectionResult('ep-reconn', 'CONNECTED');
    expect(provider.getActiveTransports().length).toBe(1);
    expect(provider.getTransport('ep-reconn')?.isOpen()).toBe(true);
  });

  // ─── TEST O: STOP() CLEANS ALL ACTIVE AND PENDING STATE ───────────────────
  it('Test O — stop() cleans all active, pending, and advertising/discovery state', async () => {
    await provider.start();

    bridge.simulateEndpointFound({ endpointId: 'ep-live', endpointName: 'PEER-LIVE', serviceId: DEFAULT_NEXUS_SERVICE_ID });
    bridge.simulateConnectionResult('ep-live', 'CONNECTED');

    expect(provider.getActiveTransports().length).toBe(1);

    await provider.stop();

    expect(provider.getActiveTransports().length).toBe(0);
    expect(provider.getActiveEndpointIds().length).toBe(0);
    expect(bridge.disconnectAll).toHaveBeenCalled();
  });

  // ─── TEST P: NATIVE BRIDGE UNAVAILABLE IS HANDLED GRACEFULLY ──────────────
  it('Test P — Native bridge unavailable is handled gracefully without crashing', async () => {
    const deadBridge = createMockBridge(false); // isAvailable() -> false
    const dormantProvider = new NativeTransportProvider({
      bridge: deadBridge,
      localDeviceId: 'DEV-DORMANT',
    });

    expect(dormantProvider.isSupported()).toBe(false);

    // start() should not throw or attempt to advertise
    await expect(dormantProvider.start()).resolves.toBeUndefined();
    expect(deadBridge.startAdvertising).not.toHaveBeenCalled();
    expect(deadBridge.startDiscovery).not.toHaveBeenCalled();

    // stop() should also not throw
    await expect(dormantProvider.stop()).resolves.toBeUndefined();
  });
});
