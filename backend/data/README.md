# Backend Data Workstream

This directory is reserved primarily for **Member 3 (Data / Database / Backend)**.

---

## Purpose
During the ANVESHAN'26 event, this folder will contain the core offline data engine, persistence layer, validation schemas, and database synchronization logic for NEXUS.

---

## Architecture Clarification: IndexedDB + Dexie (Offline) & Firestore (Cloud)
> [!IMPORTANT]
> **MongoDB is NOT introduced into NEXUS.**
> While Member 3 has prior experience with MongoDB, the frozen architectural requirements dictate:
> * **Offline Local Data Core**: Browser-native **IndexedDB** managed via **Dexie.js** (runs fully offline on phones and laptops without database servers or daemons).
> * **Cloud Synchronization**: **Firebase Firestore** (used when internet connectivity is restored).
> 
> Member 3's understanding of document schemas, collections, indexes, and BSON maps cleanly to Dexie stores and Firestore documents.

---

## Member Ownership & Responsibilities
* **Primary Owner**: Member 3 (Data / Database / Backend)
* **Branch**: `data-backend`
* **Core Responsibilities**:
  * Implement runtime data validation using **Zod** matching the frozen data contract.
  * Configure Dexie database stores (`incidents`, `outbox`, `peerCache`, `syncState`).
  * Implement deterministic CRUD operations for emergency and resource reports.
  * Build deduplication and semantic versioning logic (`incomingVersion > localVersion`).
  * Implement the priority evaluation engine (P0 > P1 > P2 > P3) and TTL calculations.
  * Implement the Outbox queue to manage records awaiting peer forwarding or cloud sync.
  * Map local documents to Firestore data structures for Member 1's cloud sync pipeline.

---

## Relationship to Other Layers
* **Depends on `shared/`**: Enforces strict conformance to the shared incident contract (`incidentId`, `originDeviceId`, `type`, `priority`, `status`, `version`, `hopCount`, `ttl`).
* **Serves `frontend/`**: Supplies strongly-typed service functions and reactive query hooks (`useLiveQuery`).
* **Coordinates with `networking/`**: Supplies pending payloads to the relay engine and updates incident lifecycle status upon verified peer `ACK`.

---

## Pre-Event Status
> [!IMPORTANT]
> **No database schema, Dexie instance, or application source code is present in this directory.**
> Database initialization, schemas, and persistence logic will be developed strictly during the hackathon following the team lead's instruction to start coding.
