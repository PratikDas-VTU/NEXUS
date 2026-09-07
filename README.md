# NEXUS — Offline-First Emergency Incident Coordination Layer

> **ANVESHAN'26 Hackathon Project**  
> **Repository**: [https://github.com/PratikDas-VTU/NEXUS.git](https://github.com/PratikDas-VTU/NEXUS.git)  
> **Status**: Pre-Event Organizational Structure (No application code pre-written)

---

## What is NEXUS?

NEXUS is an offline-first emergency incident coordination and store-carry-forward relay system designed to operate in severe infrastructure blackout scenarios (power cuts, network outages, natural disasters).

* **Core Principle**: NEXUS does not create Internet or cellular connectivity. GPS is location capture, not communication. NEXUS preserves, validates, and propagates structured emergency information opportunistically between physical devices via direct local transport, synchronizing to cloud responders when connectivity is restored.

---

## Team Structure & Ownership

NEXUS is developed by a 4-member team working in a single repository with modular workstream ownership:

| Member | Workstream / Branch | Primary Domain Ownership | Key Deliverables During Event |
| :--- | :--- | :--- | :--- |
| **Member 1**<br>*(Team Lead)* | `core-architecture` | Core Architecture, Networking, System Integration | WebRTC DataChannel, local signaling (`ws`), relay protocol state machine, Firestore cloud sync, continuous integration |
| **Member 2** | `frontend` | Frontend / Product Implementation | NEXUS Field App (mobile-first), NEXUS Command Dashboard (desktop), Leaflet map tracking, responsive report wizard |
| **Member 3** | `data-backend` | Data / Database / Backend Core | Dexie.js (IndexedDB) data layer, Zod validation schemas, deduplication, semantic versioning, outbox queue |
| **Member 4** | `integration-qa` | Backend Support / Integration / QA | Message serialization/deserialization helpers, validation utilities, ACK/error handling, automated test suites, multi-device testing |

---

## The Shared Contract Principle

The four workstreams do **not** operate as isolated silos. All modules interface through deterministic contracts:

```text
Frontend (Member 2)
       |
       v
Shared Contracts (Frozen Incident Model & Wire Envelopes)
       ^
       |
Backend / Data Core (Member 3)
       |
       v
Backend Integration & QA Helpers (Member 4)
       |
       v
Networking & Local Relay Engine (Member 1)
       |
       v
Cloud Sync & Command Dashboard (Member 1 & 2)
```

---

## Git Branching Model

To ensure independent, non-blocking development across all four team laptops, the team uses a single repository with feature branches:

```text
main (Protected — stable integration milestones only)
│
├── core-architecture  (Member 1: signaling, WebRTC, relay, sync)
├── frontend           (Member 2: Field App, Dashboard, map, UI)
├── data-backend       (Member 3: Dexie, Zod, outbox, versioning)
└── integration-qa     (Member 4: serialization, helpers, test suites)
```

### Collaboration Workflow
1. Members work and commit within their designated branch.
2. At scheduled 2-hour integration checkpoints (led by Member 1), branches undergo integration checks against `shared/` contracts.
3. Once verified against the testing checklist, branches are merged into `main`.

---

## Repository Directory Structure

```text
NEXUS/
├── README.md                  # Master repository entrypoint (this file)
│
├── frontend/                  # Member 2: Field App & Command Dashboard
│   └── README.md
│
├── backend/                   # Backend & Data layers
│   ├── data/                  # Member 3: Dexie/IndexedDB, Zod schemas, outbox
│   │   └── README.md
│   └── integration/           # Member 4: Integration helpers, serialization, ACK handling
│       └── README.md
│
├── networking/                # Member 1: WebRTC, signaling, relay state machine
│   └── README.md
│
├── shared/                    # Shared types, incident models, and protocol envelopes
│   └── README.md
│
├── tests/                     # Unit, integration, relay, and multi-device test suites
│   └── README.md
│
├── docs/                      # Repository documentation and runbooks
│   └── README.md
│
└── NEXUS_PreEvent_Blueprint/  # Comprehensive pre-event blueprints, UML, and execution boards
    ├── 00_SHARED/             # Master requirements, architecture, data contract, demo script
    ├── 01_TEAM_LEAD_ARCHITECTURE/ # Relay protocol, AI coding rules, prompt library
    ├── 02_FRONTEND_PRODUCT/   # Field App UX, Command Dashboard UX, frontend breakdown
    ├── 03_DATA_BACKEND/       # Backend breakdown, MongoDB-to-Dexie translation bridge
    ├── 04_QA_UI_SUPPORT/      # UI component catalog, QA procedures, bug templates
    ├── TEAM_WORK_ASSIGNMENT.md# Master 4-member ownership matrix & jury pitch scripts
    ├── TEAM_HANDOFF.md        # Detailed inter-layer handoff specifications
    └── EVENT_TASK_BOARD.md    # 24-hour hackathon task board
```

---

## Compliance Notice

> [!IMPORTANT]
> **This repository is currently in PRE-EVENT PLANNING MODE.**
> * NO NEXUS application code has been written.
> * NO React/Vite application has been scaffolded.
> * NO database or schema has been initialized.
> * NO Firebase backend has been deployed.
> * NO WebRTC or networking implementation has been started.
> 
> All implementation begins strictly upon the official start of ANVESHAN'26 when the instruction to START CODING is issued.
