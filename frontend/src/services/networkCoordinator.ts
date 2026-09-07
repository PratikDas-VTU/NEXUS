import { RelayEngine } from '../../../networking/relayEngine';
import { SignalingClient } from '../../../networking/signalingClient';
import { WebRtcTransport } from '../../../networking/webRtcTransport';
import { WebSocketTransport } from '../../../networking/webSocketTransport';
import type { PeerDescriptor } from '../../../networking/types';

export interface NetworkCoordinatorOptions {
  deviceId: string;
  relayEngine: RelayEngine;
  signalingUrl?: string;
}

export interface PeerConnectionDiagnostic {
  peerId: string;
  connectionState: RTCPeerConnectionState | 'unsupported';
  iceConnectionState: RTCIceConnectionState | 'unsupported';
  dataChannelState: RTCDataChannelState | 'none';
  transportType: 'webrtc' | 'websocket' | 'none';
  updatedAt: number;
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

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 0,
};

export class NetworkCoordinator {
  private deviceId: string;
  private relayEngine: RelayEngine;
  private signalingUrl: string;
  private signalingClient: SignalingClient | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private webRtcTransports = new Map<string, WebRtcTransport>();
  private webSocketTransports = new Map<string, WebSocketTransport>();
  private discoveredPeers = new Map<string, PeerDescriptor>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private fallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private isStarted = false;

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
    this.log('info', `Coordinator initialized for device ${this.deviceId}`);

    this.relayEngine.onPurge = (fromPeerId, reason) => {
      this.log('warn', `Received PURGE over transport from ${fromPeerId}: ${reason || 'no reason'}`);
      this.notifyPurgeAll(reason);
    };
  }

  public updateDeviceId(newDeviceId: string): void {
    if (this.deviceId === newDeviceId) return;
    this.log('info', `Updating device ID from ${this.deviceId} to ${newDeviceId}`);
    this.deviceId = newDeviceId;
    if (this.isStarted) {
      this.restart().catch((err) => {
        this.log('error', `Failed to restart coordinator with new deviceId: ${err?.message}`);
      });
    }
  }

  public async start(customUrl?: string): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    const url = customUrl || this.signalingUrl;
    this.signalingUrl = url;
    this.signalingState = 'CONNECTING';
    this.signalingError = null;
    this.notifyDiagnostics();

    this.log('info', `Connecting to signaling server at ${url}...`);

    try {
      this.signalingClient = new SignalingClient({
        serverUrl: url,
        peerId: this.deviceId,
        deviceId: this.deviceId,
        autoReconnect: true,
      });

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

      this.signalingClient.onOffer = async (fromPeerId, sdp) => {
        this.log('info', `Received WebRTC OFFER from ${fromPeerId}`);
        await this.handleOffer(fromPeerId, sdp as RTCSessionDescriptionInit);
      };

      this.signalingClient.onAnswer = async (fromPeerId, sdp) => {
        this.log('info', `Received WebRTC ANSWER from ${fromPeerId}`);
        await this.handleAnswer(fromPeerId, sdp as RTCSessionDescriptionInit);
      };

      this.signalingClient.onCandidate = async (fromPeerId, candidate) => {
        await this.handleCandidate(fromPeerId, candidate as RTCIceCandidateInit);
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
          this.relayEngine.registerTransport(wsTransport);
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

    // Clear fallback timers
    for (const timer of this.fallbackTimers.values()) {
      clearTimeout(timer);
    }
    this.fallbackTimers.clear();

    if (this.signalingClient) {
      this.signalingClient.disconnect();
      this.signalingClient = null;
    }

    for (const [peerId, pc] of this.peerConnections) {
      try {
        pc.close();
      } catch (_) {}
      this.clearPendingCandidates(peerId);
    }
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.webRtcTransports.clear();
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
        // Deterministic collision breaker: lower ID initiates
        if (this.deviceId < peer.peerId) {
          this.log('info', `Deterministic initiator: ${this.deviceId} < ${peer.peerId}. Initiating WebRTC.`);
          this.initiatePeerConnection(peer.peerId);
        } else {
          this.log('info', `Deterministic callee: awaiting offer from ${peer.peerId}`);
          this.scheduleFallbackTimer(peer.peerId);
        }
      }
    }
    this.notifyDiagnostics();
  }

  private handlePeerJoined(peer: PeerDescriptor): void {
    if (peer.peerId !== this.deviceId) {
      this.discoveredPeers.set(peer.peerId, peer);
      if (this.deviceId < peer.peerId) {
        this.log('info', `Deterministic initiator for newly joined peer: ${this.deviceId} < ${peer.peerId}`);
        this.initiatePeerConnection(peer.peerId);
      } else {
        this.log('info', `Deterministic callee for newly joined peer: awaiting offer from ${peer.peerId}`);
        this.scheduleFallbackTimer(peer.peerId);
      }
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
      const existingRtc = this.webRtcTransports.get(remotePeerId);
      if (!existingRtc || !existingRtc.isOpen()) {
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
    this.relayEngine.registerTransport(wsTransport);
    this.notifyDiagnostics();
  }

  // ─── WEBRTC CONNECTION INITIATION (OFFERER) ────────────────────────────────

  private async initiatePeerConnection(remotePeerId: string): Promise<void> {
    if (this.peerConnections.has(remotePeerId)) return;
    if (typeof RTCPeerConnection === 'undefined') {
      this.log('warn', 'RTCPeerConnection not available in this browser environment');
      this.activateWebSocketFallback(remotePeerId);
      return;
    }

    try {
      this.scheduleFallbackTimer(remotePeerId);

      const pc = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
      this.peerConnections.set(remotePeerId, pc);

      const channel = pc.createDataChannel('nexus-relay');
      this.dataChannels.set(remotePeerId, channel);

      const transport = new WebRtcTransport({
        remotePeerId,
        peerConnection: pc,
        dataChannel: channel,
      });
      this.webRtcTransports.set(remotePeerId, transport);

      const onChannelOpen = () => {
        this.log('info', `✔ WebRTC DataChannel OPEN with ${remotePeerId}`);
        this.clearFallbackTimer(remotePeerId);
        this.relayEngine.registerTransport(transport);
        this.notifyDiagnostics();
      };

      if (channel.readyState === 'open') {
        onChannelOpen();
      } else {
        channel.onopen = onChannelOpen;
      }

      channel.onclose = () => {
        this.log('warn', `WebRTC DataChannel closed with ${remotePeerId}`);
        this.notifyDiagnostics();
      };

      channel.onerror = (err) => {
        this.log('error', `WebRTC DataChannel error with ${remotePeerId}: ${JSON.stringify(err)}`);
        this.notifyDiagnostics();
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalingClient) {
          this.signalingClient.sendCandidate(remotePeerId, event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        this.log('info', `ICE state with ${remotePeerId}: ${pc.iceConnectionState}`);
        this.notifyDiagnostics();
      };

      pc.onconnectionstatechange = () => {
        this.log('info', `Connection state with ${remotePeerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          this.clearFallbackTimer(remotePeerId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.closePeer(remotePeerId);
        }
        this.notifyDiagnostics();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.signalingClient) {
        this.log('info', `Sending WebRTC OFFER to ${remotePeerId}`);
        this.signalingClient.sendOffer(remotePeerId, offer);
      }
      this.notifyDiagnostics();
    } catch (err: any) {
      this.log('error', `Error creating offer to ${remotePeerId}: ${err?.message}`);
      this.lastError = err?.message || 'Offer creation failed';
      this.closePeer(remotePeerId);
    }
  }

  // ─── WEBRTC CONNECTION HANDLING (CALLEE) ───────────────────────────────────

  private async handleOffer(fromPeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') {
      this.activateWebSocketFallback(fromPeerId);
      return;
    }

    try {
      this.scheduleFallbackTimer(fromPeerId);

      let pc = this.peerConnections.get(fromPeerId);
      if (pc) {
        pc.close();
      }

      pc = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
      this.peerConnections.set(fromPeerId, pc);

      const transport = new WebRtcTransport({
        remotePeerId: fromPeerId,
        peerConnection: pc,
      });
      this.webRtcTransports.set(fromPeerId, transport);

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        this.dataChannels.set(fromPeerId, channel);
        transport.attachChannel(channel);

        const onChannelOpen = () => {
          this.log('info', `✔ WebRTC Callee DataChannel OPEN with ${fromPeerId}`);
          this.clearFallbackTimer(fromPeerId);
          this.relayEngine.registerTransport(transport);
          this.notifyDiagnostics();
        };

        if (channel.readyState === 'open') {
          onChannelOpen();
        } else {
          channel.onopen = onChannelOpen;
        }

        channel.onclose = () => {
          this.log('warn', `WebRTC Callee DataChannel closed with ${fromPeerId}`);
          this.notifyDiagnostics();
        };

        channel.onerror = (err) => {
          this.log('error', `WebRTC Callee DataChannel error with ${fromPeerId}: ${JSON.stringify(err)}`);
          this.notifyDiagnostics();
        };
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalingClient) {
          this.signalingClient.sendCandidate(fromPeerId, event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        this.log('info', `ICE state with ${fromPeerId}: ${pc.iceConnectionState}`);
        this.notifyDiagnostics();
      };

      pc.onconnectionstatechange = () => {
        this.log('info', `Connection state with ${fromPeerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          this.clearFallbackTimer(fromPeerId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.closePeer(fromPeerId);
        }
        this.notifyDiagnostics();
      };

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainPendingCandidates(fromPeerId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.signalingClient) {
        this.log('info', `Sending WebRTC ANSWER to ${fromPeerId}`);
        this.signalingClient.sendAnswer(fromPeerId, answer);
      }
      this.notifyDiagnostics();
    } catch (err: any) {
      this.log('error', `Error responding to offer from ${fromPeerId}: ${err?.message}`);
      this.lastError = err?.message || 'Answer creation failed';
      this.closePeer(fromPeerId);
    }
  }

  private async handleAnswer(fromPeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainPendingCandidates(fromPeerId, pc);
      this.log('info', `Remote description set from ANSWER of ${fromPeerId}`);
      this.notifyDiagnostics();
    } catch (err: any) {
      this.log('error', `Error setting remote description from ${fromPeerId}: ${err?.message}`);
      this.lastError = err?.message || 'Remote description failed';
    }
  }

  // ─── ICE CANDIDATE QUEUE ───────────────────────────────────────────────────

  private async handleCandidate(fromPeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId);

    // Buffer candidate if remoteDescription is not yet set
    if (!pc || !pc.remoteDescription) {
      const queue = this.pendingCandidates.get(fromPeerId) || [];
      queue.push(candidate);
      this.pendingCandidates.set(fromPeerId, queue);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err: any) {
      this.log('warn', `Error adding ICE candidate from ${fromPeerId}: ${err?.message}`);
    }
  }

  private async drainPendingCandidates(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.pendingCandidates.get(peerId);
    if (!queue || queue.length === 0) return;
    this.pendingCandidates.delete(peerId);

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err: any) {
        this.log('warn', `Error draining ICE candidate for ${peerId}: ${err?.message}`);
      }
    }
  }

  private clearPendingCandidates(peerId: string): void {
    this.pendingCandidates.delete(peerId);
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
    this.clearPendingCandidates(peerId);

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (_) {}
      this.peerConnections.delete(peerId);
    }
    this.dataChannels.delete(peerId);
    this.webRtcTransports.delete(peerId);

    const ws = this.webSocketTransports.get(peerId);
    if (ws) {
      ws.close();
      this.webSocketTransports.delete(peerId);
    }

    this.relayEngine.unregisterPeer(peerId);
    this.notifyDiagnostics();
  }

  // ─── DIAGNOSTICS & TELEMETRY ───────────────────────────────────────────────

  public getDiagnostics(): NetworkDiagnostics {
    const peerDiagnostics: PeerConnectionDiagnostic[] = [];
    const allKnownPeerIds = new Set<string>([
      ...this.discoveredPeers.keys(),
      ...this.peerConnections.keys(),
      ...this.webSocketTransports.keys(),
    ]);

    for (const peerId of allKnownPeerIds) {
      const pc = this.peerConnections.get(peerId);
      const dc = this.dataChannels.get(peerId);
      const rtcTransport = this.webRtcTransports.get(peerId);
      const wsTransport = this.webSocketTransports.get(peerId);

      let transportType: 'webrtc' | 'websocket' | 'none' = 'none';
      if (rtcTransport && rtcTransport.isOpen()) {
        transportType = 'webrtc';
      } else if (wsTransport && wsTransport.isOpen()) {
        transportType = 'websocket';
      }

      peerDiagnostics.push({
        peerId,
        connectionState: pc ? pc.connectionState : 'unsupported',
        iceConnectionState: pc ? pc.iceConnectionState : 'unsupported',
        dataChannelState: dc ? dc.readyState : 'none',
        transportType,
        updatedAt: Date.now(),
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
