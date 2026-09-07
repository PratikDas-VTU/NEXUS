# Shared Contracts & Domain Models

This directory contains the core definitions, contracts, types, and constants shared across all four workstreams.

---

## Purpose
NEXUS is engineered as a unified offline-first incident coordination system. To prevent the four workstreams from drifting into disconnected silos, every layer builds directly against the specifications in this folder.

---

## The Shared Contract Principle

```text
+-------------------------------------------------------------+
|                         Frontend                            |
|             (Field App UX & Command Dashboard)              |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                     SHARED CONTRACTS                        |
|   • Frozen Incident Model (UUID, lat, lng, type, status)    |
|   • Protocol Message Envelopes (HELLO, MANIFEST, PAYLOAD)   |
|   • Shared Enums (P0-P3 Priority, Incident Lifecycle)       |
|   • System Constants (Default TTL, Max Hops = 3)            |
+-------------------------------------------------------------+
                               ^
                               |
+-------------------------------------------------------------+
|                       Backend / Data                        |
|             (Dexie IndexedDB Core & Outbox Queue)           |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                         Networking                          |
|             (WebRTC DataChannel & Local Signaling)          |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                         Cloud Sync                          |
|             (Firebase Firestore Bridge)                     |
+-------------------------------------------------------------+
```

---

## What Will Live Here During the Event
* **TypeScript Type Declarations**:
  * `Incident`, `DraftIncident`, `IncidentType`, `IncidentPriority`, `IncidentStatus`
  * `RelayMessage`, `HelloMessage`, `ManifestMessage`, `PayloadMessage`, `AckMessage`
* **Frozen Data Contracts**:
  * Incident envelope fields and validation rules matching `NEXUS_PreEvent_Blueprint/00_SHARED/05_DATA_CONTRACT.md`.
* **System Constants**:
  * Default hop budget (`MAX_HOPS = 3`)
  * Default TTL duration (`DEFAULT_TTL_MS = 86400000` / 24 hours)
  * Priority weights and sorting criteria

---

## Implemented Contracts
* **[`types.ts`](./types.ts)**:
  * `Incident`: 12-field frozen incident envelope (`incidentId`, `originDeviceId`, `type`, `priority`, `latitude`, `longitude`, `timestamp`, `status`, `peopleAffected`, `version`, `hopCount`, `ttl`, `description?`).
  * `DraftIncident`: Wizard input model for Frontend.
  * `IncidentType`, `IncidentPriority`, `IncidentStatus`, `IncidentId`, `DeviceId`, `IncidentManifestItem`.
* **[`constants.ts`](./constants.ts)**:
  * `MAX_HOPS = 3`, `DEFAULT_TTL_MS = 86400000` (24h).
  * `PRIORITY_WEIGHTS`, `DEFAULT_PRIORITY_BY_TYPE`, `isIncidentExpired()`, `isEligibleForForwarding()`.
* **[`protocol.ts`](./protocol.ts)**:
  * 6-stage wire envelopes: `HELLO`, `MANIFEST`, `MISSING`, `REQUEST`, `PAYLOAD`, `ACK`, `FORWARD`.
  * Message factory functions: `createHelloMessage()`, `createManifestMessage()`, `createPayloadMessage()`, `createAckMessage()`.
  * Type guards: `isRelayMessage()`.
* **[`interfaces.ts`](./interfaces.ts)**:
  * `IOfflineStorageAdapter`: Boundary contract between Networking and Offline Core.
  * `IFrontendIncidentService`: Boundary contract between Frontend and Offline Core.
  * `INetworkRelayService`: Boundary contract between UI/Banners and Networking.
  * `ITransport`: Transport abstraction (WebRTC DataChannel vs Local WebSocket fallback).
* **[`index.ts`](./index.ts)**: Re-exports all shared contracts.
