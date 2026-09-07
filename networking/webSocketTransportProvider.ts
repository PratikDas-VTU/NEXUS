/**
 * NEXUS — Offline-First Emergency & Community Network
 * WebSocket Fallback Transport Provider (Phase 2)
 * 
 * Minimal provider wrapper exposing the WebSocket fallback relay mechanism
 * through the INexusTransportProvider contract.
 */

import type { NexusTransport, TransportType } from '../shared/interfaces.ts';
import type { INexusTransportProvider } from './transportProvider.ts';
import { WebSocketTransport, type WebSocketTransportOptions } from './webSocketTransport.ts';

export class WebSocketTransportProvider implements INexusTransportProvider {
  public readonly id = 'websocket';
  public readonly name = 'WebSocket Relay';
  public readonly transportType: TransportType = 'websocket';
  public readonly priority = 50;

  private transportReadyHandlers: Array<(transport: NexusTransport) => void> = [];
  private peerDiscoveredHandlers: Array<(peerId: string) => void> = [];
  private peerLostHandlers: Array<(peerId: string) => void> = [];
  private isRunning = false;

  public isSupported(): boolean {
    return (
      typeof WebSocket !== 'undefined' ||
      (typeof globalThis !== 'undefined' && typeof (globalThis as any).WebSocket !== 'undefined')
    );
  }

  public start(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
  }

  public onTransportReady(handler: (transport: NexusTransport) => void): void {
    this.transportReadyHandlers.push(handler);
  }

  public onPeerDiscovered(handler: (peerId: string) => void): void {
    this.peerDiscoveredHandlers.push(handler);
  }

  public onPeerLost(handler: (peerId: string) => void): void {
    this.peerLostHandlers.push(handler);
  }

  /**
   * Factory helper to create a WebSocketTransport instance.
   */
  public createTransport(options: WebSocketTransportOptions): WebSocketTransport {
    return new WebSocketTransport(options);
  }

  /**
   * Emits an established NexusTransport to registered listeners.
   */
  public emitTransportReady(transport: NexusTransport): void {
    for (const handler of this.transportReadyHandlers) {
      try {
        handler(transport);
      } catch (err) {
        console.error('[WebSocketTransportProvider] Error in transportReady handler:', err);
      }
    }
  }

  public emitPeerDiscovered(peerId: string): void {
    for (const handler of this.peerDiscoveredHandlers) {
      try {
        handler(peerId);
      } catch (err) {
        console.error('[WebSocketTransportProvider] Error in peerDiscovered handler:', err);
      }
    }
  }

  public emitPeerLost(peerId: string): void {
    for (const handler of this.peerLostHandlers) {
      try {
        handler(peerId);
      } catch (err) {
        console.error('[WebSocketTransportProvider] Error in peerLost handler:', err);
      }
    }
  }
}
