// ============================================================
// NEXUS Offline Data Core — Public API
// ============================================================
// Single entry point for all core module exports.
// Other modules import from 'backend/data' or 'backend/data/index'.
// ============================================================

// --- Types & Constants ---
export type {
  Incident,
  DraftIncident,
  IncidentType,
  IncidentPriority,
  IncidentStatus,
  OutboxItem,
  OutboxStatus,
  PeerCacheEntry,
  DeviceRecord,
  SyncStateRecord,
  DedupResult,
  IngestResult,
} from './types';

export {
  INCIDENT_TYPES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
  OUTBOX_STATUSES,
  PRIORITY_ORDER,
  DEFAULT_TTL_DURATION_MS,
  MAX_HOP_COUNT,
} from './types';

// --- Validation Schemas ---
export {
  incidentSchema,
  draftIncidentSchema,
  peerPayloadSchema,
  validateIncident,
  validateDraft,
  validatePeerPayload,
  formatValidationErrors,
} from './schema';

// --- Database ---
export { db, NexusDatabase, resetDatabase } from './db';

// --- Device Identity ---
export { getDeviceId, resetDeviceId } from './deviceId';

// --- Incident CRUD Service ---
export {
  createIncident,
  getIncident,
  getAllIncidents,
  getIncidentsByStatus,
  getIncidentsByPriority,
  updateIncidentStatus,
  ingestFromPeer,
  listIncidents,
  subscribeToIncidents,
  FrontendIncidentService,
  frontendIncidentService,
} from './incidentService';

// --- Deduplication Engine ---
export { checkDuplicate, applyIncoming } from './dedup';

// --- Priority Engine ---
export {
  suggestPriority,
  comparePriority,
  sortByPriority,
  getPriorityOrder,
} from './priority';

// --- TTL & Hop Utilities ---
export {
  calculateTTL,
  isExpired,
  isHopBudgetExhausted,
  canForward,
  incrementHop,
  remainingTTL,
} from './ttl';

// --- Outbox Queue Service ---
export {
  addToOutbox,
  getPendingRelayItems,
  getPendingSyncItems,
  markRelayed,
  markSynced,
  removeExpiredFromOutbox,
  getOutboxCount,
} from './outboxService';

// --- Storage Adapter for Networking (IOfflineStorageAdapter) ---
export {
  OfflineStorageAdapter,
  offlineStorageAdapter,
} from './adapter';

export type {
  IOfflineStorageAdapter,
  ManifestItem,
} from './adapter';
