import { describe, it, expect } from 'vitest';
import type { INexusTransportProvider } from '../networking/transportProvider';
import { WebRtcTransportProvider } from '../networking/webRtcTransportProvider';
import { WebSocketTransportProvider } from '../networking/webSocketTransportProvider';
import { NetworkCoordinator } from '../frontend/src/services/networkCoordinator';
import { RelayEngine } from '../networking/relayEngine';
import { MockStorageAdapter } from '../networking/mockStorageAdapter';
import type { NexusTransport, TransportType } from '../shared/interfaces';
import type { RelayMessage } from '../shared/protocol';

describe('Phase 2: Transport Provider Abstraction Tests', () => {
  describe('WebRtcTransportProvider', () => {
    it('satisfies INexusTransportProvider interface and reports expected metadata', () => {
      const provider: INexusTransportProvider = new WebRtcTransportProvider();

      expect(provider.id).toBe('webrtc');
      expect(provider.name).toBe('WebRTC DataChannel');
      expect(provider.transportType).toBe('webrtc');
      expect(provider.priority).toBeGreaterThan(0);
      expect(provider.isSupported()).toBe(typeof RTCPeerConnection !== 'undefined');

      // Lifecycle hooks
      expect(() => provider.start()).not.toThrow();
      expect(() => provider.stop()).not.toThrow();
    });

    it('emits peer lifecycle and transport-ready events', () => {
      const provider = new WebRtcTransportProvider();
      let discoveredPeer = '';
      let lostPeer = '';
      let receivedTransport: NexusTransport | null = null;

      provider.onPeerDiscovered((id) => {
        discoveredPeer = id;
      });
      provider.onPeerLost((id) => {
        lostPeer = id;
      });
      provider.onTransportReady((t) => {
        receivedTransport = t;
      });

      provider.emitPeerDiscovered('peer-123');
      expect(discoveredPeer).toBe('peer-123');

      provider.emitPeerLost('peer-123');
      expect(lostPeer).toBe('peer-123');

      const mockTransport: NexusTransport = {
        transportType: 'webrtc',
        remotePeerId: 'peer-123',
        isOpen: () => true,
        send: async () => {},
        onMessage: () => {},
        onClose: () => {},
        close: () => {},
      };

      provider.emitTransportReady(mockTransport);
      expect(receivedTransport).toBe(mockTransport);
    });

    it('performs deterministic initiator selection (localDeviceId < remotePeerId)', async () => {
      const providerA = new WebRtcTransportProvider({ localDeviceId: 'NODE_AAA' });
      const providerZ = new WebRtcTransportProvider({ localDeviceId: 'NODE_ZZZ' });

      // NODE_AAA < NODE_BBB -> initiator (returns true)
      const isInitiatorA = await providerA.handlePeerDiscovered('NODE_BBB');
      expect(isInitiatorA).toBe(true);

      // NODE_ZZZ > NODE_BBB -> callee (returns false)
      const isInitiatorZ = await providerZ.handlePeerDiscovered('NODE_BBB');
      expect(isInitiatorZ).toBe(false);

      // Same peer ID -> false
      const isSelf = await providerA.handlePeerDiscovered('NODE_AAA');
      expect(isSelf).toBe(false);
    });

    it('manages candidate buffering, peer diagnostics, and cleanup lifecycle', async () => {
      const provider = new WebRtcTransportProvider({ localDeviceId: 'NODE_LOCAL' });

      // Buffer candidate when no peer connection exists
      await provider.handleCandidate('PEER_REMOTE', { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 5000 typ host' } as any);
      provider.clearPendingCandidates('PEER_REMOTE');

      // Check diagnostics for unknown peer
      expect(provider.getPeerDiagnostic('NONEXISTENT')).toBeUndefined();
      expect(provider.getActivePeerIds()).toEqual([]);
      expect(provider.getActiveTransportCount()).toBe(0);
      expect(provider.isTransportOpen('NONEXISTENT')).toBe(false);

      // Cleanup methods run cleanly
      expect(() => provider.closePeer('NONEXISTENT')).not.toThrow();
      expect(() => provider.closeAll()).not.toThrow();
    });
  });

  describe('WebSocketTransportProvider', () => {
    it('satisfies INexusTransportProvider interface and reports expected metadata', () => {
      const provider: INexusTransportProvider = new WebSocketTransportProvider();

      expect(provider.id).toBe('websocket');
      expect(provider.name).toBe('WebSocket Relay');
      expect(provider.transportType).toBe('websocket');
      expect(provider.priority).toBeGreaterThan(0);
      expect(provider.isSupported()).toBe(
        typeof WebSocket !== 'undefined' || typeof (globalThis as any).WebSocket !== 'undefined'
      );

      // Lifecycle hooks
      expect(() => provider.start()).not.toThrow();
      expect(() => provider.stop()).not.toThrow();
    });

    it('emits transport-ready events', () => {
      const provider = new WebSocketTransportProvider();
      let receivedTransport: NexusTransport | null = null;

      provider.onTransportReady((t) => {
        receivedTransport = t;
      });

      const mockTransport: NexusTransport = {
        transportType: 'websocket',
        remotePeerId: 'ws-peer-456',
        isOpen: () => true,
        send: async () => {},
        onMessage: () => {},
        onClose: () => {},
        close: () => {},
      };

      provider.emitTransportReady(mockTransport);
      expect(receivedTransport).toBe(mockTransport);
    });
  });

  describe('Provider Ordering & Preference', () => {
    it('verifies WebRTC has higher priority than WebSocket fallback', () => {
      const rtcProvider = new WebRtcTransportProvider();
      const wsProvider = new WebSocketTransportProvider();

      expect(rtcProvider.priority).toBeGreaterThan(wsProvider.priority);

      // Sorting providers by priority descending should place WebRTC first
      const providers: INexusTransportProvider[] = [wsProvider, rtcProvider];
      const sorted = [...providers].sort((a, b) => b.priority - a.priority);

      expect(sorted[0].id).toBe('webrtc');
      expect(sorted[1].id).toBe('websocket');
    });
  });

  describe('Transport Provider Decoupling with RelayEngine', () => {
    it('allows providers to expose a NexusTransport without RelayEngine knowing concrete classes', () => {
      const storage = new MockStorageAdapter();
      const engine = new RelayEngine('DEV-LOCAL', storage);
      const wsProvider = new WebSocketTransportProvider();

      // RelayEngine registers transport emitted by the provider
      wsProvider.onTransportReady((transport) => {
        engine.registerTransport(transport);
      });

      const genericTransport: NexusTransport = {
        transportType: 'websocket',
        remotePeerId: 'remote-node-77',
        isOpen: () => true,
        send: async (_msg: RelayMessage) => {},
        onMessage: () => {},
        onClose: () => {},
        close: () => {},
      };

      wsProvider.emitTransportReady(genericTransport);

      const status = engine.getStatus();
      expect(status.activePeers.length).toBe(1);
      expect(status.activePeers[0].peerId).toBe('remote-node-77');
      expect(status.activePeers[0].transportType).toBe('websocket');
    });
  });

  describe('NetworkCoordinator Integration', () => {
    it('exposes transport providers through INexusTransportProvider interface', () => {
      const storage = new MockStorageAdapter();
      const engine = new RelayEngine('DEV-COORD', storage);
      const coordinator = new NetworkCoordinator({
        deviceId: 'DEV-COORD',
        relayEngine: engine,
      });

      const providers = coordinator.getProviders();
      expect(providers.length).toBe(2);

      const rtc = coordinator.getProvider('webrtc');
      expect(rtc).toBeDefined();
      expect(rtc?.transportType).toBe('webrtc');

      const ws = coordinator.getProvider('websocket');
      expect(ws).toBeDefined();
      expect(ws?.transportType).toBe('websocket');
    });
  });
});
