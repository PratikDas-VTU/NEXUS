# Testing & Verification Operations

This directory serves as the centralized testing, test fixtures, and quality assurance workspace for NEXUS.

---

## Purpose
During the ANVESHAN'26 event, this folder will contain automated test suites, test runners, mock datasets, and manual verification scripts ensuring that NEXUS satisfies all reliability, offline, and multi-hop relay constraints.

---

## Member Ownership & Responsibilities
* **Primary Lead**: Member 4 (Backend Support / Integration / QA)
* **Co-Lead / Architectural Validation**: Member 1 (Team Lead / Integration)
* **Branch**: `integration-qa`
* **Core Responsibilities**:
  * Implement automated unit tests for Zod schema parsing and malformed packet rejection.
  * Implement deduplication and versioning regression tests (`incomingVersion > localVersion`).
  * Implement offline data persistence tests (IndexedDB transaction integrity).
  * Build multi-device relay verification scenarios (simulating Device A $\rightarrow$ Device B $\rightarrow$ Device C).
  * Maintain realistic disaster demonstration datasets (`fixtures/mockIncidents.ts`).
  * Execute the master testing checklist from `NEXUS_PreEvent_Blueprint/00_SHARED/15_TESTING_CHECKLIST.md`.

---

## Planned Test Structure During the Event
```text
tests/
├── unit/
│   ├── schema.test.ts          # Zod validation & boundary checks
│   ├── dedup.test.ts           # Versioning & duplicate suppression
│   └── priority.test.ts        # Priority ranking & TTL expiration
│
├── integration/
│   ├── persistence.test.ts     # Dexie transaction survival
│   ├── relayProtocol.test.ts   # HELLO -> MANIFEST -> PAYLOAD -> ACK handshake
│   └── outboxQueue.test.ts     # Outbox enqueue and dequeue operations
│
└── fixtures/
    └── demoIncidents.ts        # Seed data for campus emergency scenarios
```

---

## Pre-Event Status
> [!IMPORTANT]
> **No test suites, mock files, or application test runners are present in this directory.**
> All test files and fixtures will be authored strictly during the hackathon following the team lead's instruction to start coding.
