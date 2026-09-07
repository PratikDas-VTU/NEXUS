/**
 * NEXUS — Offline-First Emergency & Community Network
 * Local LAN WebSocket Transport Fallback
 * 
 * Implements the Hour-9 Decision Gate Fallback:
 * If WebRTC DataChannel is blocked due to venue AP isolation,
 * this transport carries the EXACT same relay protocol messages
 * over the local LAN WebSocket connection between real devices.
 */

import type { ITransport } from '../shared/interfaces.ts';
import type { RelayMessage } from '../shared/protocol.ts';
import { isRelayMessage } from '../shared/protocol.ts';

export interface WsTransportOptions {
  remotePeerId: string;
  socket: WebSocket;
}

export class WsTransport implements ITransport {
  public readonly transportType = 'websocket' as const;
  public readonly remotePeerId: string;

  private socket: WebSocket;
  private messageHandlers: Array<(message: RelayMessage) => void> = [];
  private closeHandlers: Array<(reason?: string) => void> = [];

  constructor(options: WsTransportOptions) {
    this.remotePeerId = options.remotePeerId;
    this.socket = options.socket;

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : event.data.toString();
        const parsed = JSON.parse(raw);
        if (isRelayMessage(parsed)) {
          for (const handler of this.messageHandlers) {
            handler(parsed);
          }
        }
      } catch (err) {
        console.warn('[WsTransport] Failed to parse message from peer:', err);
      }
    };

    this.socket.onclose = () => {
      this.triggerClose('WebSocket closed');
    };

    this.socket.onerror = (err) => {
      console.error('[WsTransport] Error on socket for peer', this.remotePeerId, err);
      this.triggerClose('WebSocket error');
    };
  }

  public isOpen(): boolean {
    return this.socket.readyState === 1; // 1 = OPEN
  }

  public async send(message: RelayMessage): Promise<void> {
    if (!this.isOpen()) {
      throw new Error(`[WsTransport] Socket to ${this.remotePeerId} is not open`);
    }

    this.socket.send(JSON.stringify(message));
  }

  public onMessage(handler: (message: RelayMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  public onClose(handler: (reason?: string) => void): void {
    this.closeHandlers.push(handler);
  }

  public close(): void {
    try {
      this.socket.close();
    } catch (_) {}
    this.triggerClose('Explicitly closed');
  }

  private triggerClose(reason?: string): void {
    for (const handler of this.closeHandlers) {
      handler(reason);
    }
  }
}
