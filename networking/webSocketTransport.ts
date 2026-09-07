/**
 * NEXUS — Offline-First Emergency & Community Network
 * Local LAN WebSocket Fallback Transport Implementation
 * 
 * Provides resilient, zero-internet store-carry-forward relay transport
 * across devices on the same Wi-Fi router / hotspot when WebRTC direct P2P
 * is blocked by router AP client isolation or NAT restrictions.
 */

import type { ITransport } from '../shared/interfaces.ts';
import type { RelayMessage } from '../shared/protocol.ts';
import { isRelayMessage } from '../shared/protocol.ts';
import type { SignalingClient } from './signalingClient.ts';

export interface WebSocketTransportOptions {
  remotePeerId: string;
  signalingClient: SignalingClient;
}

export class WebSocketTransport implements ITransport {
  public readonly transportType = 'websocket' as const;
  public readonly remotePeerId: string;

  private signalingClient: SignalingClient;
  private messageHandlers: Array<(message: RelayMessage) => void> = [];
  private closeHandlers: Array<(reason?: string) => void> = [];
  private isClosed = false;

  constructor(options: WebSocketTransportOptions) {
    this.remotePeerId = options.remotePeerId;
    this.signalingClient = options.signalingClient;
  }

  public isOpen(): boolean {
    return !this.isClosed && this.signalingClient.isConnected();
  }

  public async send(message: RelayMessage): Promise<void> {
    if (!this.isOpen()) {
      throw new Error(`[WebSocketTransport] Cannot send: socket to ${this.remotePeerId} is not connected`);
    }
    this.signalingClient.sendRelay(this.remotePeerId, message);
  }

  public handleIncomingRelay(message: unknown): void {
    if (this.isClosed) return;
    if (isRelayMessage(message)) {
      for (const handler of this.messageHandlers) {
        try {
          handler(message);
        } catch (err) {
          console.warn('[WebSocketTransport] Message handler error:', err);
        }
      }
    } else {
      console.warn('[WebSocketTransport] Received non-relay payload from peer:', this.remotePeerId);
    }
  }

  public onMessage(handler: (message: RelayMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  public onClose(handler: (reason?: string) => void): void {
    this.closeHandlers.push(handler);
  }

  public close(reason = 'Explicitly closed'): void {
    if (this.isClosed) return;
    this.isClosed = true;
    for (const handler of this.closeHandlers) {
      try {
        handler(reason);
      } catch (_) {}
    }
  }
}
