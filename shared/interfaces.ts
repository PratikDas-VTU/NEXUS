/**
 * NEXUS — Offline-First Emergency & Community Network
 * Cross-Module Integration Interfaces & Boundary Contracts
 * 
 * Defines deterministic boundaries between:
 * - Frontend <-> Offline Core
 * - Networking <-> Offline Core
 * - Networking <-> Transport
 * - Offline Core <-> Cloud Sync
 */

import type {
  DraftIncident,
  Incident,
  IncidentFilter,
  IncidentId,
  IncidentManifestItem,
  IncidentStatus,
} from './types.ts';
import type { ProtocolErrorCode, RelayMessage } from './protocol.ts';

// ─── 1. OFFLINE CORE <-> NETWORKING BOUNDARY ─────────────────────────────────

export interface IngestionResult {
  accepted: boolean;
  incidentId: IncidentId;
  code?: ProtocolErrorCode;
  reason?: string;
}

/**
 * Interface that the Networking Relay Engine requires from the
 * Offline Core. The Networking layer never accesses IndexedDB/Dexie directly;
 * it only talks through this contract.
 */
export interface IOfflineStorageAdapter {
  /**
   * Retrieves the inventory list of all valid local incidents
   * with their current versions for MANIFEST exchanges.
   */
  getManifest(): Promise<IncidentManifestItem[]>;

  /**
   * Retrieves prioritized incidents pending peer transmission.
   * Must respect queue ordering: P0 first, then recency, then remaining TTL.
   */
  getPendingOutbox(limit?: number): Promise<Incident[]>;

  /**
   * Validates and persists an incident received over the network from a peer.
   * Performs deduplication and semantic versioning (accept if incoming > local).
   * Returns whether it was accepted or rejected with a protocol code.
   */
  ingestRelayedIncident(incident: Incident): Promise<IngestionResult>;

  /**
   * Updates an incident record after an ACK is confirmed by a peer,
   * transitioning lifecycle state to 'relayed'.
   */
  markRelayed(incidentId: IncidentId, peerId: string): Promise<void>;

  /**
   * Checks whether a specific incident and version exists locally.
   */
  hasIncident(incidentId: IncidentId, version?: number): Promise<boolean>;

  /**
   * Retrieves full incident objects for a given list of IDs to fulfill
   * a peer's REQUEST message.
   */
  getIncidentsByIds(incidentIds: IncidentId[]): Promise<Incident[]>;
}

// ─── 2. FRONTEND <-> OFFLINE CORE BOUNDARY ───────────────────────────────────

/**
 * Interface that the Frontend consumes from the Data Core.
 * Allows the UI to create, query, and subscribe to incidents
 * without needing to know IndexedDB details.
 */
export interface IFrontendIncidentService {
  /**
   * User creates a new incident via the 6-step reporting wizard.
   * Automatically sets UUID, deviceId, timestamp, version=1, hopCount=0,
   * default TTL, priority, status='stored', and enqueues to outbox.
   */
  createIncident(draft: DraftIncident): Promise<Incident>;

  /** Retrieves a single incident by ID */
  getIncident(id: IncidentId): Promise<Incident | undefined>;

  /** Lists incidents filtered by type, priority, or status */
  listIncidents(filter?: IncidentFilter): Promise<Incident[]>;

  /**
   * Reactive subscription hook/callback for live UI re-rendering
   * when local database records change. Returns an unsubscribe function.
   */
  subscribeToIncidents(callback: (incidents: Incident[]) => void, filter?: IncidentFilter): () => void;

  /** Returns count of incidents pending cloud or peer sync for UI banner */
  getOutboxCount(): Promise<number>;

  /** Responder action: Update status (verified, assigned, resolved) */
  updateIncidentStatus(id: IncidentId, newStatus: IncidentStatus): Promise<void>;
}

// ─── 3. NETWORKING STATUS <-> FRONTEND / UI BOUNDARY ─────────────────────────

export type NetworkTransportMode = 'disconnected' | 'signaling' | 'webrtc' | 'websocket-fallback';

export interface ConnectedPeerInfo {
  peerId: string;
  deviceId: string;
  transportType: 'webrtc' | 'websocket';
  connectedAt: number;
  lastPingAt: number;
  relayedCount: number;
}

export interface RelayNetworkStatus {
  mode: NetworkTransportMode;
  isSignalingConnected: boolean;
  activePeers: ConnectedPeerInfo[];
  pendingOutboxCount: number;
  totalIncidentsRelayed: number;
  signalingServerUrl?: string;
}

/**
 * Interface that the UI / Banners use to observe peer connectivity state.
 */
export interface INetworkRelayService {
  getStatus(): RelayNetworkStatus;
  subscribeStatus(callback: (status: RelayNetworkStatus) => void): () => void;
  start(signalingUrl: string): Promise<void>;
  stop(): Promise<void>;
  triggerPeerSync(): Promise<void>;
}

// ─── 4. TRANSPORT LAYER BOUNDARY ─────────────────────────────────────────────

/**
 * Abstraction over WebRTC DataChannel vs Local WebSocket fallback.
 * The RelayEngine operates entirely over ITransport.
 */
export interface ITransport {
  readonly transportType: 'webrtc' | 'websocket';
  readonly remotePeerId: string;
  isOpen(): boolean;
  send(message: RelayMessage): Promise<void>;
  onMessage(handler: (message: RelayMessage) => void): void;
  onClose(handler: (reason?: string) => void): void;
  close(): void;
}
