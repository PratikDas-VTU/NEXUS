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
  SignalRelayMessage,
} from './types.ts';

export interface SignalingClientOptions {
  serverUrl: string;
  peerId: string;
  deviceId: DeviceId;
  autoReconnect?: boolean;
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export type PeerListHandler = (peers: PeerDescriptor[]) => void;
export type PeerJoinedHandler = (peer: PeerDescriptor) => void;
export type PeerLeftHandler = (peerId: string) => void;
export type OfferHandler = (fromPeerId: string, sdp: unknown) => void;
export type AnswerHandler = (fromPeerId: string, sdp: unknown) => void;
export type CandidateHandler = (fromPeerId: string, candidate: unknown) => void;
export type RelayMessageHandler = (fromPeerId: string, relayMessage: unknown) => void;
export type ConnectionStateChangeHandler = (connected: boolean) => void;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private options: SignalingClientOptions;
  private isExplicitlyClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  // Event handlers
  public onPeerList?: PeerListHandler;
  public onPeerJoined?: PeerJoinedHandler;
  public onPeerLeft?: PeerLeftHandler;
  public onOffer?: OfferHandler;
  public onAnswer?: AnswerHandler;
  public onCandidate?: CandidateHandler;
  public onRelayMessage?: RelayMessageHandler;
  public onStateChange?: ConnectionStateChangeHandler;
  public onConnecting?: (url: string) => void;
  public onPurgeAll?: (fromPeerId?: string, reason?: string) => void;

  constructor(options: SignalingClientOptions) {
    this.options = { autoReconnect: true, ...options };
    this.log('info', `SIGNALER_URL: Initialized target ${this.options.serverUrl}`);
  }

  public log(level: 'info' | 'warn' | 'error', message: string): void {
    if (this.options.onLog) {
      this.options.onLog(level, message);
    }
    const formatted = `[SignalingClient] ${message}`;
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  public getReadyStateName(): string {
    if (!this.socket) return 'CLOSED';
    switch (this.socket.readyState) {
      case 0: return 'CONNECTING';
      case 1: return 'OPEN';
      case 2: return 'CLOSING';
      case 3: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  public setServerUrl(newUrl: string): void {
    if (this.options.serverUrl === newUrl) return;
    this.options.serverUrl = newUrl;
    this.log('info', `SIGNALER_URL: Updated target ${newUrl}`);
  }

  public getServerUrl(): string {
    return this.options.serverUrl;
  }

  public connect(): Promise<void> {
    this.isExplicitlyClosed = false;

    // Clean up any lingering socket before creating a new one
    if (this.socket) {
      try {
        this.socket.onopen = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.onmessage = null;
        this.socket.close();
      } catch {}
      this.socket = null;
    }

    this.reconnectAttempts++;
    this.onConnecting?.(this.options.serverUrl);
    this.log('info', `CONNECT_ATTEMPT: Target ${this.options.serverUrl} (attempt #${this.reconnectAttempts})`);

    return new Promise((resolve, reject) => {
      try {
        const WebSocketImpl =
          typeof WebSocket !== 'undefined'
            ? WebSocket
            : (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket;

        if (!WebSocketImpl) {
          const err = new Error('WebSocket environment not available');
          this.log('error', `CONNECT_ERROR: ${err.message}`);
          throw err;
        }

        const currentSocket = new WebSocketImpl(this.options.serverUrl);
        this.socket = currentSocket;

        let isSettled = false;
        const safeResolve = () => {
          if (!isSettled) {
            isSettled = true;
            resolve();
          }
        };
        const safeReject = (err: Error) => {
          if (!isSettled) {
            isSettled = true;
            reject(err);
          }
        };

        currentSocket.onopen = () => {
          if (this.socket !== currentSocket) return;
          this.reconnectAttempts = 0;
          this.log('info', `CONNECT_OPEN: Successfully connected to ${this.options.serverUrl}`);
          this.onStateChange?.(true);

          // Announce presence with SIGNAL_JOIN
          this.sendRaw({
            type: 'SIGNAL_JOIN',
            peerId: this.options.peerId,
            deviceId: this.options.deviceId,
            timestamp: Date.now(),
          });

          safeResolve();
        };

        currentSocket.onmessage = (event: MessageEvent) => {
          if (this.socket !== currentSocket) return;
          try {
            const data = typeof event.data === 'string' ? event.data : event.data.toString();
            const msg: SignalingMessage = JSON.parse(data);
            this.handleSignalingMessage(msg);
          } catch (err) {
            this.log('warn', `Failed to parse signaling payload: ${err}`);
          }
        };

        currentSocket.onerror = (err: any) => {
          if (this.socket !== currentSocket) return;
          const state = this.getReadyStateName();
          const detail = err?.message || (err?.type ? `event: ${err.type}` : 'socket error');
          this.log('warn', `CONNECT_ERROR: Error on ${this.options.serverUrl} (readyState: ${state}, detail: ${detail})`);
          this.onStateChange?.(false);
          safeReject(new Error(`WebSocket connection error on ${this.options.serverUrl} (state: ${state})`));
        };

        currentSocket.onclose = (event: CloseEvent | any) => {
          if (this.socket === currentSocket) {
            this.socket = null;
          }
          const code = event?.code ?? 1006;
          const reason = event?.reason || 'none';
          const clean = event?.wasClean ?? false;
          this.log('warn', `CONNECT_CLOSE: Closed on ${this.options.serverUrl} (code: ${code}, reason: '${reason}', clean: ${clean})`);
          this.onStateChange?.(false);
          safeReject(new Error(`WebSocket closed on ${this.options.serverUrl} (code: ${code})`));
          if (!this.isExplicitlyClosed && this.options.autoReconnect) {
            this.scheduleReconnect();
          }
        };
      } catch (err: any) {
        this.log('error', `CONNECT_ERROR: Immediate failure on ${this.options.serverUrl}: ${err?.message || err}`);
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
      try {
        this.socket.onopen = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.onmessage = null;
        this.socket.close(1000, 'Client disconnected');
      } catch {}
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

  public sendRelay(toPeerId: string, relayMessage: unknown): void {
    const msg: SignalRelayMessage = {
      type: 'SIGNAL_RELAY',
      fromPeerId: this.options.peerId,
      toPeerId,
      relayMessage,
      timestamp: Date.now(),
    };
    this.sendRaw(msg);
  }

  public sendPurgeAll(reason?: string): void {
    this.sendRaw({
      type: 'SIGNAL_PURGE_ALL',
      fromPeerId: this.options.peerId,
      reason: reason || 'User requested complete network wipe',
      timestamp: Date.now(),
    });
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
      case 'SIGNAL_RELAY':
        this.onRelayMessage?.(msg.fromPeerId, msg.relayMessage);
        break;
      case 'SIGNAL_PURGE_ALL':
        this.onPurgeAll?.(msg.fromPeerId, msg.reason);
        break;
      case 'SIGNAL_ERROR':
        console.error('[SignalingClient] Server error message:', msg.error);
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(1.3, Math.min(this.reconnectAttempts, 5)), 4000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed) {
        this.connect().catch((err) => {
          this.log('warn', `Reconnect attempt failed on ${this.options.serverUrl}: ${err?.message || err}`);
        });
      }
    }, delay);
  }
}
