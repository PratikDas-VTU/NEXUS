# NEXUS — Team Handoff & Architecture Interaction Specification

This document defines how the four workstreams interface with each other, outlining exact contracts, expected APIs, asynchronous event handoffs, and verification workflows.

---

## 1. System Interaction Pipeline

```text
[ Member 4: UI Components ]
             |  (Base buttons, cards, badges, inputs)
             v
[ Member 2: Frontend Product ]
             |  (Field App screens & wizard)
             |  Dispatches structured data
             v
+========================================================================+
|                    FROZEN DATA CONTRACT (00_SHARED)                    |
|       incidentId | originDeviceId | type | priority | lat | lng        |
|          timestamp | status | peopleAffected | version | hopCount | ttl|
+========================================================================+
             ^
             |  Enforces runtime validation & schemas
[ Member 3: Data / Backend Core ]
             |  Persists to IndexedDB / Dexie
             |  Evaluates duplicates, versions & TTL
             |  Appends to Outbox Queue
             v
[ Member 1: Local Networking & Relay Engine ]
             |  Reads from Outbox Queue
             |  Exchanges MANIFEST with local peers over WebRTC/WebSocket
             |  Transfers PAYLOAD & awaits ACK
             |  Upon ACK -> updates status to 'relayed'
             v
[ Member 1 & 3: Cloud Sync Layer ]
             |  Detects Internet connectivity
             |  Transfers un-synced incidents to Firestore idempotently
             |  Upon success -> updates status to 'synced'
             v
[ Member 2: Command Dashboard & Map ]
             |  Listens to Firestore live updates
             |  Visualizes markers on Leaflet map
             |  Dispatches Verify / Assign / Resolve updates
             v
[ Member 4: QA & Verification Engine ]
                (End-to-end device testing, failure injection, audit verification)
```

---

## 2. Layer-by-Layer Expectations & Contracts

### A. What Frontend (Member 2) Expects from Data / Backend (Member 3)

The UI layer must remain completely agnostic of underlying IndexedDB transactions. Member 3 delivers a clean, typed service layer that Member 2 imports:

1. **TypeScript Types & Enums**:
   * Exported interfaces for `Incident`, `IncidentType`, `IncidentPriority`, `IncidentStatus`.
2. **Deterministic CRUD Service Functions**:
   * `createIncident(draft: DraftIncident): Promise<Incident>`: Automatically generates UUID, populates `originDeviceId`, assigns `version: 1`, calculates priority, sets `status: 'stored'`, and enqueues to outbox.
   * `getIncident(id: string): Promise<Incident | undefined>`
   * `updateIncidentStatus(id: string, newStatus: IncidentStatus): Promise<void>`
3. **Reactive UI Subscriptions**:
   * A Dexie live-query hook (e.g. `useLiveIncidents(filter?: FilterOptions)`) that automatically re-renders React components when incidents are added or modified without manual polling.
4. **Outbox / Sync State Observable**:
   * A reactive query or hook exposing unsent outbox count (`useOutboxCount()`) so the header connectivity banner truthfully reflects pending transfers.

---

### B. What Data / Backend (Member 3) Expects from Networking & Relay (Member 1)

The storage engine owns data persistence; it does not handle network sockets. Member 1 provides the transport trigger:

1. **Transport-Agnostic Relay Interface**:
   * Networking queries the outbox: `outboxService.getPendingRelayItems(): Promise<Incident[]>`.
2. **Receipt & Validation Pipeline for Inbound Packets**:
   * When Member 1 receives a `PAYLOAD` message from a peer, Member 1 hands the raw JSON to Member 3's validator:
     ```typescript
     const result = incidentSchema.safeParse(rawPeerPayload);
     if (!result.success) {
       // Member 1 rejects packet and logs malformed message
       return sendReject(peer, "MALFORMED_SCHEMA");
     }
     ```
3. **Storage Confirmation Before Forwarding**:
   * Member 1 awaits `incidentService.ingestFromPeer(result.data)`.
   * Member 3 checks versioning and deduplication. Only after successful IndexedDB write does Member 3 return success, allowing Member 1 to emit an `ACK` to the peer.
4. **Relay Lifecycle Handoff**:
   * Upon receiving a verified peer `ACK`, Member 1 calls `outboxService.markRelayed(incidentId, peerId)` so the local incident state transitions from `queued` to `relayed`.

---

### C. What Networking (Member 1) Expects from the Shared Contract

Member 1 implements the relay state machine (`00_SHARED/06_RELAY_PROTOCOL.md`). The protocol relies entirely on frozen contract guarantees:

1. **Explicit Identity**:
   * Every incident has a unique `incidentId` (UUIDv4) and `originDeviceId`.
2. **Version Monotonicity**:
   * `version` is an integer starting at `1`. If an incoming incident version is `<= localVersion`, it is safely ignored. If `> localVersion`, it is updated.
3. **Hop Budget & Loop Termination**:
   * `hopCount` must be incremented by exactly `1` before forwarding.
   * If `hopCount >= 3` or `Date.now() > ttl`, forwarding stops immediately to prevent infinite broadcast loops.
4. **Canonical Wire Envelope**:
   * Peer messages must conform to the 6 explicit message schemas: `HELLO`, `MANIFEST`, `MISSING`, `REQUEST`, `PAYLOAD`, `ACK`.

---

### D. What Command Dashboard (Member 2) Expects from Cloud Sync (Member 1 & 3)

The dashboard is the operational headquarters when internet returns:

1. **Real-Time Data Feed**:
   * Cloud Sync connects to Firestore and subscribes via `onSnapshot` to the `incidents` collection.
2. **Responder Governance Transitions**:
   * Dashboard dispatches status updates (`synced` -> `verified` -> `assigned` -> `resolved`).
   * Cloud sync writes this update to Firestore with an incremented `version` number.
3. **Audit History Tracking**:
   * The dashboard receives the full immutable audit trail, including hop count and relay history where present.

---

### E. How Member 4 (QA / UI Support) Verifies Every Layer

Member 4 serves as the independent verification anchor across the entire project:

1. **Component Quality Gate**:
   * Tests all reusable components (`Button`, `Badge`, `InputField`) for touch accessibility (minimum 48px height), visual feedback on click/touch, and responsive resizing.
2. **Form & Validation Gate**:
   * Intentionally inputs invalid coordinates, empty emergency types, or negative affected-people counts to verify that Member 3's Zod schema triggers Member 2's friendly inline validation warnings.
3. **Disconnection & Persistence Gate**:
   * Simulates sudden browser closure or tab refresh immediately after incident creation to prove the incident survives in IndexedDB.
4. **Peer Exchange Gate**:
   * Operates Device A and Device B on the local Wi-Fi, observing peer discovery, scanning the QR / entering local code, and verifying that the incident arrives on Device B with `hopCount: 1`.
5. **Jury Script Rehearsal**:
   * Times the demonstration script (`00_SHARED/17_DEMO_SCRIPT.md`), ensuring the flow from Device A offline creation to Dashboard resolution executes smoothly within 4 minutes.

---

## 3. How Member 1 Orchestrates Continuous Integration

To ensure the team does not suffer from late-stage integration paralysis, Member 1 executes a continuous integration cycle:

```text
[ Member Feature Branch ]
           |
           v  (Member runs local unit/linter check)
[ Pull Request / Merge to Main ]
           |
           v  (Member 1 validates interface conformance)
[ 2-Hour Checkpoint Verification ]
           |
           +---> Test Passes -> Lock milestone & tag Git commit
           |
           +---> Test Fails  -> Apply Hour-9 Decision Rule:
                                isolate issue, attempt minimal fix,
                                or trigger approved fallback
```

### Git Branching Standard
* `main`: Protected. Only stable, tested checkpoint code is merged here.
* `feat/ui-components`: Member 4's reusable UI building blocks.
* `feat/field-app`: Member 2's Field App screens and wizard.
* `feat/command-dashboard`: Member 2's desktop dashboard and map.
* `feat/data-core`: Member 3's Dexie, Zod, and Outbox services.
* `feat/relay-transport`: Member 1's signaling, WebRTC, and sync engines.
