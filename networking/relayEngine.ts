/**
 * NEXUS — Offline-First Emergency & Community Network
 * Store-Carry-Forward Relay State Machine
 * 
 * Orchestrates the 6-stage peer handshake protocol:
 * HELLO -> MANIFEST -> MISSING/REQUEST -> PAYLOAD -> ACK
 * 
 * Golden Rules:
 * 1. The incident engine must never depend on the network.
 * 2. Store before forwarding.
 * 3. Validate before storing.
 * 4. Increment hopCount upon forwarding.
 * 5. Stop forwarding when hopCount >= MAX_HOPS or TTL expired.
 */

import type { DeviceId, Incident, IncidentId, IncidentManifestItem } from '../shared/types.ts';
import { isEligibleForForwarding, isIncidentExpired, MAX_HOPS } from '../shared/constants.ts';
import type {
  ConnectedPeerInfo,
  IOfflineStorageAdapter,
  INetworkRelayService,
  ITransport,
  RelayNetworkStatus,
} from '../shared/interfaces.ts';
import type { MultiTransportManager } from './multiTransportManager.ts';
import type {
  AckMessage,
  HelloMessage,
  ManifestMessage,
  PayloadMessage,
  PurgeMessage,
  RelayMessage,
  RequestMessage,
} from '../shared/protocol.ts';
import {
  createAckMessage,
  createHelloMessage,
  createManifestMessage,
  createPayloadMessage,
  createPurgeMessage,
  createRequestMessage,
} from '../shared/protocol.ts';

export type PeerHandshakeState =
  | 'INIT'
  | 'HELLO_SENT'
  | 'HELLO_EXCHANGED'
  | 'MANIFEST_EXCHANGED'
  | 'SYNCED'
  | 'DISCONNECTED';

export interface ActivePeerSession {
  peerId: string;
  transport: ITransport;
  state: PeerHandshakeState;
  sessionId: string;
  peerDeviceId?: DeviceId;
  connectedAt: number;
  lastActiveAt: number;
  relayedCount: number;
}

export class RelayEngine implements INetworkRelayService {
  private localDeviceId: DeviceId;
  private storage: IOfflineStorageAdapter;
  private activePeers = new Map<string, ActivePeerSession>();
  private statusListeners = new Set<(status: RelayNetworkStatus) => void>();
  private isSignalingOnline = false;
  private currentSignalingUrl?: string;
  private totalRelayedCounter = 0;
  private transportManager?: MultiTransportManager;
  public onPurge?: (fromPeerId: string, reason?: string) => void;

  constructor(
    localDeviceId: DeviceId,
    storageAdapter: IOfflineStorageAdapter,
    transportManager?: MultiTransportManager
  ) {
    this.localDeviceId = localDeviceId;
    this.storage = storageAdapter;
    this.transportManager = transportManager;
  }

  public getTransportManager(): MultiTransportManager | undefined {
    return this.transportManager;
  }

  public setTransportManager(manager: MultiTransportManager): void {
    this.transportManager = manager;
  }

  // ─── PEER TRANSPORT LIFECYCLE ──────────────────────────────────────────────

  /**
   * Registers an open transport (WebRTC DataChannel, WebSocket fallback, etc.).
   * If a MultiTransportManager is configured, it tracks the transport and wraps
   * the peer session with a managed NexusTransport that seamlessly routes to
   * the preferred active transport without re-triggering handshakes.
   */
  public registerTransport(transport: ITransport): void {
    const peerId = transport.remotePeerId;

    if (this.transportManager) {
      this.transportManager.registerTransport(transport);

      // If peer already has an active session, the manager now tracks this additional
      // transport. We do not restart the handshake or overwrite the session.
      if (this.activePeers.has(peerId)) {
        this.notifyStatusChange();
        return;
      }

      // First transport for this peer: establish session using the managed peer transport
      const managedTransport = this.transportManager.getPeerTransport(peerId);
      this.setupPeerSession(peerId, managedTransport);
      return;
    }

    this.setupPeerSession(peerId, transport);
  }

  private setupPeerSession(peerId: string, transport: ITransport): void {
    const sessionId = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const session: ActivePeerSession = {
      peerId,
      transport,
      state: 'INIT',
      sessionId,
      connectedAt: Date.now(),
      lastActiveAt: Date.now(),
      relayedCount: 0,
    };

    this.activePeers.set(peerId, session);

    // Wire up event listeners
    transport.onMessage((msg: RelayMessage) => {
      this.handleIncomingMessage(peerId, msg);
    });

    transport.onClose((reason?: string) => {
      console.log(`[RelayEngine] Peer ${peerId} disconnected. Reason:`, reason || 'normal');
      this.activePeers.delete(peerId);
      this.notifyStatusChange();
    });

    // Stage 1: Send HELLO immediately upon channel open
    this.initiateHandshake(session);
    this.notifyStatusChange();
  }

  /**
   * Unregisters a peer and closes its underlying transport.
   */
  public unregisterPeer(peerId: string): void {
    if (this.transportManager) {
      this.transportManager.removeTransport(peerId);
    }
    const session = this.activePeers.get(peerId);
    if (session) {
      session.transport.close();
      this.activePeers.delete(peerId);
      this.notifyStatusChange();
    }
  }

  // ─── 6-STAGE PROTOCOL STATE MACHINE ────────────────────────────────────────

  private async initiateHandshake(session: ActivePeerSession): Promise<void> {
    try {
      const hello = createHelloMessage(this.localDeviceId, session.sessionId);
      await session.transport.send(hello);
      session.state = 'HELLO_SENT';
      session.lastActiveAt = Date.now();
    } catch (err) {
      console.error(`[RelayEngine] Failed to send HELLO to ${session.peerId}:`, err);
    }
  }

  private async handleIncomingMessage(peerId: string, msg: RelayMessage): Promise<void> {
    const session = this.activePeers.get(peerId);
    if (!session) return;

    session.lastActiveAt = Date.now();

    switch (msg.type) {
      case 'HELLO':
        await this.handleHello(session, msg);
        break;
      case 'MANIFEST':
        await this.handleManifest(session, msg);
        break;
      case 'REQUEST':
        await this.handleRequest(session, msg);
        break;
      case 'PAYLOAD':
        await this.handlePayload(session, msg);
        break;
      case 'ACK':
        await this.handleAck(session, msg);
        break;
      case 'PURGE':
        console.log(`[RelayEngine] Received PURGE from ${peerId}: ${msg.reason || 'no reason'}`);
        if (this.onPurge) {
          this.onPurge(peerId, msg.reason);
        }
        break;
      case 'FORWARD':
        console.log(`[RelayEngine] Received FORWARD announcement for ${msg.incidentId} from ${peerId}`);
        break;
      default:
        console.warn(`[RelayEngine] Unrecognized message type: ${(msg as { type: string }).type}`);
    }
  }

  /** Stage 1 Response: Accept HELLO and exchange MANIFEST */
  private async handleHello(session: ActivePeerSession, msg: HelloMessage): Promise<void> {
    session.peerDeviceId = msg.senderDeviceId;

    // If already exchanged HELLO or advanced further, ignore redundant HELLO
    if (session.state !== 'INIT' && session.state !== 'HELLO_SENT') {
      return;
    }

    // If we haven't sent our HELLO yet, reply with one
    if (session.state === 'INIT') {
      const helloReply = createHelloMessage(this.localDeviceId, session.sessionId);
      await session.transport.send(helloReply);
    }

    session.state = 'HELLO_EXCHANGED';

    // Immediately trigger Stage 2: Send our local MANIFEST
    await this.sendLocalManifest(session);
  }

  /** Stage 2: Send our inventory manifest */
  private async sendLocalManifest(session: ActivePeerSession): Promise<void> {
    const manifestItems = await this.storage.getManifest();
    const manifestMsg = createManifestMessage(this.localDeviceId, session.sessionId, manifestItems);
    await session.transport.send(manifestMsg);
  }

  /**
   * Stage 2 & 3: Process peer's MANIFEST, calculate missing items, and send REQUEST
   */
  private async handleManifest(session: ActivePeerSession, msg: ManifestMessage): Promise<void> {
    session.state = 'MANIFEST_EXCHANGED';

    // Retrieve our local manifest
    const localManifest = await this.storage.getManifest();
    const localMap = new Map<IncidentId, number>();
    for (const item of localManifest) {
      localMap.set(item.incidentId, item.version);
    }

    // Determine what peer has that we need:
    // 1. Incidents we don't have at all
    // 2. Incidents where peer's version > our local version
    const neededIds: IncidentId[] = [];
    for (const remoteItem of msg.items) {
      const localVer = localMap.get(remoteItem.incidentId);
      if (localVer === undefined || remoteItem.version > localVer) {
        neededIds.push(remoteItem.incidentId);
      }
    }

    // If we need items, send Stage 4 REQUEST
    if (neededIds.length > 0) {
      const requestMsg = createRequestMessage(this.localDeviceId, session.sessionId, neededIds);
      await session.transport.send(requestMsg);
    }
  }

  /**
   * Stage 4: Fulfill peer's REQUEST by reading from storage, incrementing hopCount,
   * checking TTL & hop budget, and sending Stage 5 PAYLOAD.
   */
  private async handleRequest(session: ActivePeerSession, msg: RequestMessage): Promise<void> {
    const requestedIncidents = await this.storage.getIncidentsByIds(msg.requestedIds);

    const eligiblePayloads: Incident[] = [];

    for (const inc of requestedIncidents) {
      // Golden Rule: Stop forwarding if hop budget exhausted, expired, or resolved
      if (!isEligibleForForwarding(inc)) {
        continue;
      }

      // Golden Rule: Increment hopCount on forwarding
      const forwardedIncident: Incident = {
        ...inc,
        hopCount: inc.hopCount + 1,
      };

      eligiblePayloads.push(forwardedIncident);
    }

    if (eligiblePayloads.length > 0) {
      const payloadMsg = createPayloadMessage(this.localDeviceId, session.sessionId, eligiblePayloads);
      await session.transport.send(payloadMsg);
    }
  }

  /**
   * Stage 5: Ingest peer's PAYLOAD into local storage and reply with Stage 6 ACK.
   */
  private async handlePayload(session: ActivePeerSession, msg: PayloadMessage): Promise<void> {
    const acceptedIds: IncidentId[] = [];
    const rejectedItems: Array<{ incidentId: IncidentId; code: any; reason: string }> = [];

    for (const inc of msg.incidents) {
      // Validation Rule 1: Hop budget check
      if (inc.hopCount > MAX_HOPS) {
        rejectedItems.push({
          incidentId: inc.incidentId,
          code: 'HOP_BUDGET_EXCEEDED',
          reason: `Hop count ${inc.hopCount} exceeds limit of ${MAX_HOPS}`,
        });
        continue;
      }

      // Validation Rule 2: TTL check
      if (isIncidentExpired(inc.timestamp, inc.ttl)) {
        rejectedItems.push({
          incidentId: inc.incidentId,
          code: 'TTL_EXPIRED',
          reason: 'Incident has expired past its TTL budget',
        });
        continue;
      }

      // Golden Rule: Validate & Persist locally before ACK
      const result = await this.storage.ingestRelayedIncident(inc);
      if (result.accepted) {
        acceptedIds.push(inc.incidentId);
      } else {
        rejectedItems.push({
          incidentId: inc.incidentId,
          code: result.code || 'STORAGE_ERROR',
          reason: result.reason || 'Storage ingestion rejected',
        });
      }
    }

    // Stage 6: Emit ACK back to peer
    const ack = createAckMessage(this.localDeviceId, session.sessionId, acceptedIds, rejectedItems);
    await session.transport.send(ack);

    session.state = 'SYNCED';
    this.notifyStatusChange();
  }

  /**
   * Stage 6: Process peer's ACK and mark outbox records as relayed.
   */
  private async handleAck(session: ActivePeerSession, msg: AckMessage): Promise<void> {
    for (const acceptedId of msg.acceptedIncidentIds) {
      await this.storage.markRelayed(acceptedId, session.peerDeviceId || session.peerId);
      session.relayedCount++;
      this.totalRelayedCounter++;
    }

    if (msg.rejectedItems && msg.rejectedItems.length > 0) {
      console.warn(
        `[RelayEngine] Peer ${session.peerId} rejected ${msg.rejectedItems.length} items:`,
        msg.rejectedItems
      );
    }

    session.state = 'SYNCED';
    this.notifyStatusChange();
  }

  // ─── INetworkRelayService STATUS & COORDINATION ────────────────────────────

  public getStatus(): RelayNetworkStatus {
    const peerInfos: ConnectedPeerInfo[] = Array.from(this.activePeers.values()).map((p) => ({
      peerId: p.peerId,
      deviceId: p.peerDeviceId || `DEV-${p.peerId.slice(0, 6)}`,
      transportType: p.transport.transportType,
      connectedAt: p.connectedAt,
      lastPingAt: p.lastActiveAt,
      relayedCount: p.relayedCount,
    }));

    return {
      mode:
        this.activePeers.size > 0
          ? peerInfos.some((p) => p.transportType === 'webrtc')
            ? 'webrtc'
            : 'websocket-fallback'
          : this.isSignalingOnline
          ? 'signaling'
          : 'disconnected',
      isSignalingConnected: this.isSignalingOnline,
      activePeers: peerInfos,
      pendingOutboxCount: 0, // Injected / queried when needed
      totalIncidentsRelayed: this.totalRelayedCounter,
      signalingServerUrl: this.currentSignalingUrl,
    };
  }

  public subscribeStatus(callback: (status: RelayNetworkStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.getStatus());
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  public setSignalingState(isOnline: boolean, serverUrl?: string): void {
    this.isSignalingOnline = isOnline;
    this.currentSignalingUrl = serverUrl;
    this.notifyStatusChange();
  }

  public async start(signalingUrl: string): Promise<void> {
    this.currentSignalingUrl = signalingUrl;
    this.isSignalingOnline = true;
    this.notifyStatusChange();
  }

  public async stop(): Promise<void> {
    for (const [peerId, session] of this.activePeers) {
      session.transport.close();
    }
    this.activePeers.clear();
    if (this.transportManager) {
      this.transportManager.closeAll();
    }
    this.isSignalingOnline = false;
    this.notifyStatusChange();
  }

  public async triggerPeerSync(): Promise<void> {
    for (const session of this.activePeers.values()) {
      if (session.transport.isOpen()) {
        await this.sendLocalManifest(session);
      }
    }
  }

  public async broadcastPurge(reason?: string): Promise<void> {
    const purgeMsg = createPurgeMessage(this.localDeviceId, reason);
    for (const session of this.activePeers.values()) {
      try {
        if (session.transport.isOpen()) {
          await session.transport.send(purgeMsg);
        }
      } catch (err) {
        console.warn(`[RelayEngine] Failed to send PURGE to ${session.peerId}:`, err);
      }
    }
  }

  private notifyStatusChange(): void {
    const currentStatus = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(currentStatus);
      } catch (e) {
        console.error('[RelayEngine] Error in status listener:', e);
      }
    }
  }
}
