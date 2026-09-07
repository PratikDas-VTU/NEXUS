/**
 * NEXUS — Offline-First Emergency & Community Network
 * WebRTC Transport Provider (Phase 3 Extraction)
 * 
 * Encapsulates all low-level WebRTC lifecycle, state-machine, and negotiation
 * responsibilities:
 * - RTCPeerConnection creation & configuration
 * - RTCDataChannel creation ('nexus-relay') & callee channel handling
 * - Deterministic initiator selection (localDeviceId < remotePeerId)
 * - SDP offer/answer handling
 * - ICE candidate queuing, buffering, and draining
 * - WebRtcTransport creation & onTransportReady notification
 * - Resource cleanup and diagnostic state reporting
 */

import type { NexusTransport, TransportType } from '../shared/interfaces.ts';
import type { INexusTransportProvider } from './transportProvider.ts';
import { WebRtcTransport, type WebRtcTransportOptions } from './webRtcTransport.ts';
import type { SignalingClient } from './signalingClient.ts';

export const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 0,
};

export interface WebRtcPeerDiagnosticInfo {
  connectionState: RTCPeerConnectionState | 'unsupported';
  iceConnectionState: RTCIceConnectionState | 'unsupported';
  dataChannelState: RTCDataChannelState | 'none';
  isOpen: boolean;
}

export interface WebRtcTransportProviderOptions {
  localDeviceId?: string;
  signalingClient?: SignalingClient | null;
  iceServers?: RTCConfiguration;
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  onPeerConnected?: (peerId: string) => void;
  onPeerFailed?: (peerId: string) => void;
  onStateChange?: () => void;
}

export class WebRtcTransportProvider implements INexusTransportProvider {
  public readonly id = 'webrtc';
  public readonly name = 'WebRTC DataChannel';
  public readonly transportType: TransportType = 'webrtc';
  public readonly priority = 100;

  private localDeviceId: string;
  private signalingClient: SignalingClient | null = null;
  private iceServers: RTCConfiguration;

  // WebRTC Resource Maps
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private webRtcTransports = new Map<string, WebRtcTransport>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  // Event handlers
  private transportReadyHandlers: Array<(transport: NexusTransport) => void> = [];
  private peerDiscoveredHandlers: Array<(peerId: string) => void> = [];
  private peerLostHandlers: Array<(peerId: string) => void> = [];
  private onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  private onPeerConnected?: (peerId: string) => void;
  private onPeerFailed?: (peerId: string) => void;
  private onStateChange?: () => void;

  private isRunning = false;

  constructor(options?: WebRtcTransportProviderOptions) {
    this.localDeviceId = options?.localDeviceId || '';
    this.signalingClient = options?.signalingClient || null;
    this.iceServers = options?.iceServers || DEFAULT_ICE_SERVERS;
    this.onLog = options?.onLog;
    this.onPeerConnected = options?.onPeerConnected;
    this.onPeerFailed = options?.onPeerFailed;
    this.onStateChange = options?.onStateChange;
  }

  public isSupported(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  public start(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
    this.closeAll();
  }

  public setLocalDeviceId(deviceId: string): void {
    this.localDeviceId = deviceId;
  }

  public setSignalingClient(client: SignalingClient | null): void {
    this.signalingClient = client;
  }

  // ─── INexusTransportProvider EVENT REGISTRATION ───────────────────────────

  public onTransportReady(handler: (transport: NexusTransport) => void): void {
    this.transportReadyHandlers.push(handler);
  }

  public onPeerDiscovered(handler: (peerId: string) => void): void {
    this.peerDiscoveredHandlers.push(handler);
  }

  public onPeerLost(handler: (peerId: string) => void): void {
    this.peerLostHandlers.push(handler);
  }

  // ─── DETERMINISTIC INITIATOR & PEER DISCOVERY ──────────────────────────────

  /**
   * Evaluates a discovered peer using the deterministic collision breaker:
   * localDeviceId < remotePeerId -> local node initiates WebRTC Offer
   * localDeviceId > remotePeerId -> callee mode, awaits WebRTC Offer
   * 
   * Returns true if this node acts as initiator.
   */
  public async handlePeerDiscovered(remotePeerId: string): Promise<boolean> {
    if (remotePeerId === this.localDeviceId) return false;

    this.emitPeerDiscovered(remotePeerId);

    if (this.localDeviceId && this.localDeviceId < remotePeerId) {
      this.log('info', `Deterministic initiator: ${this.localDeviceId} < ${remotePeerId}. Initiating WebRTC.`);
      await this.initiatePeerConnection(remotePeerId);
      return true;
    } else {
      this.log('info', `Deterministic callee: awaiting offer from ${remotePeerId}`);
      return false;
    }
  }

  // ─── WEBRTC CONNECTION INITIATION (OFFERER) ────────────────────────────────

  public async initiatePeerConnection(remotePeerId: string): Promise<void> {
    if (this.peerConnections.has(remotePeerId)) return;
    if (!this.isSupported()) {
      this.log('warn', 'RTCPeerConnection not available in this environment');
      this.onPeerFailed?.(remotePeerId);
      return;
    }

    try {
      const pc = new RTCPeerConnection(this.iceServers);
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
        this.emitTransportReady(transport);
        this.onPeerConnected?.(remotePeerId);
        this.onStateChange?.();
      };

      if (channel.readyState === 'open') {
        onChannelOpen();
      } else {
        channel.onopen = onChannelOpen;
      }

      channel.onclose = () => {
        this.log('warn', `WebRTC DataChannel closed with ${remotePeerId}`);
        this.onStateChange?.();
      };

      channel.onerror = (err) => {
        this.log('error', `WebRTC DataChannel error with ${remotePeerId}: ${JSON.stringify(err)}`);
        this.onStateChange?.();
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalingClient) {
          this.signalingClient.sendCandidate(remotePeerId, event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        this.log('info', `ICE state with ${remotePeerId}: ${pc.iceConnectionState}`);
        this.onStateChange?.();
      };

      pc.onconnectionstatechange = () => {
        this.log('info', `Connection state with ${remotePeerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          this.onPeerConnected?.(remotePeerId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.closePeer(remotePeerId);
          this.onPeerFailed?.(remotePeerId);
        }
        this.onStateChange?.();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.signalingClient) {
        this.log('info', `Sending WebRTC OFFER to ${remotePeerId}`);
        this.signalingClient.sendOffer(remotePeerId, offer);
      }
      this.onStateChange?.();
    } catch (err: any) {
      this.log('error', `Error creating offer to ${remotePeerId}: ${err?.message}`);
      this.closePeer(remotePeerId);
      this.onPeerFailed?.(remotePeerId);
    }
  }

  // ─── WEBRTC CONNECTION HANDLING (CALLEE) ───────────────────────────────────

  public async handleOffer(fromPeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isSupported()) {
      this.onPeerFailed?.(fromPeerId);
      return;
    }

    try {
      let pc = this.peerConnections.get(fromPeerId);
      if (pc) {
        pc.close();
      }

      pc = new RTCPeerConnection(this.iceServers);
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
          this.emitTransportReady(transport);
          this.onPeerConnected?.(fromPeerId);
          this.onStateChange?.();
        };

        if (channel.readyState === 'open') {
          onChannelOpen();
        } else {
          channel.onopen = onChannelOpen;
        }

        channel.onclose = () => {
          this.log('warn', `WebRTC Callee DataChannel closed with ${fromPeerId}`);
          this.onStateChange?.();
        };

        channel.onerror = (err) => {
          this.log('error', `WebRTC Callee DataChannel error with ${fromPeerId}: ${JSON.stringify(err)}`);
          this.onStateChange?.();
        };
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalingClient) {
          this.signalingClient.sendCandidate(fromPeerId, event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        this.log('info', `ICE state with ${fromPeerId}: ${pc.iceConnectionState}`);
        this.onStateChange?.();
      };

      pc.onconnectionstatechange = () => {
        this.log('info', `Connection state with ${fromPeerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          this.onPeerConnected?.(fromPeerId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.closePeer(fromPeerId);
          this.onPeerFailed?.(fromPeerId);
        }
        this.onStateChange?.();
      };

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainPendingCandidates(fromPeerId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.signalingClient) {
        this.log('info', `Sending WebRTC ANSWER to ${fromPeerId}`);
        this.signalingClient.sendAnswer(fromPeerId, answer);
      }
      this.onStateChange?.();
    } catch (err: any) {
      this.log('error', `Error responding to offer from ${fromPeerId}: ${err?.message}`);
      this.closePeer(fromPeerId);
      this.onPeerFailed?.(fromPeerId);
    }
  }

  public async handleAnswer(fromPeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.drainPendingCandidates(fromPeerId, pc);
      this.log('info', `Remote description set from ANSWER of ${fromPeerId}`);
      this.onStateChange?.();
    } catch (err: any) {
      this.log('error', `Error setting remote description from ${fromPeerId}: ${err?.message}`);
    }
  }

  // ─── ICE CANDIDATE QUEUE & BUFFERING ───────────────────────────────────────

  public async handleCandidate(fromPeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
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

  public clearPendingCandidates(peerId: string): void {
    this.pendingCandidates.delete(peerId);
  }

  // ─── PEER CLEANUP & LIFECYCLE ──────────────────────────────────────────────

  public closePeer(peerId: string): void {
    this.clearPendingCandidates(peerId);

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (_) {}
      this.peerConnections.delete(peerId);
    }

    const dc = this.dataChannels.get(peerId);
    if (dc) {
      try {
        dc.close();
      } catch (_) {}
      this.dataChannels.delete(peerId);
    }

    const transport = this.webRtcTransports.get(peerId);
    if (transport) {
      try {
        transport.close();
      } catch (_) {}
      this.webRtcTransports.delete(peerId);
    }

    this.emitPeerLost(peerId);
    this.onStateChange?.();
  }

  public closeAll(): void {
    for (const peerId of Array.from(this.peerConnections.keys())) {
      this.closePeer(peerId);
    }
    this.pendingCandidates.clear();
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.webRtcTransports.clear();
    this.onStateChange?.();
  }

  // ─── QUERY & DIAGNOSTIC INTERFACES ─────────────────────────────────────────

  public isTransportOpen(peerId: string): boolean {
    const transport = this.webRtcTransports.get(peerId);
    return transport !== undefined && transport.isOpen();
  }

  public getTransport(peerId: string): WebRtcTransport | undefined {
    return this.webRtcTransports.get(peerId);
  }

  public getPeerDiagnostic(peerId: string): WebRtcPeerDiagnosticInfo | undefined {
    const pc = this.peerConnections.get(peerId);
    const dc = this.dataChannels.get(peerId);
    const transport = this.webRtcTransports.get(peerId);

    if (!pc && !dc && !transport) return undefined;

    return {
      connectionState: pc ? pc.connectionState : 'unsupported',
      iceConnectionState: pc ? pc.iceConnectionState : 'unsupported',
      dataChannelState: dc ? dc.readyState : 'none',
      isOpen: transport ? transport.isOpen() : false,
    };
  }

  public getActivePeerIds(): string[] {
    return Array.from(this.webRtcTransports.keys());
  }

  public getActiveTransportCount(): number {
    let count = 0;
    for (const transport of this.webRtcTransports.values()) {
      if (transport.isOpen()) count++;
    }
    return count;
  }

  // ─── FACTORY & EVENT EMITTERS ──────────────────────────────────────────────

  public createTransport(options: WebRtcTransportOptions): WebRtcTransport {
    return new WebRtcTransport(options);
  }

  public emitTransportReady(transport: NexusTransport): void {
    for (const handler of this.transportReadyHandlers) {
      try {
        handler(transport);
      } catch (err) {
        console.error('[WebRtcTransportProvider] Error in transportReady handler:', err);
      }
    }
  }

  public emitPeerDiscovered(peerId: string): void {
    for (const handler of this.peerDiscoveredHandlers) {
      try {
        handler(peerId);
      } catch (err) {
        console.error('[WebRtcTransportProvider] Error in peerDiscovered handler:', err);
      }
    }
  }

  public emitPeerLost(peerId: string): void {
    for (const handler of this.peerLostHandlers) {
      try {
        handler(peerId);
      } catch (err) {
        console.error('[WebRtcTransportProvider] Error in peerLost handler:', err);
      }
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    if (this.onLog) {
      this.onLog(level, message);
    }
  }
}
