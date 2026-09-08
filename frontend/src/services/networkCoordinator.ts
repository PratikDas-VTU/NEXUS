import { RelayEngine } from '../../../networking/relayEngine';
import { SignalingClient } from '../../../networking/signalingClient';
import { WebSocketTransport } from '../../../networking/webSocketTransport';
import type { PeerDescriptor } from '../../../networking/types';
import type { TransportType } from '../../../shared/interfaces';
import type { INexusTransportProvider } from '../../../networking/transportProvider';
import { WebRtcTransportProvider } from '../../../networking/webRtcTransportProvider';
import { WebSocketTransportProvider } from '../../../networking/webSocketTransportProvider';
import { NativeTransportProvider } from '../../../networking/nativeTransportProvider';
import type { INativeMeshBridge } from '../../../networking/nativeBridge';
import { MultiTransportManager, type TransportHealth } from '../../../networking/multiTransportManager';

export interface NetworkCoordinatorOptions {
  deviceId: string;
  relayEngine: RelayEngine;
  signalingUrl?: string;
  nativeBridge?: INativeMeshBridge;
  nativeProvider?: NativeTransportProvider;
  enableNativeTransport?: boolean;
}

export interface PeerConnectionDiagnostic {
  peerId: string;
  connectionState: RTCPeerConnectionState | 'unsupported';
  iceConnectionState: RTCIceConnectionState | 'unsupported';
  dataChannelState: RTCDataChannelState | 'none';
  transportType: TransportType | 'none';
  updatedAt: number;
  availableTransports?: TransportType[];
  preferredTransport?: TransportType | 'none';
  health?: Record<string, TransportHealth>;
}

export interface NetworkLogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface NetworkDiagnostics {
  signalingState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  signalingUrl: string;
  signalingError: string | null;
  localDeviceId: string;
  discoveredPeers: PeerDescriptor[];
  peerDiagnostics: PeerConnectionDiagnostic[];
  activeTransportsCount: number;
  lastError: string | null;
  recentLogs: NetworkLogEntry[];
}

export class NetworkCoordinator {
  private deviceId: string;
  private relayEngine: RelayEngine;
  private signalingUrl: string;
  private signalingClient: SignalingClient | null = null;
  private webSocketTransports = new Map<string, WebSocketTransport>();
  private discoveredPeers = new Map<string, PeerDescriptor>();
  private fallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private isStarted = false;

  // Transport Providers & Multi-Transport Manager (Phase 2, 3, 4, 6)
  private webRtcProvider: WebRtcTransportProvider;
  private webSocketProvider: WebSocketTransportProvider;
  private nativeProvider?: NativeTransportProvider;
  private providers: INexusTransportProvider[];
  private multiTransportManager: MultiTransportManager;

  // Diagnostics
  private signalingState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';
  private signalingError: string | null = null;
  private lastError: string | null = null;
  private logs: NetworkLogEntry[] = [];
  private diagnosticListeners = new Set<(d: NetworkDiagnostics) => void>();
  private purgeListeners = new Set<(reason?: string) => void>();

  constructor(options: NetworkCoordinatorOptions) {
    this.deviceId = options.deviceId;
    this.relayEngine = options.relayEngine;
    this.signalingUrl = options.signalingUrl || 'ws://localhost:8080';

    // Initialize Multi-Transport Connection Manager (Phase 4)
    this.multiTransportManager = new MultiTransportManager({
      onLog: (level, msg) => this.log(level, msg),
      onPreferredTransportChange: (peerId, preferred) => {
        this.log('info', `Preferred transport changed for ${peerId}: ${preferred?.transportType || 'none'}`);
        this.notifyDiagnostics();
      },
    });

    // Wire MultiTransportManager to RelayEngine
    this.relayEngine.setTransportManager(this.multiTransportManager);

    // Initialize WebRTC transport provider with delegation hooks
    this.webRtcProvider = new WebRtcTransportProvider({
      localDeviceId: this.deviceId,
      signalingClient: null,
      onLog: (level, msg) => this.log(level, msg),
      onPeerConnected: (peerId) => {
        this.clearFallbackTimer(peerId);
        this.notifyDiagnostics();
      },
      onPeerFailed: (peerId) => {
        this.activateWebSocketFallback(peerId);
      },
      onStateChange: () => {
        this.notifyDiagnostics();
      },
    });

    // Initialize WebSocket fallback transport provider
    this.webSocketProvider = new WebSocketTransportProvider();

    // Initialize Native transport provider if configured or available
    if (options.nativeProvider) {
      this.nativeProvider = options.nativeProvider;
    } else if (options.nativeBridge || options.enableNativeTransport) {
      this.nativeProvider = new NativeTransportProvider({
        localDeviceId: this.deviceId,
        bridge: options.nativeBridge,
        onLog: (level, msg) => this.log(level, msg),
        onPeerDiscovered: (peerId) => {
          this.log('info', `[Native] Nearby peer discovered: ${peerId}`);
          this.notifyDiagnostics();
        },
        onPeerLost: (peerId) => {
          this.log('info', `[Native] Nearby peer lost: ${peerId}`);
          this.notifyDiagnostics();
        },
        onStateChange: () => {
          this.notifyDiagnostics();
        },
      });
    }

    this.providers = [this.webRtcProvider, this.webSocketProvider];
    if (this.nativeProvider) {
      this.providers.push(this.nativeProvider);
    }

    // Route transport-ready events from any provider into MultiTransportManager and RelayEngine
    for (const provider of this.providers) {
      this.bindProvider(provider);
    }

    this.log('info', `Coordinator initialized for device ${this.deviceId}`);

    this.relayEngine.onPurge = (fromPeerId, reason) => {
      this.log('warn', `Received PURGE over transport from ${fromPeerId}: ${reason || 'no reason'}`);
      this.notifyPurgeAll(reason);
    };
  }

  private bindProvider(provider: INexusTransportProvider): void {
    provider.onTransportReady((transport) => {
      this.multiTransportManager.registerTransport(transport);
      this.relayEngine.registerTransport(transport);
    });
  }

  public registerProvider(provider: INexusTransportProvider): void {
    if (this.providers.some((p) => p.id === provider.id)) return;
    this.providers.push(provider);
    if (provider.id === 'nearby' && provider instanceof NativeTransportProvider) {
      this.nativeProvider = provider;
    }
    this.bindProvider(provider);
    if (this.isStarted) {
      provider.start();
    }
    this.notifyDiagnostics();
  }

  public getNativeProvider(): NativeTransportProvider | undefined {
    return this.nativeProvider;
  }

  public getMultiTransportManager(): MultiTransportManager {
    return this.multiTransportManager;
  }

  public getProviders(): INexusTransportProvider[] {
    return [...this.providers];
  }

  public getProvider(id: string): INexusTransportProvider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  public updateDeviceId(newDeviceId: string): void {
    if (this.deviceId === newDeviceId) return;
    this.log('info', `Updating device ID from ${this.deviceId} to ${newDeviceId}`);
    this.deviceId = newDeviceId;
    this.webRtcProvider.setLocalDeviceId(newDeviceId);
    this.nativeProvider?.setLocalDeviceId(newDeviceId);

    if (this.isStarted) {
      this.restart().catch((err) => {
        this.log('error', `Failed to restart coordinator with new deviceId: ${err?.message}`);
      });
    }
  }

  public async start(customUrl?: string): Promise<void> {
    if (this.isStarted && (!customUrl || customUrl === this.signalingUrl)) return;
    if (this.isStarted) {
      await this.stop();
    }
    this.isStarted = true;

    for (const provider of this.providers) {
      provider.start();
    }

    const url = customUrl || this.signalingUrl;
    this.signalingUrl = url;
    this.signalingState = 'CONNECTING';
    this.signalingError = null;
    this.notifyDiagnostics();

    this.log('info', `Connecting to signaling server at ${url}...`);

    try {
      if (this.signalingClient) {
        this.signalingClient.disconnect();
        this.signalingClient = null;
      }

      this.signalingClient = new SignalingClient({
        serverUrl: url,
        peerId: this.deviceId,
        deviceId: this.deviceId,
        autoReconnect: true,
        onLog: (level, msg) => this.log(level, msg),
      });

      this.signalingClient.onConnecting = () => {
        this.signalingState = 'CONNECTING';
        this.notifyDiagnostics();
      };

      // Inject active signaling client into WebRTC provider
      this.webRtcProvider.setSignalingClient(this.signalingClient);

      this.signalingClient.onStateChange = (connected) => {
        this.signalingState = connected ? 'CONNECTED' : 'DISCONNECTED';
        if (connected) {
          this.signalingError = null;
          this.log('info', `Signaling connected to ${url}`);
        } else {
          this.log('warn', `Signaling disconnected from ${url}`);
        }
        this.relayEngine.setSignalingState(connected, url);
        this.notifyDiagnostics();
      };

      this.signalingClient.onPeerList = (peers) => {
        this.log('info', `Received peer list: ${peers.length} remote peer(s) found`);
        this.handlePeerList(peers);
      };

      this.signalingClient.onPeerJoined = (peer) => {
        this.log('info', `Remote peer joined LAN: ${peer.peerId}`);
        this.handlePeerJoined(peer);
      };

      this.signalingClient.onPeerLeft = (peerId) => {
        this.log('info', `Remote peer left LAN: ${peerId}`);
        this.discoveredPeers.delete(peerId);
        this.closePeer(peerId);
        this.notifyDiagnostics();
      };

      // Delegate WebRTC signaling messages directly to WebRtcTransportProvider
      this.signalingClient.onOffer = async (fromPeerId, sdp) => {
        this.log('info', `Received WebRTC OFFER from ${fromPeerId}`);
        this.scheduleFallbackTimer(fromPeerId);
        await this.webRtcProvider.handleOffer(fromPeerId, sdp as RTCSessionDescriptionInit);
      };

      this.signalingClient.onAnswer = async (fromPeerId, sdp) => {
        this.log('info', `Received WebRTC ANSWER from ${fromPeerId}`);
        await this.webRtcProvider.handleAnswer(fromPeerId, sdp as RTCSessionDescriptionInit);
      };

      this.signalingClient.onCandidate = async (fromPeerId, candidate) => {
        await this.webRtcProvider.handleCandidate(fromPeerId, candidate as RTCIceCandidateInit);
      };

      // Handle WebSocket fallback relay messages
      this.signalingClient.onRelayMessage = (fromPeerId, relayMsg) => {
        this.log('info', `Received RELAY message via WebSocket from ${fromPeerId}`);
        let wsTransport = this.webSocketTransports.get(fromPeerId);
        if (!wsTransport) {
          wsTransport = new WebSocketTransport({
            remotePeerId: fromPeerId,
            signalingClient: this.signalingClient!,
          });
          this.webSocketTransports.set(fromPeerId, wsTransport);
          this.webSocketProvider.emitTransportReady(wsTransport);
        }
        wsTransport.handleIncomingRelay(relayMsg);
        this.notifyDiagnostics();
      };

      this.signalingClient.onPurgeAll = (fromPeerId, reason) => {
        this.log('warn', `Received SIGNAL_PURGE_ALL from ${fromPeerId || 'signaler'}: ${reason || 'no reason'}`);
        this.notifyPurgeAll(reason);
      };

      await this.signalingClient.connect();
    } catch (err: any) {
      this.signalingState = 'DISCONNECTED';
      this.signalingError = err?.message || 'Signaling connection failed';
      this.lastError = this.signalingError;
      this.log('warn', `Signaling server unavailable at ${url}: ${this.signalingError}`);
      this.relayEngine.setSignalingState(false, url);
      this.notifyDiagnostics();
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  public async stop(): Promise<void> {
    this.isStarted = false;
    this.signalingState = 'DISCONNECTED';

    for (const provider of this.providers) {
      provider.stop();
    }
    this.multiTransportManager.closeAll();

    // Clear fallback timers
    for (const timer of this.fallbackTimers.values()) {
      clearTimeout(timer);
    }
    this.fallbackTimers.clear();

    if (this.signalingClient) {
      this.signalingClient.disconnect();
      this.signalingClient = null;
    }
    this.webRtcProvider.setSignalingClient(null);

    for (const ws of this.webSocketTransports.values()) {
      try {
        ws.close();
      } catch (_) {}
    }
    this.webSocketTransports.clear();
    this.discoveredPeers.clear();

    await this.relayEngine.stop();
    this.notifyDiagnostics();
  }

  // ─── PEER DISCOVERY & HANDSHAKE ────────────────────────────────────────────

  private handlePeerList(peers: PeerDescriptor[]): void {
    for (const peer of peers) {
      if (peer.peerId !== this.deviceId) {
        this.discoveredPeers.set(peer.peerId, peer);
        this.scheduleFallbackTimer(peer.peerId);
        this.webRtcProvider.handlePeerDiscovered(peer.peerId);
      }
    }
    this.notifyDiagnostics();
  }

  private handlePeerJoined(peer: PeerDescriptor): void {
    if (peer.peerId !== this.deviceId) {
      this.discoveredPeers.set(peer.peerId, peer);
      this.scheduleFallbackTimer(peer.peerId);
      this.webRtcProvider.handlePeerDiscovered(peer.peerId);
    }
    this.notifyDiagnostics();
  }

  /**
   * Schedule WebSocket relay fallback if WebRTC fails to open within 3.5s.
   * Guarantees mesh functionality even on networks with AP client isolation or blocked mDNS.
   */
  private scheduleFallbackTimer(remotePeerId: string): void {
    if (this.fallbackTimers.has(remotePeerId)) return;

    const timer = setTimeout(() => {
      this.fallbackTimers.delete(remotePeerId);
      const isRtcOpen = this.webRtcProvider.isTransportOpen(remotePeerId);
      if (!isRtcOpen) {
        this.log('info', `WebRTC connection pending for ${remotePeerId}. Activating local WebSocket fallback transport.`);
        this.activateWebSocketFallback(remotePeerId);
      }
    }, 3500);

    this.fallbackTimers.set(remotePeerId, timer);
  }

  private activateWebSocketFallback(remotePeerId: string): void {
    if (!this.signalingClient || !this.signalingClient.isConnected()) return;
    if (this.webSocketTransports.has(remotePeerId)) return;

    const wsTransport = new WebSocketTransport({
      remotePeerId,
      signalingClient: this.signalingClient,
    });

    this.webSocketTransports.set(remotePeerId, wsTransport);
    this.webSocketProvider.emitTransportReady(wsTransport);
    this.notifyDiagnostics();
  }

  private clearFallbackTimer(peerId: string): void {
    const timer = this.fallbackTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.fallbackTimers.delete(peerId);
    }
  }

  private closePeer(peerId: string): void {
    this.clearFallbackTimer(peerId);
    this.webRtcProvider.closePeer(peerId);

    const ws = this.webSocketTransports.get(peerId);
    if (ws) {
      ws.close();
      this.webSocketTransports.delete(peerId);
    }

    this.multiTransportManager.removeTransport(peerId);
    this.relayEngine.unregisterPeer(peerId);
    this.notifyDiagnostics();
  }

  // ─── DIAGNOSTICS & TELEMETRY ───────────────────────────────────────────────

  public getDiagnostics(): NetworkDiagnostics {
    const peerDiagnostics: PeerConnectionDiagnostic[] = [];
    const allKnownPeerIds = new Set<string>([
      ...this.discoveredPeers.keys(),
      ...this.webRtcProvider.getActivePeerIds(),
      ...this.webSocketTransports.keys(),
      ...this.multiTransportManager.getAllPeerIds(),
    ]);

    for (const peerId of allKnownPeerIds) {
      const rtcDiag = this.webRtcProvider.getPeerDiagnostic(peerId);
      const wsTransport = this.webSocketTransports.get(peerId);
      const availableTransports = this.multiTransportManager.getAvailableTransportTypes(peerId);
      const preferred = this.multiTransportManager.getPreferredTransport(peerId);
      const health = this.multiTransportManager.getAllHealth(peerId);

      let transportType: TransportType | 'none' = 'none';
      if (preferred && preferred.isOpen()) {
        transportType = preferred.transportType;
      } else if (rtcDiag && rtcDiag.isOpen) {
        transportType = 'webrtc';
      } else if (wsTransport && wsTransport.isOpen()) {
        transportType = 'websocket';
      }

      peerDiagnostics.push({
        peerId,
        connectionState: rtcDiag ? rtcDiag.connectionState : 'unsupported',
        iceConnectionState: rtcDiag ? rtcDiag.iceConnectionState : 'unsupported',
        dataChannelState: rtcDiag ? rtcDiag.dataChannelState : 'none',
        transportType,
        updatedAt: Date.now(),
        availableTransports,
        preferredTransport: preferred ? preferred.transportType : 'none',
        health,
      });
    }

    return {
      signalingState: this.signalingState,
      signalingUrl: this.signalingUrl,
      signalingError: this.signalingError,
      localDeviceId: this.deviceId,
      discoveredPeers: Array.from(this.discoveredPeers.values()),
      peerDiagnostics,
      activeTransportsCount: this.relayEngine.getStatus().activePeers.length,
      lastError: this.lastError,
      recentLogs: [...this.logs],
    };
  }

  public subscribeDiagnostics(callback: (d: NetworkDiagnostics) => void): () => void {
    this.diagnosticListeners.add(callback);
    callback(this.getDiagnostics());
    return () => {
      this.diagnosticListeners.delete(callback);
    };
  }

  private notifyDiagnostics(): void {
    const diag = this.getDiagnostics();
    for (const listener of this.diagnosticListeners) {
      try {
        listener(diag);
      } catch (err) {
        console.error('[NetworkCoordinator] Error in diagnostics listener:', err);
      }
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const entry: NetworkLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      level,
      message,
    };

    if (level === 'error') {
      console.error(`[NetworkCoordinator] ${message}`);
    } else if (level === 'warn') {
      console.warn(`[NetworkCoordinator] ${message}`);
    } else {
      console.log(`[NetworkCoordinator] ${message}`);
    }

    this.logs.unshift(entry);
    if (this.logs.length > 40) {
      this.logs.pop();
    }
    this.notifyDiagnostics();
  }

  // ─── NETWORK-WIDE PURGE ORCHESTRATION ────────────────────────────────────

  public broadcastPurgeAll(reason?: string): void {
    this.log('warn', `Broadcasting network-wide PURGE to all peers and signaler: ${reason || 'User initiated'}`);
    if (this.signalingClient && this.signalingClient.isConnected()) {
      try {
        this.signalingClient.sendPurgeAll(reason);
      } catch (err: any) {
        this.log('error', `Failed to send SIGNAL_PURGE_ALL via WebSocket: ${err?.message}`);
      }
    }
    this.relayEngine.broadcastPurge(reason).catch((err: any) => {
      this.log('error', `Failed to broadcast PURGE via peer transports: ${err?.message}`);
    });
  }

  public onPurgeAll(callback: (reason?: string) => void): () => void {
    this.purgeListeners.add(callback);
    return () => {
      this.purgeListeners.delete(callback);
    };
  }

  private notifyPurgeAll(reason?: string): void {
    this.log('warn', `Executing network purge callback for all registered listeners: ${reason || 'no reason'}`);
    for (const listener of this.purgeListeners) {
      try {
        listener(reason);
      } catch (err) {
        console.error('[NetworkCoordinator] Error in purge listener:', err);
      }
    }
  }
}
