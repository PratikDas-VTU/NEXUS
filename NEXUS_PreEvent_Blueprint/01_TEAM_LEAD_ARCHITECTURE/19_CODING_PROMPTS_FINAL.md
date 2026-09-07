# NEXUS — Coding Prompt Library (EVENT-TIME USE ONLY)

This is a prompt library, not application code. Use these prompts only after ANVESHAN'26 implementation time begins.

The event requires prompts/project details to be submitted within 24 hours. Keep a timestamped record of every prompt actually sent, including edits.

## Global rules for every stage

- Inspect the current repository before changing anything.
- Follow the frozen NEXUS architecture and incident contract.
- Implement one stage at a time.
- Modify only the required scope.
- Run/build/test immediately after implementation.
- Review the diff before accepting it.
- Do not silently redesign unrelated modules.
- Do not invent new field names when the contract already defines one.
- Do not add paid services without team approval.
- Do not claim a fallback is real mesh networking.

## Frozen incident contract

Fields:
incidentId, originDeviceId, type, priority, latitude, longitude, timestamp, status, peopleAffected, version, hopCount, ttl

Type values:
medical, trapped, missing, resource, shelter, safety

Priority:
P0 life-threatening
P1 urgent
P2 resource/shelter
P3 safety/information

Status:
reported, stored, queued, relayed, synced, verified, assigned, resolved, expired

Rules:
- Same incidentId + same version = ignore.
- Lower version = ignore.
- Higher version = accept/update.
- Validate before storing.
- Store before forwarding.
- Increment hopCount on forwarding.
- Stop forwarding on TTL expiry, exhausted hop budget, resolved, or expired.
- Keep expired incidents for audit; do not delete solely because TTL ended.
- Do not add `synced: boolean`; status + outbox/syncState are the synchronization source of truth.

---

## Stage 0 — Event setup

Scaffold the project only after the event begins. Create the Vite + React + TypeScript application, approved folders, development tooling and the minimal local signaling server.

Install only dependencies that have a clear purpose.

Checkpoint:
- project starts;
- build works;
- team can run it locally.

---

## Stage 1 — PWA + Field App shell

Implement:
- routing;
- light theme;
- mobile-first layout;
- PWA manifest/service worker;
- connectivity banner;
- Home screen;
- primary actions: Report Emergency, Report Resource Need, Report Safety Issue.

Field UX requirements:
- large touch targets;
- minimal typing;
- one primary action per screen;
- high contrast;
- text/icon plus semantic color;
- no emergency report blocked by connectivity.

Checkpoint:
The Field App opens and remains usable with Internet disabled.

---

## Stage 2 — Offline data core

Implement:
- frozen Incident model;
- Zod schema;
- Dexie/IndexedDB;
- device identity;
- incident ID generation;
- incident CRUD;
- outbox;
- peerCache;
- syncState.

Do not add a second synced boolean.

Checkpoint:
Create incident offline -> close/reopen -> incident remains.

---

## Stage 3 — Incident intelligence

Implement:
- P0-P3 suggestion;
- user priority override;
- deduplication;
- version handling;
- TTL;
- hop count;
- priority queue.

Expired incidents must remain retained for audit and must not be forwarded.

Checkpoint:
Priority, duplicate, version and TTL tests pass.

---

## Stage 4 — REAL A ↔ B networking

Primary transport:
- local signaling server;
- WebRTC DataChannel;
- direct local-network connection;
- no TURN as an MVP dependency.

Pairing:
- QR/session mechanism if time permits;
- reachable local address;
- short/manual fallback if QR/camera/address discovery fails.

Critical checkpoint:
Two separate real devices exchange a JSON message and ACK with Internet disabled.

If WebRTC has not worked reliably by the agreed checkpoint:
- use the local LAN WebSocket transport if real devices can reach the signaling server;
- keep the exact same relay protocol;
- do not silently switch to BroadcastChannel.

BroadcastChannel is development/application-logic testing only and is not proof of multi-device networking.

---

## Stage 5 — Relay protocol

Implement:
HELLO
MANIFEST
MISSING
REQUEST
PAYLOAD
ACK
FORWARD

PAYLOAD handling must be:

receive -> parse -> validate -> dedup/version-check -> persist -> ACK -> eligible for forwarding

Malformed messages must be rejected safely and logged without crashing the app.

Checkpoint:
A sends an incident to B; B validates, stores and ACKs.

---

## Stage 6 — REAL A → B → C

Prove:
- B retains the incident after A disconnects;
- B later connects to C;
- C receives and validates;
- C stores before any later forwarding;
- hopCount changes correctly;
- duplicates are suppressed.

Checkpoint:
Real multi-device two-hop relay works.

---

## Stage 7 — Cloud sync

Implement Firestore sync:
- unsynced incidents from outbox;
- idempotent document identity using incidentId;
- retry/backoff;
- sync state;
- status transition to synced only after successful cloud write.

Cloud sync must never be required for local creation.

Checkpoint:
C reconnects to Internet -> incident reaches Firestore.

---

## Stage 8 — Command Dashboard

Implement:
- dashboard shell;
- connectivity/sync status;
- P0/P1 alert panel;
- priority/status filters;
- incident queue;
- incident detail;
- map;
- source/origin/relay metadata where available;
- Verify;
- Assign;
- Resolve;
- operational history.

P0 alert:
- visual alert ALWAYS;
- audio only if browser interaction/autoplay permits;
- never rely on audio alone;
- avoid duplicate alert spam.

Checkpoint:
A cloud-synced incident appears on the dashboard and can be verified, assigned and resolved.

---

## Stage 9 — Hardening

Test and harden:
- malformed peer payloads;
- invalid message types;
- invalid versions;
- invalid hop/TTL;
- duplicate payloads;
- lost DataChannel;
- sync failures;
- retries;
- service-worker/cache issues;
- map tile failure;
- truthful status labels.

Checkpoint:
Failures do not corrupt the local incident store.

---

## Stage 10 — Demo support

Primary demo:

A creates P0 offline
-> B receives/stores
-> A disconnects
-> B relays to C
-> C gets Internet
-> cloud sync
-> responder dashboard
-> P0 alert
-> map
-> verify
-> assign
-> resolve

If a debug panel is needed, keep it clearly separated from judge-facing UI.

---

## AI decision rule

If blocked:
1. State exactly what failed.
2. Show evidence/error.
3. Identify likely cause.
4. Attempt the smallest fix.
5. Retest.
6. State fallback and demo impact.

Do not spend unlimited time on optional features or experimental infrastructure.

## Definition of done

The core MVP is complete when:
offline creation + persistence + P0-P3 + dedup/version + TTL/hop + real A-B + store-before-forward + real A-B-C + cloud sync + dashboard + verify/assign/resolve + truthful status + golden demo
all work, or the team has explicitly accepted a documented fallback.
