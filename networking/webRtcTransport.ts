/**
 * NEXUS — Offline-First Emergency & Community Network
 * WebRTC DataChannel Peer Transport Implementation
 * 
 * Implements direct P2P data transport between physical devices over local LAN.
 * Follows the blueprint: "Use direct local WebRTC first. Do not make TURN a core MVP dependency."
 */

import type { ITransport } from '../shared/interfaces.ts';
import type { RelayMessage } from '../shared/protocol.ts';
import { isRelayMessage } from '../shared/protocol.ts';

export interface WebRtcTransportOptions {
  remotePeerId: string;
  peerConnection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
}

export class WebRtcTransport implements ITransport {
  public readonly transportType = 'webrtc' as const;
  public readonly remotePeerId: string;

  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private messageHandlers: Array<(message: RelayMessage) => void> = [];
  private closeHandlers: Array<(reason?: string) => void> = [];

  constructor(options: WebRtcTransportOptions) {
    this.remotePeerId = options.remotePeerId;
    this.pc = options.peerConnection;

    if (options.dataChannel) {
      this.attachChannel(options.dataChannel);
    } else {
      // Listen for incoming channel if we are the callee
      this.pc.ondatachannel = (event: RTCDataChannelEvent) => {
        if (event.channel.label === 'nexus-relay' || !this.channel) {
          this.attachChannel(event.channel);
        }
      };
    }

    this.pc.onconnectionstatechange = () => {
      if (
        this.pc.connectionState === 'disconnected' ||
        this.pc.connectionState === 'failed' ||
        this.pc.connectionState === 'closed'
      ) {
        this.triggerClose(`Connection state changed to ${this.pc.connectionState}`);
      }
    };
  }

  public attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;

    this.channel.onmessage = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : event.data.toString();
        const parsed = JSON.parse(raw);
        if (isRelayMessage(parsed)) {
          for (const handler of this.messageHandlers) {
            handler(parsed);
          }
        } else {
          console.warn('[WebRtcTransport] Received payload that is not a valid RelayMessage');
        }
      } catch (err) {
        console.warn('[WebRtcTransport] Malformed JSON packet received from peer:', err);
      }
    };

    this.channel.onclose = () => {
      this.triggerClose('DataChannel closed');
    };

    this.channel.onerror = (err) => {
      console.error('[WebRtcTransport] DataChannel error with peer', this.remotePeerId, err);
      this.triggerClose('DataChannel error');
    };
  }

  public isOpen(): boolean {
    return this.channel !== null && this.channel.readyState === 'open';
  }

  public async send(message: RelayMessage): Promise<void> {
    if (!this.isOpen() || !this.channel) {
      throw new Error(`[WebRtcTransport] Cannot send: DataChannel to ${this.remotePeerId} is not open`);
    }

    const payload = JSON.stringify(message);
    this.channel.send(payload);
  }

  public onMessage(handler: (message: RelayMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  public onClose(handler: (reason?: string) => void): void {
    this.closeHandlers.push(handler);
  }

  public close(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch (_) {}
      this.channel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch (_) {}
    }
    this.triggerClose('Explicitly closed');
  }

  private triggerClose(reason?: string): void {
    for (const handler of this.closeHandlers) {
      handler(reason);
    }
  }
}
