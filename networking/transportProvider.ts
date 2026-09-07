/**
 * NEXUS — Offline-First Emergency & Community Network
 * Transport Provider Abstraction Contract (Phase 2)
 * 
 * Defines the subsystem lifecycle boundary for transport implementations
 * (WebRTC, WebSocket fallback, and future native transports like BLE / Wi-Fi Direct).
 */

import type { NexusTransport, TransportType } from '../shared/interfaces.ts';

export interface INexusTransportProvider {
  readonly id: string;
  readonly name: string;
  readonly transportType: TransportType;
  readonly priority: number;

  isSupported(): boolean;

  start(): Promise<void> | void;

  stop(): Promise<void> | void;

  onTransportReady(
    handler: (transport: NexusTransport) => void
  ): void;

  onPeerDiscovered?(
    handler: (peerId: string) => void
  ): void;

  onPeerLost?(
    handler: (peerId: string) => void
  ): void;
}
