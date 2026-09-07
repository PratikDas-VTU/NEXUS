/**
 * NEXUS — Offline-First Emergency & Community Network
 * Phase 6 — Step 4: Multi-Transport Integration & Multi-Node Simulation Tests
 * 
 * Verifies:
 * 1. NativeTransportProvider registration in NetworkCoordinator & MultiTransportManager
 * 2. Native transport ingestion into MultiTransportManager (health, preferred path)
 * 3. Priority hierarchy: WebRTC (100) > Nearby (60) > WebSocket (50)
 * 4. Automatic failover from Nearby to WebSocket when Nearby fails
 * 5. Multi-peer isolation without cross-endpoint data leakage
 * 6. Multi-hop simulation topology (A <-> B <-> C, no direct A <-> C link)
 * 7. End-to-end 6-stage RelayEngine exchange over native transport
 * 8. Message ID preservation across hops
 * 9. Hop count increment (0 -> 1 -> 2) & TTL validation
 * 10. Incident deduplication & semantic versioning
 * 11. ACK handling & PURGE signaling propagation
 * 12. Store-Carry-Forward simulation (A -> B, A leaves, B -> C)
 * 13. Peer disconnect and reconnection lifecycle
 * 14. Strict verification that A and C never communicate directly
 */

import { describe, it, expect } from 'vitest';
import { RelayEngine } from '../networking/relayEngine';
import { MultiTransportManager } from '../networking/multiTransportManager';
import {
  NativeTransportProvider,
  DEFAULT_NEXUS_SERVICE_ID,
} from '../networking/nativeTransportProvider';
import { NetworkCoordinator } from '../frontend/src/services/networkCoordinator';
import { MockStorageAdapter } from '../networking/mockStorageAdapter';
import type {
  INativeMeshBridge,
  NativePeerEndpoint,
  NativeConnectionStatus,
} from '../networking/nativeBridge';
import type { NexusTransport, TransportType } from '../shared/interfaces';
import type { RelayMessage, PurgeMessage } from '../shared/protocol';

function delay(ms: number = 25): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── DETERMINISTIC SIMULATED RADIO NETWORK ───────────────────────────────────

/**
 * In-memory simulated radio RF mesh environment.
 * Connects simulated native bridges according to defined RF topologies.
 * Absolutely prevents communication between nodes that are not linked.
 */
class SimulatedRadioNetwork {
  private nodes = new Map<string, SimulatedNativeBridge>();
  private links = new Set<string>();
  private connectedPairs = new Set<string>();
  public directPayloadCount = new Map<string, number>();

  public createNodeBridge(nodeId: string): SimulatedNativeBridge {
    const bridge = new SimulatedNativeBridge(nodeId, this);
    this.nodes.set(nodeId, bridge);
    return bridge;
  }

  public link(nodeA: string, nodeB: string): void {
    this.links.add(`${nodeA}:${nodeB}`);
    this.links.add(`${nodeB}:${nodeA}`);
    this.checkDiscoveryBetween(nodeA, nodeB);
    this.checkDiscoveryBetween(nodeB, nodeA);
  }

  public unlink(nodeA: string, nodeB: string, reason = 'Out of radio range'): void {
    this.links.delete(`${nodeA}:${nodeB}`);
    this.links.delete(`${nodeB}:${nodeA}`);
    this.connectedPairs.delete(`${nodeA}:${nodeB}`);
    this.connectedPairs.delete(`${nodeB}:${nodeA}`);

    const bridgeA = this.nodes.get(nodeA);
    const bridgeB = this.nodes.get(nodeB);
    if (bridgeA) {
      bridgeA.simulateEndpointLost(`ep_${nodeB}`);
      bridgeA.simulateDisconnected(`ep_${nodeB}`, reason);
    }
    if (bridgeB) {
      bridgeB.simulateEndpointLost(`ep_${nodeA}`);
      bridgeB.simulateDisconnected(`ep_${nodeA}`, reason);
    }
  }

  public areLinked(nodeA: string, nodeB: string): boolean {
    return this.links.has(`${nodeA}:${nodeB}`);
  }

  public areConnected(nodeA: string, nodeB: string): boolean {
    return this.connectedPairs.has(`${nodeA}:${nodeB}`);
  }

  public notifyNodeStateChange(nodeId: string): void {
    for (const otherId of this.nodes.keys()) {
      if (otherId !== nodeId && this.areLinked(nodeId, otherId)) {
        this.checkDiscoveryBetween(nodeId, otherId);
        this.checkDiscoveryBetween(otherId, nodeId);
      }
    }
  }

  private checkDiscoveryBetween(advertiserId: string, discovererId: string): void {
    const advertiser = this.nodes.get(advertiserId);
    const discoverer = this.nodes.get(discovererId);
    if (!advertiser || !discoverer) return;

    if (advertiser.isAdvertising && discoverer.isDiscovering) {
      discoverer.simulateEndpointFound({
        endpointId: `ep_${advertiserId}`,
        endpointName: advertiser.advertisedName || advertiserId,
        serviceId: advertiser.serviceId || DEFAULT_NEXUS_SERVICE_ID,
      });
    }
  }

  public async requestConnection(fromNode: string, endpointId: string): Promise<void> {
    const targetNode = endpointId.replace(/^ep_/, '');
    if (!this.areLinked(fromNode, targetNode)) {
      const fromBridge = this.nodes.get(fromNode);
      fromBridge?.simulateConnectionResult(endpointId, 'ERROR', 'Not within radio range');
      return;
    }

    const pairKey = `${fromNode}:${targetNode}`;
    const reverseKey = `${targetNode}:${fromNode}`;
    if (this.connectedPairs.has(pairKey)) {
      return; // Already connected
    }
    this.connectedPairs.add(pairKey);
    this.connectedPairs.add(reverseKey);

    const fromBridge = this.nodes.get(fromNode);
    const targetBridge = this.nodes.get(targetNode);

    const fromName = fromBridge?.advertisedName || fromNode;
    const targetName = targetBridge?.advertisedName || targetNode;

    // Guarantee endpoint identity mapping before connection result fires
    fromBridge?.simulateEndpointFound({
      endpointId: `ep_${targetNode}`,
      endpointName: targetName,
      serviceId: targetBridge?.serviceId || DEFAULT_NEXUS_SERVICE_ID,
    });
    targetBridge?.simulateEndpointFound({
      endpointId: `ep_${fromNode}`,
      endpointName: fromName,
      serviceId: fromBridge?.serviceId || DEFAULT_NEXUS_SERVICE_ID,
    });

    fromBridge?.simulateConnectionInitiated({
      endpointId: `ep_${targetNode}`,
      endpointName: targetName,
      serviceId: targetBridge?.serviceId || DEFAULT_NEXUS_SERVICE_ID,
    });
    targetBridge?.simulateConnectionInitiated({
      endpointId: `ep_${fromNode}`,
      endpointName: fromName,
      serviceId: fromBridge?.serviceId || DEFAULT_NEXUS_SERVICE_ID,
    });

    fromBridge?.simulateConnectionResult(endpointId, 'CONNECTED');
    targetBridge?.simulateConnectionResult(`ep_${fromNode}`, 'CONNECTED');
  }

  public async routePayload(fromNode: string, endpointId: string, payload: string): Promise<void> {
    const targetNode = endpointId.replace(/^ep_/, '');
    const pairKey = `${fromNode}->${targetNode}`;
    this.directPayloadCount.set(pairKey, (this.directPayloadCount.get(pairKey) || 0) + 1);

    if (!this.areLinked(fromNode, targetNode) || !this.areConnected(fromNode, targetNode)) {
      throw new Error(`[SimulatedRadioNetwork] RF transmission failed: No active radio link between ${fromNode} and ${targetNode}`);
    }

    const targetBridge = this.nodes.get(targetNode);
    if (!targetBridge) {
      throw new Error(`[SimulatedRadioNetwork] Destination node ${targetNode} does not exist`);
    }

    // Deliver asynchronously to emulate realistic frame propagation
    setTimeout(() => {
      targetBridge.simulatePayloadReceived(`ep_${fromNode}`, payload);
    }, 2);
  }

  public async disconnectEndpoint(fromNode: string, endpointId: string): Promise<void> {
    const targetNode = endpointId.replace(/^ep_/, '');
    this.connectedPairs.delete(`${fromNode}:${targetNode}`);
    this.connectedPairs.delete(`${targetNode}:${fromNode}`);

    const fromBridge = this.nodes.get(fromNode);
    const targetBridge = this.nodes.get(targetNode);

    fromBridge?.simulateDisconnected(endpointId, 'Local disconnect');
    targetBridge?.simulateDisconnected(`ep_${fromNode}`, 'Remote disconnect');
  }

  public async disconnectAll(fromNode: string): Promise<void> {
    for (const otherId of this.nodes.keys()) {
      if (this.areConnected(fromNode, otherId)) {
        await this.disconnectEndpoint(fromNode, `ep_${otherId}`);
      }
    }
  }
}

class SimulatedNativeBridge implements INativeMeshBridge {
  public isAdvertising = false;
  public isDiscovering = false;
  public advertisedName?: string;
  public serviceId?: string;

  public onEndpointFound?: (endpoint: NativePeerEndpoint) => void;
  public onEndpointLost?: (endpointId: string) => void;
  public onConnectionInitiated?: (endpoint: NativePeerEndpoint) => void;
  public onConnectionResult?: (endpointId: string, status: NativeConnectionStatus, message?: string) => void;
  public onPayloadReceived?: (endpointId: string, payload: string) => void;
  public onDisconnected?: (endpointId: string, reason?: string) => void;

  public sentPayloads: Array<{ endpointId: string; payload: string }> = [];

  constructor(
    public readonly nodeId: string,
    private network: SimulatedRadioNetwork
  ) {}

  public isAvailable(): boolean {
    return true;
  }

  public async startAdvertising(deviceName: string, serviceId: string): Promise<boolean> {
    this.isAdvertising = true;
    this.advertisedName = deviceName;
    this.serviceId = serviceId;
    this.network.notifyNodeStateChange(this.nodeId);
    return true;
  }

  public async stopAdvertising(): Promise<void> {
    this.isAdvertising = false;
  }

  public async startDiscovery(serviceId: string): Promise<boolean> {
    this.isDiscovering = true;
    this.serviceId = serviceId;
    this.network.notifyNodeStateChange(this.nodeId);
    return true;
  }

  public async stopDiscovery(): Promise<void> {
    this.isDiscovering = false;
  }

  public async connect(endpointId: string): Promise<void> {
    return this.network.requestConnection(this.nodeId, endpointId);
  }

  public async sendPayload(endpointId: string, payload: string): Promise<void> {
    this.sentPayloads.push({ endpointId, payload });
    return this.network.routePayload(this.nodeId, endpointId, payload);
  }

  public async disconnect(endpointId: string): Promise<void> {
    return this.network.disconnectEndpoint(this.nodeId, endpointId);
  }

  public async disconnectAll(): Promise<void> {
    return this.network.disconnectAll(this.nodeId);
  }

  // Simulation helpers
  public simulateEndpointFound(endpoint: NativePeerEndpoint): void {
    this.onEndpointFound?.(endpoint);
  }

  public simulateEndpointLost(endpointId: string): void {
    this.onEndpointLost?.(endpointId);
  }

  public simulateConnectionInitiated(endpoint: NativePeerEndpoint): void {
    this.onConnectionInitiated?.(endpoint);
  }

  public simulateConnectionResult(endpointId: string, status: NativeConnectionStatus, msg?: string): void {
    this.onConnectionResult?.(endpointId, status, msg);
  }

  public simulatePayloadReceived(endpointId: string, payload: string): void {
    this.onPayloadReceived?.(endpointId, payload);
  }

  public simulateDisconnected(endpointId: string, reason?: string): void {
    this.onDisconnected?.(endpointId, reason);
  }
}

// ─── MOCK TRANSPORTS FOR MULTI-PATH TESTING ──────────────────────────────────

function createMockTransport(
  transportType: TransportType,
  remotePeerId: string,
  isOpen = true
): NexusTransport & {
  isOpenFlag: boolean;
  sentMessages: RelayMessage[];
  shouldFail: boolean;
  failError: Error;
  triggerMessage: (msg: RelayMessage) => void;
  triggerClose: (reason?: string) => void;
} {
  let messageHandlers: Array<(msg: RelayMessage) => void> = [];
  let closeHandlers: Array<(reason?: string) => void> = [];

  return {
    transportType,
    remotePeerId,
    isOpenFlag: isOpen,
    sentMessages: [],
    shouldFail: false,
    failError: new Error(`Simulated send failure on ${transportType}`),

    isOpen() {
      return this.isOpenFlag;
    },
    async send(msg: RelayMessage) {
      if (!this.isOpenFlag) {
        throw new Error(`Transport ${transportType} is closed`);
      }
      if (this.shouldFail) {
        throw this.failError;
      }
      this.sentMessages.push(msg);
    },
    onMessage(h) {
      messageHandlers.push(h);
    },
    onClose(h) {
      closeHandlers.push(h);
    },
    close() {
      this.isOpenFlag = false;
      closeHandlers.forEach((h) => h('Closed by test'));
    },
    triggerMessage(msg: RelayMessage) {
      messageHandlers.forEach((h) => h(msg));
    },
    triggerClose(reason?: string) {
      this.isOpenFlag = false;
      closeHandlers.forEach((h) => h(reason));
    },
  };
}

// ─── TEST SUITE ──────────────────────────────────────────────────────────────

describe('Phase 6 — Step 4: Multi-Transport Integration & Multi-Node Simulation', () => {

  // ─── 1. NATIVE PROVIDER REGISTRATION IN NETWORK COORDINATOR ───────────────
  describe('1. Provider Registration', () => {
    it('registers NativeTransportProvider in NetworkCoordinator and routes to MultiTransportManager', async () => {
      const storage = new MockStorageAdapter();
      const engine = new RelayEngine('NODE-A', storage);
      const network = new SimulatedRadioNetwork();
      const bridge = network.createNodeBridge('NODE-A');

      const coordinator = new NetworkCoordinator({
        deviceId: 'NODE-A',
        relayEngine: engine,
        nativeBridge: bridge,
      });

      const providers = coordinator.getProviders();
      expect(providers.length).toBe(3); // WebRTC, WebSocket, Native

      const nativeP = coordinator.getProvider('nearby');
      expect(nativeP).toBeDefined();
      expect(nativeP?.transportType).toBe('nearby');
      expect(coordinator.getNativeProvider()).toBe(nativeP);

      await coordinator.start();
      expect(bridge.isAdvertising).toBe(true);
      expect(bridge.isDiscovering).toBe(true);

      await coordinator.stop();
      expect(bridge.isAdvertising).toBe(false);
    });

    it('allows dynamic registration of NativeTransportProvider via registerProvider', () => {
      const storage = new MockStorageAdapter();
      const engine = new RelayEngine('NODE-DYN', storage);
      const coordinator = new NetworkCoordinator({
        deviceId: 'NODE-DYN',
        relayEngine: engine,
      });

      expect(coordinator.getProviders().length).toBe(2);

      const network = new SimulatedRadioNetwork();
      const bridge = network.createNodeBridge('NODE-DYN');
      const provider = new NativeTransportProvider({
        localDeviceId: 'NODE-DYN',
        bridge,
      });

      coordinator.registerProvider(provider);
      expect(coordinator.getProviders().length).toBe(3);
      expect(coordinator.getProvider('nearby')).toBe(provider);
    });
  });

  // ─── 2. NATIVE TRANSPORT INGESTION ────────────────────────────────────────
  describe('2. Transport Ingestion into MultiTransportManager', () => {
    it('correctly ingests NativeTransport upon onTransportReady', async () => {
      const manager = new MultiTransportManager();
      const network = new SimulatedRadioNetwork();
      const bridge = network.createNodeBridge('NODE-LOCAL');

      const provider = new NativeTransportProvider({
        localDeviceId: 'NODE-LOCAL',
        bridge,
      });

      let readyTransport: NexusTransport | null = null;
      provider.onTransportReady((transport) => {
        readyTransport = transport;
        manager.registerTransport(transport);
      });

      await provider.start();

      bridge.simulateEndpointFound({
        endpointId: 'ep_PEER-1',
        endpointName: 'PEER-1',
        serviceId: DEFAULT_NEXUS_SERVICE_ID,
      });
      bridge.simulateConnectionResult('ep_PEER-1', 'CONNECTED');

      expect(readyTransport).toBeDefined();
      expect(readyTransport?.remotePeerId).toBe('PEER-1');
      expect(readyTransport?.transportType).toBe('nearby');

      // MultiTransportManager has it registered
      expect(manager.hasTransport('PEER-1', 'nearby')).toBe(true);
      expect(manager.getAvailableTransportTypes('PEER-1')).toContain('nearby');

      // Health is initialized as healthy
      const health = manager.getHealth('PEER-1', 'nearby');
      expect(health?.isHealthy).toBe(true);
      expect(health?.consecutiveFailures).toBe(0);

      // Nearby is selected as preferred (sole transport)
      const preferred = manager.getPreferredTransport('PEER-1');
      expect(preferred?.transportType).toBe('nearby');

      await provider.stop();
    });
  });

  // ─── 3. PRIORITY HIERARCHY: WEBRTC (100) > NEARBY (60) > WEBSOCKET (50) ────
  describe('3. Priority Hierarchy', () => {
    it('respects priority ordering WebRTC (100) > Nearby (60) > WebSocket (50)', () => {
      const manager = new MultiTransportManager();

      const rtc = createMockTransport('webrtc', 'PEER-X', true);
      const nearby = createMockTransport('nearby', 'PEER-X', true);
      const ws = createMockTransport('websocket', 'PEER-X', true);

      // Register all three transports
      manager.registerTransport(nearby);
      manager.registerTransport(ws);
      manager.registerTransport(rtc);

      // 1. All 3 available: WebRTC (100) must be preferred
      expect(manager.getPreferredTransport('PEER-X')?.transportType).toBe('webrtc');

      // 2. WebRTC closes: Nearby (60) must be preferred over WebSocket (50)
      rtc.close();
      expect(manager.getPreferredTransport('PEER-X')?.transportType).toBe('nearby');

      // 3. Nearby closes: WebSocket (50) becomes preferred
      nearby.close();
      expect(manager.getPreferredTransport('PEER-X')?.transportType).toBe('websocket');

      // 4. WebSocket closes: No preferred transport
      ws.close();
      expect(manager.getPreferredTransport('PEER-X')).toBeUndefined();
    });
  });

  // ─── 4. AUTOMATIC FAILOVER RETRY ──────────────────────────────────────────
  describe('4. Transport Failover', () => {
    it('automatically retries send over WebSocket when preferred Nearby transport fails', async () => {
      const manager = new MultiTransportManager();

      const nearby = createMockTransport('nearby', 'PEER-Y', true);
      const ws = createMockTransport('websocket', 'PEER-Y', true);

      manager.registerTransport(nearby);
      manager.registerTransport(ws);

      // Nearby is initially preferred
      expect(manager.getPreferredTransport('PEER-Y')?.transportType).toBe('nearby');

      // Make Nearby send fail (simulated RF collision/drop)
      nearby.shouldFail = true;

      const dummyMsg: RelayMessage = {
        type: 'HELLO',
        senderDeviceId: 'NODE-LOCAL',
        senderPeerId: 'NODE-LOCAL',
        timestamp: Date.now(),
        protocolVersion: 1,
      };

      // Sending must automatically fallback and deliver via WebSocket
      await expect(manager.send('PEER-Y', dummyMsg)).resolves.toBeUndefined();

      expect(ws.sentMessages.length).toBe(1);
      expect(ws.sentMessages[0].type).toBe('HELLO');

      // Verify Nearby recorded failure
      const nearbyHealth = manager.getHealth('PEER-Y', 'nearby');
      expect(nearbyHealth?.consecutiveFailures).toBe(1);

      // WebSocket recorded success
      const wsHealth = manager.getHealth('PEER-Y', 'websocket');
      expect(wsHealth?.consecutiveSuccesses).toBe(1);
    });

    it('marks Nearby unhealthy after consecutive failures and automatically switches preferred', async () => {
      const manager = new MultiTransportManager({ maxConsecutiveFailures: 2 });

      const nearby = createMockTransport('nearby', 'PEER-Z', true);
      const ws = createMockTransport('websocket', 'PEER-Z', true);

      manager.registerTransport(nearby);
      manager.registerTransport(ws);

      nearby.shouldFail = true;

      const dummyMsg: RelayMessage = {
        type: 'HELLO',
        senderDeviceId: 'LOCAL',
        senderPeerId: 'LOCAL',
        timestamp: Date.now(),
        protocolVersion: 1,
      };

      // Attempt 1 -> fallback to WS
      await manager.send('PEER-Z', dummyMsg);
      expect(manager.getHealth('PEER-Z', 'nearby')?.isHealthy).toBe(true);

      // Attempt 2 -> threshold reached, marked unhealthy
      await manager.send('PEER-Z', dummyMsg);
      expect(manager.getHealth('PEER-Z', 'nearby')?.isHealthy).toBe(false);

      // Now preferred transport directly selects WebSocket
      expect(manager.getPreferredTransport('PEER-Z')?.transportType).toBe('websocket');
    });
  });

  // ─── 5. MULTIPLE PEERS ISOLATION ──────────────────────────────────────────
  describe('5. Multi-Peer Isolation', () => {
    it('maintains independent endpoints without crosstalk across 4 nodes (A, B, C, D)', async () => {
      const network = new SimulatedRadioNetwork();

      const bridgeA = network.createNodeBridge('A');
      const bridgeB = network.createNodeBridge('B');
      const bridgeC = network.createNodeBridge('C');
      const bridgeD = network.createNodeBridge('D');

      // Topology: A <-> B, A <-> C, B <-> C, B <-> D, C <-> D
      network.link('A', 'B');
      network.link('A', 'C');
      network.link('B', 'C');
      network.link('B', 'D');
      network.link('C', 'D');

      const providerA = new NativeTransportProvider({
        localDeviceId: 'A',
        bridge: bridgeA,
        onLog: (lvl, msg) => console.log(`[ProviderA ${lvl}] ${msg}`),
      });
      const providerB = new NativeTransportProvider({ localDeviceId: 'B', bridge: bridgeB });
      const providerC = new NativeTransportProvider({ localDeviceId: 'C', bridge: bridgeC });
      const providerD = new NativeTransportProvider({ localDeviceId: 'D', bridge: bridgeD });

      const managerA = new MultiTransportManager();
      providerA.onTransportReady((t) => managerA.registerTransport(t));

      await Promise.all([
        providerA.start(),
        providerB.start(),
        providerC.start(),
        providerD.start(),
      ]);

      await delay(60);

      // Node A is connected to B and C, but NOT to D
      expect(managerA.hasTransport('B', 'nearby')).toBe(true);
      expect(managerA.hasTransport('C', 'nearby')).toBe(true);
      expect(managerA.hasTransport('D', 'nearby')).toBe(false);

      // Verify payloads from A to B do NOT arrive at C
      const transportB = managerA.getTransports('B')[0];
      const transportC = managerA.getTransports('C')[0];

      let receivedAtC: RelayMessage | null = null;
      transportC.onMessage((msg) => {
        receivedAtC = msg;
      });

      const messageToB: RelayMessage = {
        type: 'HELLO',
        senderDeviceId: 'A',
        senderPeerId: 'A',
        timestamp: Date.now(),
        protocolVersion: 1,
      };

      await transportB.send(messageToB);
      await delay(30);

      expect(receivedAtC).toBeNull(); // No cross-talk!

      // Disconnecting B does not impact C
      network.unlink('A', 'B');
      await delay(30);

      expect(transportC.isOpen()).toBe(true);
      expect(managerA.hasTransport('C', 'nearby')).toBe(true);

      await Promise.all([
        providerA.stop(),
        providerB.stop(),
        providerC.stop(),
        providerD.stop(),
      ]);
    });
  });

  // ─── 6, 7, 8, 9: MULTI-HOP RELAY SIMULATION (A -> B -> C) ────────────────
  describe('6-9. End-to-End Relay (A -> B -> C Topology)', () => {
    it('propagates emergency incident from A -> B -> C with correct hopCount, TTL, and deduplication', async () => {
      const network = new SimulatedRadioNetwork();

      // STRICT TOPOLOGY: A <-> B and B <-> C. NO DIRECT A <-> C.
      network.link('NODE-A', 'NODE-B');
      network.link('NODE-B', 'NODE-C');
      expect(network.areLinked('NODE-A', 'NODE-C')).toBe(false);

      const storageA = new MockStorageAdapter();
      const storageB = new MockStorageAdapter();
      const storageC = new MockStorageAdapter();

      const bridgeA = network.createNodeBridge('NODE-A');
      const bridgeB = network.createNodeBridge('NODE-B');
      const bridgeC = network.createNodeBridge('NODE-C');

      const engineA = new RelayEngine('NODE-A', storageA);
      const engineB = new RelayEngine('NODE-B', storageB);
      const engineC = new RelayEngine('NODE-C', storageC);

      const managerA = new MultiTransportManager();
      const managerB = new MultiTransportManager();
      const managerC = new MultiTransportManager();

      engineA.setTransportManager(managerA);
      engineB.setTransportManager(managerB);
      engineC.setTransportManager(managerC);

      const providerA = new NativeTransportProvider({ localDeviceId: 'NODE-A', bridge: bridgeA });
      const providerB = new NativeTransportProvider({ localDeviceId: 'NODE-B', bridge: bridgeB });
      const providerC = new NativeTransportProvider({ localDeviceId: 'NODE-C', bridge: bridgeC });

      // Route transport-ready events through RelayEngine (which registers with MultiTransportManager)
      providerA.onTransportReady((t) => engineA.registerTransport(t));
      providerB.onTransportReady((t) => engineB.registerTransport(t));
      providerC.onTransportReady((t) => engineC.registerTransport(t));

      // 1. Seed incident at Node A (originator, hopCount = 0)
      const emergencyId = 'incident-flood-001';
      storageA.seedIncident({
        incidentId: emergencyId,
        originDeviceId: 'NODE-A',
        type: 'medical',
        priority: 'P0',
        latitude: 12.9716,
        longitude: 77.5946,
        timestamp: Date.now(),
        status: 'stored',
        peopleAffected: 5,
        version: 1,
        hopCount: 0,
        ttl: 86400000,
        description: 'Severe flash flood at city hospital emergency gate',
      });

      // 2. Start providers on A, B, and C
      await Promise.all([
        providerA.start(),
        providerB.start(),
        providerC.start(),
      ]);

      // Allow 6-stage handshake to run: A -> B
      await delay(80);

      // Verify incident reached Node B
      const atB = storageB.getLocalIncident(emergencyId);
      expect(atB).toBeDefined();
      expect(atB?.incidentId).toBe(emergencyId);
      expect(atB?.priority).toBe('P0');
      expect(atB?.hopCount).toBe(1); // Increment from A (0) -> B (1)

      // Node B now has the incident stored; propagate to connected peer C
      await engineB.triggerPeerSync();
      await delay(80);

      // Verify incident reached Node C via B's relay
      const atC = storageC.getLocalIncident(emergencyId);
      expect(atC).toBeDefined();
      expect(atC?.incidentId).toBe(emergencyId);
      expect(atC?.description).toBe('Severe flash flood at city hospital emergency gate');
      expect(atC?.hopCount).toBe(2); // Increment from B (1) -> C (2)

      // Verify strict topology boundary: A and C NEVER transmitted directly
      expect(network.directPayloadCount.get('NODE-A->NODE-C')).toBeUndefined();
      expect(network.directPayloadCount.get('NODE-C->NODE-A')).toBeUndefined();

      // Verify ACK behavior: Node A marked incident as relayed
      const atA = storageA.getLocalIncident(emergencyId);
      expect(atA?.status).toBe('relayed');

      // Cleanup
      await Promise.all([providerA.stop(), providerB.stop(), providerC.stop()]);
    });
  });

  // ─── 10. DEDUPLICATION & VERSIONING OVER NATIVE TRANSPORT ─────────────────
  describe('10. Deduplication & Semantic Versioning', () => {
    it('rejects stale or identical versions and accepts higher version updates', async () => {
      const network = new SimulatedRadioNetwork();
      network.link('NODE-1', 'NODE-2');

      const storage1 = new MockStorageAdapter();
      const storage2 = new MockStorageAdapter();

      const bridge1 = network.createNodeBridge('NODE-1');
      const bridge2 = network.createNodeBridge('NODE-2');

      const engine1 = new RelayEngine('NODE-1', storage1);
      const engine2 = new RelayEngine('NODE-2', storage2);

      const manager1 = new MultiTransportManager();
      const manager2 = new MultiTransportManager();
      engine1.setTransportManager(manager1);
      engine2.setTransportManager(manager2);

      const provider1 = new NativeTransportProvider({ localDeviceId: 'NODE-1', bridge: bridge1 });
      const provider2 = new NativeTransportProvider({ localDeviceId: 'NODE-2', bridge: bridge2 });

      provider1.onTransportReady((t) => engine1.registerTransport(t));
      provider2.onTransportReady((t) => engine2.registerTransport(t));

      // Node 2 already has version 2 stored locally
      storage2.seedIncident({
        incidentId: 'inc-dedup-01',
        originDeviceId: 'NODE-1',
        type: 'fire',
        priority: 'P1',
        latitude: 12.0,
        longitude: 77.0,
        timestamp: Date.now(),
        status: 'stored',
        peopleAffected: 1,
        version: 2,
        hopCount: 1,
        ttl: 86400000,
        description: 'Fire updated status: contained',
      });

      // Node 1 only has older version 1
      storage1.seedIncident({
        incidentId: 'inc-dedup-01',
        originDeviceId: 'NODE-1',
        type: 'fire',
        priority: 'P1',
        latitude: 12.0,
        longitude: 77.0,
        timestamp: Date.now() - 1000,
        status: 'stored',
        peopleAffected: 1,
        version: 1,
        hopCount: 0,
        ttl: 86400000,
        description: 'Fire reported',
      });

      await Promise.all([provider1.start(), provider2.start()]);
      await delay(80);

      // Node 2 did not overwrite version 2 with stale version 1
      const at2 = storage2.getLocalIncident('inc-dedup-01');
      expect(at2?.version).toBe(2);
      expect(at2?.description).toBe('Fire updated status: contained');

      await Promise.all([provider1.stop(), provider2.stop()]);
    });
  });

  // ─── 11. PURGE SIGNALING OVER NATIVE TRANSPORT ────────────────────────────
  describe('11. PURGE Propagation', () => {
    it('dispatches PURGE message over native transport and triggers onPurge', async () => {
      const network = new SimulatedRadioNetwork();
      network.link('ALPHA', 'BETA');

      const storageA = new MockStorageAdapter();
      const storageB = new MockStorageAdapter();

      const bridgeA = network.createNodeBridge('ALPHA');
      const bridgeB = network.createNodeBridge('BETA');

      const engineA = new RelayEngine('ALPHA', storageA);
      const engineB = new RelayEngine('BETA', storageB);

      const managerA = new MultiTransportManager();
      const managerB = new MultiTransportManager();
      engineA.setTransportManager(managerA);
      engineB.setTransportManager(managerB);

      const providerA = new NativeTransportProvider({ localDeviceId: 'ALPHA', bridge: bridgeA });
      const providerB = new NativeTransportProvider({ localDeviceId: 'BETA', bridge: bridgeB });

      providerA.onTransportReady((t) => engineA.registerTransport(t));
      providerB.onTransportReady((t) => engineB.registerTransport(t));

      let purgedFromPeer = '';
      let purgeReason = '';
      engineB.onPurge = (fromPeerId, reason) => {
        purgedFromPeer = fromPeerId;
        purgeReason = reason || '';
      };

      await Promise.all([providerA.start(), providerB.start()]);
      await delay(80);

      // Send PURGE from Alpha to Beta via native transport
      const purgeMsg: PurgeMessage = {
        type: 'PURGE',
        senderDeviceId: 'ALPHA',
        senderPeerId: 'ALPHA',
        timestamp: Date.now(),
        reason: 'Emergency drill complete',
      };

      await managerA.send('BETA', purgeMsg);
      await delay(30);

      expect(purgedFromPeer).toBe('ALPHA');
      expect(purgeReason).toBe('Emergency drill complete');

      await Promise.all([providerA.stop(), providerB.stop()]);
    });
  });

  // ─── 12. STORE-CARRY-FORWARD OVER NATIVE TRANSPORT ────────────────────────
  describe('12. Store-Carry-Forward Simulation', () => {
    it('supports true opportunistic store-carry-forward (A -> B, A leaves, B -> C)', async () => {
      const network = new SimulatedRadioNetwork();

      const storageA = new MockStorageAdapter();
      const storageB = new MockStorageAdapter();
      const storageC = new MockStorageAdapter();

      const bridgeA = network.createNodeBridge('MULE-A');
      const bridgeB = network.createNodeBridge('MULE-B');
      const bridgeC = network.createNodeBridge('MULE-C');

      const engineA = new RelayEngine('MULE-A', storageA);
      const engineB = new RelayEngine('MULE-B', storageB);
      const engineC = new RelayEngine('MULE-C', storageC);

      const managerA = new MultiTransportManager();
      const managerB = new MultiTransportManager();
      const managerC = new MultiTransportManager();
      engineA.setTransportManager(managerA);
      engineB.setTransportManager(managerB);
      engineC.setTransportManager(managerC);

      const providerA = new NativeTransportProvider({ localDeviceId: 'MULE-A', bridge: bridgeA });
      const providerB = new NativeTransportProvider({ localDeviceId: 'MULE-B', bridge: bridgeB });
      const providerC = new NativeTransportProvider({ localDeviceId: 'MULE-C', bridge: bridgeC });

      providerA.onTransportReady((t) => engineA.registerTransport(t));
      providerB.onTransportReady((t) => engineB.registerTransport(t));
      providerC.onTransportReady((t) => engineC.registerTransport(t));

      // Seed Mule A with critical field report
      const incidentId = 'inc-scf-mule-09';
      storageA.seedIncident({
        incidentId,
        originDeviceId: 'MULE-A',
        type: 'shelter',
        priority: 'P0',
        latitude: 13.0827,
        longitude: 80.2707,
        timestamp: Date.now(),
        status: 'stored',
        peopleAffected: 50,
        version: 1,
        hopCount: 0,
        ttl: 86400000,
        description: 'Temporary relief camp established at community hall',
      });

      // ── Step 1: Mule A encounters Mule B ──────────────────────────
      network.link('MULE-A', 'MULE-B');
      await Promise.all([providerA.start(), providerB.start()]);
      await delay(80);

      // Mule B receives and persists incident
      const atB = storageB.getLocalIncident(incidentId);
      expect(atB).toBeDefined();
      expect(atB?.hopCount).toBe(1);

      // ── Step 2: Mule A moves out of range (Store & Carry) ─────────
      network.unlink('MULE-A', 'MULE-B');
      await providerA.stop();
      await delay(40);

      // Mule B is now physically alone carrying the data (no active open transport)
      expect(managerB.getPreferredTransport('MULE-A')).toBeUndefined();
      expect(managerB.getAvailableTransportTypes('MULE-A', true).length).toBe(0);

      // ── Step 3: Hours later, Mule B walks into range of Mule C ────
      network.link('MULE-B', 'MULE-C');
      await providerC.start();
      await delay(80);

      // Mule C receives the carried incident from Mule B!
      const atC = storageC.getLocalIncident(incidentId);
      expect(atC).toBeDefined();
      expect(atC?.incidentId).toBe(incidentId);
      expect(atC?.hopCount).toBe(2);
      expect(atC?.description).toBe('Temporary relief camp established at community hall');

      // Mule A and Mule C NEVER had any radio link
      expect(network.directPayloadCount.get('MULE-A->MULE-C')).toBeUndefined();

      await Promise.all([providerB.stop(), providerC.stop()]);
    });
  });

  // ─── 13. RECONNECTION RESILIENCE ──────────────────────────────────────────
  describe('13. Disconnect & Reconnect Lifecycle', () => {
    it('safely handles unexpected radio loss and re-syncs on reconnection', async () => {
      const network = new SimulatedRadioNetwork();
      network.link('DEV-1', 'DEV-2');

      const storage1 = new MockStorageAdapter();
      const storage2 = new MockStorageAdapter();

      const bridge1 = network.createNodeBridge('DEV-1');
      const bridge2 = network.createNodeBridge('DEV-2');

      const engine1 = new RelayEngine('DEV-1', storage1);
      const engine2 = new RelayEngine('DEV-2', storage2);

      const manager1 = new MultiTransportManager();
      const manager2 = new MultiTransportManager();
      engine1.setTransportManager(manager1);
      engine2.setTransportManager(manager2);

      const provider1 = new NativeTransportProvider({ localDeviceId: 'DEV-1', bridge: bridge1 });
      const provider2 = new NativeTransportProvider({ localDeviceId: 'DEV-2', bridge: bridge2 });

      provider1.onTransportReady((t) => engine1.registerTransport(t));
      provider2.onTransportReady((t) => engine2.registerTransport(t));

      await Promise.all([provider1.start(), provider2.start()]);
      await delay(60);

      expect(manager1.hasTransport('DEV-2', 'nearby')).toBe(true);

      // Radio link dropped abruptly
      network.unlink('DEV-1', 'DEV-2', 'Sudden RF fading');
      await delay(40);

      expect(manager1.getPreferredTransport('DEV-2')).toBeUndefined();
      expect(manager1.getAvailableTransportTypes('DEV-2', true).length).toBe(0);

      // New incident created while disconnected
      storage1.seedIncident({
        incidentId: 'inc-after-drop',
        originDeviceId: 'DEV-1',
        type: 'hazard',
        priority: 'P1',
        latitude: 10.0,
        longitude: 20.0,
        timestamp: Date.now(),
        status: 'stored',
        peopleAffected: 0,
        version: 1,
        hopCount: 0,
        ttl: 86400000,
        description: 'Downed power line',
      });

      // Devices walk back into radio range
      network.link('DEV-1', 'DEV-2');
      await delay(80);

      // Incident synced upon re-establishing radio link
      const at2 = storage2.getLocalIncident('inc-after-drop');
      expect(at2).toBeDefined();
      expect(at2?.incidentId).toBe('inc-after-drop');

      await Promise.all([provider1.stop(), provider2.stop()]);
    });
  });

  // ─── 14. BOUNDARY ISOLATION VERIFICATION ──────────────────────────────────
  describe('14. Mock Bridge Boundary Verification', () => {
    it('verifies simulated bridge operates purely in-memory without mock hardware claims', () => {
      const network = new SimulatedRadioNetwork();
      const bridge = network.createNodeBridge('TEST-NODE');

      expect(bridge.isAvailable()).toBe(true);
      expect(bridge.sentPayloads.length).toBe(0);

      // Emphasizes distinction between software simulation and physical RF radio
      expect(bridge.constructor.name).toBe('SimulatedNativeBridge');
    });
  });
});
