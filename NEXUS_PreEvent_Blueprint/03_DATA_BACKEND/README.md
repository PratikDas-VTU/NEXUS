# Track 03 — Data / Database / Backend Core

This directory contains specifications, data contracts, and implementation guides for **Member 3 (Data / Database / Backend Core)**.

---

## Assigned Responsibilities
* Complete ownership of the client-side offline persistence layer using **IndexedDB / Dexie.js**.
* Enforcing the frozen incident contract through strict **Zod runtime schemas**.
* Implementing incident deduplication and semantic versioning (`incomingVersion > localVersion`).
* Building the Priority Engine (P0-P3 calculation and queue sorting) and TTL expiration evaluation.
* Managing the **Outbox Queue** (`incidents`, `outbox`, `peerCache`, `syncState`).
* Collaborating with Member 1 on Firestore document data structures for cloud synchronization.
* Writing unit tests for data integrity and version conflict handling.

---

## Authoritative Documents in this Directory
1. [`10_BACKEND_CORE_BREAKDOWN.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/03_DATA_BACKEND/10_BACKEND_CORE_BREAKDOWN.md): Layer breakdown of the offline incident engine and outbox lifecycle.
2. [`13_API_AND_DOWNLOADS.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/03_DATA_BACKEND/13_API_AND_DOWNLOADS.md): Verified package lists and external service constraints.

---

## Required Reading in `00_SHARED/`
* [`00_SHARED/05_DATA_CONTRACT.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/05_DATA_CONTRACT.md) — **CRITICAL**: The frozen incident envelope, types, priorities, and status lifecycle.
* [`00_SHARED/07_UML.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/07_UML.md) — Incident lifecycle state machine.
* [`00_SHARED/08_FLOWCHARTS.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/08_FLOWCHARTS.md) — Deduplication decision tree.

---

## MongoDB to Dexie & Firestore: Concept Translation Bridge

If you have experience working with **MongoDB**, your knowledge of document-oriented databases translates directly to the NEXUS architecture:

| MongoDB Concept | NEXUS Local Layer (Dexie / IndexedDB) | NEXUS Cloud Layer (Firestore) | Key Architectural Difference |
| :--- | :--- | :--- | :--- |
| **Database** | `new Dexie('NexusLocalDB')` | Firebase Project / Firestore App | Dexie lives inside the user's browser, completely offline. |
| **Collection** | Dexie Table (`db.version(1).stores({ incidents: '...' })`) | Firestore Collection (`collection(db, 'incidents')`) | Dexie schemas define indexed fields; non-indexed fields are stored freely like BSON. |
| **Document / BSON** | JavaScript Object conforming to Zod schema | Firestore Document JSON | In Dexie, any valid JS object is persisted locally. |
| **`_id` (ObjectId)** | `incidentId` (UUID string) | Document ID (`doc(incidentsRef, incidentId)`) | Using `incidentId` as both local key and Firestore document ID ensures **idempotent sync**. |
| **Mongoose Schema** | `zod` schema (`incidentSchema = z.object({...})`) | Firestore Security Rules & TypeScript interfaces | Zod validates data at runtime before write; invalid documents are rejected immediately. |
| **`find()` / Queries** | `db.incidents.where('priority').equals('P0')` | `query(collection, where('priority', '==', 'P0'))` | Dexie queries run against IndexedDB indexes synchronously or via promises. |
| **Reactivity / Change Streams** | `useLiveQuery(() => db.incidents.toArray())` | `onSnapshot(collectionRef, (snap) => ...)` | `useLiveQuery` provides zero-latency real-time UI updates without polling. |

> [!IMPORTANT]
> **Why we use IndexedDB/Dexie instead of MongoDB**:
> NEXUS must function in complete blackout conditions where there is no internet, cellular network, or local server. Browsers natively support IndexedDB, meaning the app runs, queries, and stores records on any smartphone or laptop without needing a MongoDB daemon running on the device.

---

## Event-Time Implementation Checklist for Member 3

1. **Step 1 — Zod Schema (`src/core/schema.ts`)**:
   * Implement strict parsing for `Incident`:
     * `incidentId`: `z.string().uuid()`
     * `originDeviceId`: `z.string()`
     * `type`: `z.enum(['medical', 'trapped', 'missing', 'resource', 'shelter', 'safety'])`
     * `priority`: `z.enum(['P0', 'P1', 'P2', 'P3'])`
     * `latitude`: `z.number().min(-90).max(90)`
     * `longitude`: `z.number().min(-180).max(180)`
     * `status`: `z.enum(['reported', 'stored', 'queued', 'relayed', 'synced', 'verified', 'assigned', 'resolved', 'expired'])`
     * `version`: `z.number().int().min(1)`
     * `hopCount`: `z.number().int().min(0)`
     * `ttl`: `z.number()`
2. **Step 2 — Dexie Database Initialization (`src/core/db.ts`)**:
   * Setup tables with indexed keys:
     ```typescript
     db.version(1).stores({
       incidents: 'incidentId, originDeviceId, priority, status, version, timestamp',
       outbox: 'incidentId, status, priority',
       peerCache: 'peerId, lastSeen',
       syncState: 'id'
     });
     ```
3. **Step 3 — Deduplication & Versioning Engine (`src/core/dedup.ts`)**:
   * When an incident payload arrives from a peer:
     * Check if `incidentId` already exists.
     * If `incoming.version <= existing.version` -> discard (duplicate/stale).
     * If `incoming.version > existing.version` -> overwrite with updated payload.
4. **Step 4 — Outbox Pipeline (`src/core/outboxService.ts`)**:
   * When an incident is saved, add reference to `outbox`.
   * Order queue by: `P0 > P1 > P2 > P3`, then timestamp, then remaining TTL.
   * Provide an API for Member 1's relay engine to fetch pending payloads.
