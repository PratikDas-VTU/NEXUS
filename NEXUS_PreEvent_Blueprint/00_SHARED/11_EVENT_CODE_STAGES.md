# Event-Time Code Writing Stages

## Stage 0 — Event setup
Create repository/project, install dependencies, confirm devices and network.

## Stage 1 — PWA shell
App boot, routing, light theme, offline shell, connectivity state.

## Stage 2 — Offline data core
Incident schema, IndexedDB/Dexie, device identity, CRUD, outbox.

## Stage 3 — Incident intelligence
P0-P3, dedup, versioning, TTL, queue ordering.

## Stage 4 — Real A <-> B networking
Local signaling + direct WebRTC DataChannel. Prove JSON exchange with Internet disabled.

## Stage 5 — Relay protocol
HELLO/MANIFEST/MISSING/REQUEST/PAYLOAD/ACK.

## Stage 6 — A -> B -> C
Store at B, disconnect A, relay B -> C, validate persistence.

## Stage 7 — Cloud
Firestore sync and dashboard data.

## Stage 8 — Command dashboard
Live map, alerts, filters, verify/assign/resolve.

## Stage 9 — Hardening
Malformed payloads, retries, TTL sweep, status truthfulness, error handling.

## Stage 10 — Demo
Golden path, backup path, evidence/logging, final rehearsal.
