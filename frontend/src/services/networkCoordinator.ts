import { RelayEngine } from '../../../networking/relayEngine';
import { SignalingClient } from '../../../networking/signalingClient';
import { WebRtcTransport } from '../../../networking/webRtcTransport';
import type { PeerDescriptor } from '../../../networking/types';

export interface NetworkCoordinatorOptions {
  deviceId: string;
  relayEngine: RelayEngine;
  signalingUrl?: string;
}

const DEFAULT_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class NetworkCoordinator {
  private deviceId: string;
  private relayEngine: RelayEngine;
  private signalingUrl: string;
  private signalingClient: SignalingClient | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private isStarted = false;

  constructor(options: NetworkCoordinatorOptions) {
    this.deviceId = options.deviceId;
    this.relayEngine = options.relayEngine;
    this.signalingUrl = options.signalingUrl || 'ws://localhost:8080';
  }

  public async start(customUrl?: string): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    const url = customUrl || this.signalingUrl;
    this.signalingUrl = url;

    try {
      this.signalingClient = new SignalingClient({
        serverUrl: url,
        peerId: this.deviceId,
        deviceId: this.deviceId,
        autoReconnect: true,
      });

      this.signalingClient.onStateChange = (connected) => {
        this.relayEngine.setSignalingState(connected, url);
      };

      this.signalingClient.onPeerList = (peers) => {
        this.handlePeerList(peers);
      };

      this.signalingClient.onPeerJoined = (peer) => {
        this.handlePeerJoined(peer);
      };

      this.signalingClient.onPeerLeft = (peerId) => {
        this.closePeer(peerId);
      };

      this.signalingClient.onOffer = async (fromPeerId, sdp) => {
        await this.handleOffer(fromPeerId, sdp as RTCSessionDescriptionInit);
      };

      this.signalingClient.onAnswer = async (fromPeerId, sdp) => {
        await this.handleAnswer(fromPeerId, sdp as RTCSessionDescriptionInit);
      };

      this.signalingClient.onCandidate = async (fromPeerId, candidate) => {
        await this.handleCandidate(fromPeerId, candidate as RTCIceCandidateInit);
      };

      await this.signalingClient.connect();
    } catch (err) {
      console.warn('[NetworkCoordinator] Signaling server unavailable, running local mesh only:', err);
      this.relayEngine.setSignalingState(false, url);
    }
  }

  public async stop(): Promise<void> {
    this.isStarted = false;

    if (this.signalingClient) {
      this.signalingClient.disconnect();
      this.signalingClient = null;
    }

    for (const [peerId, pc] of this.peerConnections) {
      try {
        pc.close();
      } catch (_) {}
    }
    this.peerConnections.clear();

    await this.relayEngine.stop();
  }

  private handlePeerList(peers: PeerDescriptor[]): void {
    for (const peer of peers) {
      if (peer.peerId !== this.deviceId) {
        // Deterministic collision breaker: lower ID initiates
        if (this.deviceId < peer.peerId) {
          this.initiatePeerConnection(peer.peerId);
        }
      }
    }
  }

  private handlePeerJoined(peer: PeerDescriptor): void {
    if (peer.peerId !== this.deviceId) {
      if (this.deviceId < peer.peerId) {
        this.initiatePeerConnection(peer.peerId);
      }
    }
  }

  private async initiatePeerConnection(remotePeerId: string): Promise<void> {
    if (this.peerConnections.has(remotePeerId)) return;
    if (typeof RTCPeerConnection === 'undefined') return;

    try {
      const pc = new RTCPeerConnection(DEFAULT_ICE_SERVERS);
      this.peerConnections.set(remotePeerId, pc);

      const channel = pc.createDataChannel('nexus-relay');
      const transport = new WebRtcTransport({
        remotePeerId,
        peerConnection: pc,
        dataChannel: channel,
      });

      channel.onopen = () => {
        this.relayEngine.registerTransport(transport);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalingClient) {
          this.signalingClient.sendCandidate(remotePeerId, event.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.closePeer(remotePeerId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.signalingClient) {
        this.signalingClient.sendOffer(remotePeerId, offer);
      }
    } catch (err) {
      console.error(`[NetworkCoordinator] Error creating offer to ${remotePeerId}:`, err);
      this.closePeer(remotePeerId);
    }
  }

  private async handleOffer(fromPeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;

    try {
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

      pc.ondatachannel = (event) => {
        transport.attachChannel(event.channel);
        event.channel.onopen = () => {
          this.relayEngine.registerTransport(transport);
        };
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalingClient) {
          this.signalingClient.sendCandidate(fromPeerId, event.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          this.closePeer(fromPeerId);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.signalingClient) {
        this.signalingClient.sendAnswer(fromPeerId, answer);
      }
    } catch (err) {
      console.error(`[NetworkCoordinator] Error responding to offer from ${fromPeerId}:`, err);
      this.closePeer(fromPeerId);
    }
  }

  private async handleAnswer(fromPeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error(`[NetworkCoordinator] Error setting remote description from ${fromPeerId}:`, err);
    }
  }

  private async handleCandidate(fromPeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId);
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn(`[NetworkCoordinator] Error adding ICE candidate from ${fromPeerId}:`, err);
    }
  }

  private closePeer(peerId: string): void {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (_) {}
      this.peerConnections.delete(peerId);
    }
    this.relayEngine.unregisterPeer(peerId);
  }
}
