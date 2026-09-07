import { describe, it, expect } from 'vitest';
import type { NexusTransport, ITransport, TransportType } from '../shared/interfaces';
import type { RelayMessage } from '../shared/protocol';
import { WebRtcTransport } from '../networking/webRtcTransport';
import { WebSocketTransport } from '../networking/webSocketTransport';
import { RelayEngine } from '../networking/relayEngine';
import { MockStorageAdapter } from '../networking/mockStorageAdapter';

describe('Transport Contract & Compatibility Verification', () => {
  it('verifies WebRtcTransport satisfies the NexusTransport interface', () => {
    // Minimal mock for browser RTCPeerConnection to test contract compliance in Node
    const mockPeerConnection = {
      ondatachannel: null,
      onconnectionstatechange: null,
      close: () => {},
      connectionState: 'connected' as RTCPeerConnectionState,
    } as unknown as RTCPeerConnection;

    const rtc = new WebRtcTransport({
      remotePeerId: 'peer-webrtc-01',
      peerConnection: mockPeerConnection,
    });

    // Compile-time & runtime assignability to NexusTransport and ITransport
    const transport: NexusTransport = rtc;
    const legacyTransport: ITransport = rtc;

    expect(transport).toBeDefined();
    expect(legacyTransport).toBeDefined();
    expect(transport.transportType).toBe('webrtc');
    expect(transport.remotePeerId).toBe('peer-webrtc-01');
    expect(typeof transport.isOpen).toBe('function');
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.onMessage).toBe('function');
    expect(typeof transport.onClose).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  it('verifies WebSocketTransport satisfies the NexusTransport interface', () => {
    // Minimal mock for SignalingClient
    const mockSignalingClient = {
      isConnected: () => true,
      sendRelay: () => {},
    } as any;

    const ws = new WebSocketTransport({
      remotePeerId: 'peer-ws-01',
      signalingClient: mockSignalingClient,
    });

    // Compile-time & runtime assignability to NexusTransport and ITransport
    const transport: NexusTransport = ws;
    const legacyTransport: ITransport = ws;

    expect(transport).toBeDefined();
    expect(legacyTransport).toBeDefined();
    expect(transport.transportType).toBe('websocket');
    expect(transport.remotePeerId).toBe('peer-ws-01');
    expect(typeof transport.isOpen).toBe('function');
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.onMessage).toBe('function');
    expect(typeof transport.onClose).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  it('verifies a future transport type such as "ble" is accepted by the type contract', () => {
    // Architectural mockup of future BLE transport conforming to NexusTransport
    class MockBleTransport implements NexusTransport {
      public readonly transportType: TransportType = 'ble';
      public readonly remotePeerId: string;
      public readonly metadata = {
        mtu: 512,
        estimatedBandwidth: 'low' as const,
        isDirectP2P: true,
      };

      private open = true;
      private messageHandlers: Array<(msg: RelayMessage) => void> = [];
      private closeHandlers: Array<(reason?: string) => void> = [];

      constructor(peerId: string) {
        this.remotePeerId = peerId;
      }

      public isOpen(): boolean {
        return this.open;
      }

      public async send(_message: RelayMessage): Promise<void> {}

      public onMessage(handler: (msg: RelayMessage) => void): void {
        this.messageHandlers.push(handler);
      }

      public onClose(handler: (reason?: string) => void): void {
        this.closeHandlers.push(handler);
      }

      public close(reason?: string): void {
        this.open = false;
        for (const handler of this.closeHandlers) {
          handler(reason || 'Closed');
        }
      }
    }

    const ble = new MockBleTransport('ble-responder-99');
    const transport: NexusTransport = ble;

    expect(transport.transportType).toBe('ble');
    expect(transport.remotePeerId).toBe('ble-responder-99');
    expect(transport.metadata?.mtu).toBe(512);
    expect(transport.metadata?.isDirectP2P).toBe(true);
    expect(transport.metadata?.estimatedBandwidth).toBe('low');

    // Verify RelayEngine accepts future transport types without error
    const storage = new MockStorageAdapter();
    const engine = new RelayEngine('DEV-CENTRAL', storage);

    engine.registerTransport(transport);

    const status = engine.getStatus();
    expect(status.activePeers.length).toBe(1);
    expect(status.activePeers[0].peerId).toBe('ble-responder-99');
    expect(status.activePeers[0].transportType).toBe('ble');

    engine.unregisterPeer('ble-responder-99');
    expect(engine.getStatus().activePeers.length).toBe(0);
  });
});
