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
  private maxHops: number;
  private peerSyncTimeouts = new Map<string, any>();
  public onPurge?: (fromPeerId: string, reason?: string) => void;

  constructor(
    localDeviceId: DeviceId,
    storageAdapter: IOfflineStorageAdapter,
    transportManager?: MultiTransportManager,
    maxHops: number = MAX_HOPS
  ) {
    this.localDeviceId = localDeviceId;
    this.storage = storageAdapter;
    this.transportManager = transportManager;
    this.maxHops = maxHops;
  }

  public setMaxHops(hops: number): void {
    this.maxHops = hops;
  }

  public getMaxHops(): number {
    return this.maxHops;
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
      const syncTimer = this.peerSyncTimeouts.get(peerId);
      if (syncTimer) {
        clearTimeout(syncTimer);
        this.peerSyncTimeouts.delete(peerId);
      }
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
      if (!isEligibleForForwarding(inc, undefined, this.maxHops)) {
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
      if (inc.hopCount > this.maxHops) {
        rejectedItems.push({
          incidentId: inc.incidentId,
          code: 'HOP_BUDGET_EXCEEDED',
          reason: `Hop count ${inc.hopCount} exceeds limit of ${this.maxHops}`,
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

    // STORE-AND-FORWARD MULTI-HOP PROPAGATION:
    // If new or updated incidents were accepted into local storage, schedule manifest
    // synchronization toward all other eligible connected peers (coalesced/debounced,
    // excluding the sender peer to prevent unnecessary ping-pong).
    if (acceptedIds.length > 0) {
      this.schedulePeerSync(session.peerId);
    }
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
      handshakeState: p.state,
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
    for (const timer of this.peerSyncTimeouts.values()) {
      clearTimeout(timer);
    }
    this.peerSyncTimeouts.clear();

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

  public getPeerSession(peerId: string): ActivePeerSession | undefined {
    let session = this.activePeers.get(peerId);
    if (!session) {
      for (const s of this.activePeers.values()) {
        if (s.peerDeviceId === peerId) {
          return s;
        }
      }
    }
    return session;
  }

  /**
   * Schedules manifest synchronization across active peers with coalescing.
   *
   * Debounces per-peer manifest updates by default 50ms so rapid successive payload ingests
   * coalesce into a single MANIFEST packet, preventing manifest floods while ensuring
   * immediate multi-hop propagation.
   *
   * @param excludePeerId - Peer to exclude from this sync cycle (typically the sender of the payload)
   * @param delayMs - Debounce delay in milliseconds (default 50ms, 0 for immediate)
   */
  public schedulePeerSync(excludePeerId?: string, delayMs: number = 50): void {
    for (const [peerId, session] of this.activePeers) {
      if (excludePeerId && (peerId === excludePeerId || session.peerDeviceId === excludePeerId)) {
        continue;
      }
      if (!session.transport.isOpen()) {
        continue;
      }

      const existingTimer = this.peerSyncTimeouts.get(peerId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      if (delayMs <= 0) {
        this.peerSyncTimeouts.delete(peerId);
        this.sendLocalManifest(session).catch((err) => {
          console.warn(`[RelayEngine] Immediate peer sync to ${peerId} failed:`, err);
        });
      } else {
        const timer = setTimeout(async () => {
          this.peerSyncTimeouts.delete(peerId);
          try {
            if (session.transport.isOpen()) {
              await this.sendLocalManifest(session);
            }
          } catch (err) {
            console.warn(`[RelayEngine] Coalesced peer sync to ${peerId} failed:`, err);
          }
        }, delayMs);

        this.peerSyncTimeouts.set(peerId, timer);
      }
    }
  }

  public async triggerPeerSync(): Promise<void> {
    this.schedulePeerSync(undefined, 0);
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
