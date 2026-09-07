/**
 * NEXUS — Offline-First Emergency & Community Network
 * Local LAN Signaling Client
 * 
 * Works in modern browsers (standard WebSocket) and Node.js (global.WebSocket in Node 22+).
 * Handles local peer discovery and SDP/ICE signaling message routing.
 */

import type { DeviceId } from '../shared/types.ts';
import type {
  PeerDescriptor,
  SignalAnswerMessage,
  SignalCandidateMessage,
  SignalingMessage,
  SignalOfferMessage,
} from './types.ts';

export interface SignalingClientOptions {
  serverUrl: string;
  peerId: string;
  deviceId: DeviceId;
  autoReconnect?: boolean;
}

export type PeerListHandler = (peers: PeerDescriptor[]) => void;
export type PeerJoinedHandler = (peer: PeerDescriptor) => void;
export type PeerLeftHandler = (peerId: string) => void;
export type OfferHandler = (fromPeerId: string, sdp: unknown) => void;
export type AnswerHandler = (fromPeerId: string, sdp: unknown) => void;
export type CandidateHandler = (fromPeerId: string, candidate: unknown) => void;
export type ConnectionStateChangeHandler = (connected: boolean) => void;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private options: SignalingClientOptions;
  private isExplicitlyClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Event handlers
  public onPeerList?: PeerListHandler;
  public onPeerJoined?: PeerJoinedHandler;
  public onPeerLeft?: PeerLeftHandler;
  public onOffer?: OfferHandler;
  public onAnswer?: AnswerHandler;
  public onCandidate?: CandidateHandler;
  public onStateChange?: ConnectionStateChangeHandler;

  constructor(options: SignalingClientOptions) {
    this.options = { autoReconnect: true, ...options };
  }

  public connect(): Promise<void> {
    this.isExplicitlyClosed = false;

    return new Promise((resolve, reject) => {
      try {
        const WebSocketImpl =
          typeof WebSocket !== 'undefined'
            ? WebSocket
            : (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket;

        if (!WebSocketImpl) {
          throw new Error('WebSocket environment not available');
        }

        this.socket = new WebSocketImpl(this.options.serverUrl);

        this.socket.onopen = () => {
          this.onStateChange?.(true);

          // Announce presence with SIGNAL_JOIN
          this.sendRaw({
            type: 'SIGNAL_JOIN',
            peerId: this.options.peerId,
            deviceId: this.options.deviceId,
            timestamp: Date.now(),
          });

          resolve();
        };

        this.socket.onmessage = (event: MessageEvent) => {
          try {
            const data = typeof event.data === 'string' ? event.data : event.data.toString();
            const msg: SignalingMessage = JSON.parse(data);
            this.handleSignalingMessage(msg);
          } catch (err) {
            console.warn('[SignalingClient] Failed to parse signaling payload:', err);
          }
        };

        this.socket.onerror = (err) => {
          console.warn('[SignalingClient] Connection error on:', this.options.serverUrl);
          this.onStateChange?.(false);
        };

        this.socket.onclose = () => {
          this.onStateChange?.(false);
          this.socket = null;
          if (!this.isExplicitlyClosed && this.options.autoReconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.onStateChange?.(false);
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === 1; // 1 = OPEN
  }

  public sendOffer(toPeerId: string, sdp: unknown): void {
    const msg: SignalOfferMessage = {
      type: 'SIGNAL_OFFER',
      fromPeerId: this.options.peerId,
      toPeerId,
      sdp,
      timestamp: Date.now(),
    };
    this.sendRaw(msg);
  }

  public sendAnswer(toPeerId: string, sdp: unknown): void {
    const msg: SignalAnswerMessage = {
      type: 'SIGNAL_ANSWER',
      fromPeerId: this.options.peerId,
      toPeerId,
      sdp,
      timestamp: Date.now(),
    };
    this.sendRaw(msg);
  }

  public sendCandidate(toPeerId: string, candidate: unknown): void {
    const msg: SignalCandidateMessage = {
      type: 'SIGNAL_CANDIDATE',
      fromPeerId: this.options.peerId,
      toPeerId,
      candidate,
      timestamp: Date.now(),
    };
    this.sendRaw(msg);
  }

  private sendRaw(msg: SignalingMessage): void {
    if (this.isConnected() && this.socket) {
      this.socket.send(JSON.stringify(msg));
    } else {
      console.warn('[SignalingClient] Cannot send message; socket not open');
    }
  }

  private handleSignalingMessage(msg: SignalingMessage): void {
    switch (msg.type) {
      case 'SIGNAL_PEERS':
        this.onPeerList?.(msg.peers);
        break;
      case 'SIGNAL_PEER_JOINED':
        this.onPeerJoined?.(msg.peer);
        break;
      case 'SIGNAL_PEER_LEFT':
        this.onPeerLeft?.(msg.peerId);
        break;
      case 'SIGNAL_OFFER':
        this.onOffer?.(msg.fromPeerId, msg.sdp);
        break;
      case 'SIGNAL_ANSWER':
        this.onAnswer?.(msg.fromPeerId, msg.sdp);
        break;
      case 'SIGNAL_CANDIDATE':
        this.onCandidate?.(msg.fromPeerId, msg.candidate);
        break;
      case 'SIGNAL_ERROR':
        console.error('[SignalingClient] Server error message:', msg.error);
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed) {
        this.connect().catch(() => {});
      }
    }, 3000);
  }
}
