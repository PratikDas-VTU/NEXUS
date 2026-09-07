# NEXUS — Team Work Assignment & Ownership Matrix

This document defines the roles, ownership, learning targets, event-time implementation scopes, dependencies, and jury demonstration strategies for all four team members.

---

## 1. Team Structure & Operating Philosophy

NEXUS is engineered as an offline-first emergency coordination system split into four clear operational layers. To ensure genuine teamwork, avoid single-person bottlenecks, and guarantee that every member has substantial, demonstrable code and deliverables during ANVESHAN'26, the team is organized into four complementary roles:

* **Member 1**: Team Lead / Architect / Integration (System orchestration, WebRTC/signaling, relay engine, cloud integration, final code integration)
* **Member 2**: Frontend / Product Implementation (Field App UI, Command Dashboard UI, Leaflet map integration, responsive touch flows, client-side UX state)
* **Member 3**: Data / Database / Backend (Offline data core, Dexie/IndexedDB, Zod schemas, dedup/versioning/TTL, outbox queue, Firestore data mapping)
* **Member 4**: QA / UI Support / Operations Implementation (Reusable UI component library, form controls, badges/cards, accessibility, end-to-end device testing, failure injection, demo data)

### Core Operating Rules
1. **Contract Integrity**: The incident contract in `00_SHARED/05_DATA_CONTRACT.md` is **frozen**. No member may alter field names, types, or enums unilaterally.
2. **True Modularity**: Members 2, 3, and 4 develop their components against interfaces and contracts so development proceeds concurrently without waiting on live networking.
3. **Continuous Integration**: Integration occurs at predetermined 2-hour checkpoints, led by Member 1, rather than as a frantic scramble at the end.
4. **Demonstrable Code for All**: Every single member will have specific files, components, and modules that they authored and can defend in front of the jury.

---

## 2. Master Assignment Matrix

| Member | Primary Ownership | Event Implementation Scope | Dependencies | Backup Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Member 1**<br>*(Team Lead / Architect)* | Overall architecture, networking transport, relay engine, system integration | • Local signaling server (`ws`)<br>• WebRTC DataChannel transport<br>• Relay handshake engine (HELLO/ACK)<br>• Cloud Firestore sync service<br>• Branch merging & build pipelines | Frozen Data Contract, Dexie persistence layer | High-complexity UI/backend debugging |
| **Member 2**<br>*(Frontend / Product)* | Field App UX & Command Dashboard interfaces | • PWA shell & responsive layouts<br>• 6-step incident report wizard<br>• Incident queue & detail panels<br>• Leaflet map marker visualization<br>• Verification/assignment UI controls | Reusable UI components from Member 4, Dexie hooks from Member 3 | Field App polish, backup dashboard views |
| **Member 3**<br>*(Data / Database / Backend)* | Offline data core, IndexedDB storage, data integrity, outbox queue | • Dexie database schema & stores<br>• Zod runtime schema validators<br>• Priority, dedup & versioning logic<br>• Outbox queue management<br>• Firestore document mapping helpers | Frozen Data Contract (`05_DATA_CONTRACT.md`) | Signaling message validation logic |
| **Member 4**<br>*(QA / UI Support / Operations)* | Reusable UI design system, component implementation, end-to-end QA | • Base UI library (Buttons, Badges, Cards, Modals)<br>• Form inputs & error/empty states<br>• Priority indicator components (P0-P3)<br>• Cross-device manual test matrix execution<br>• Seed/demo scenario data creation | UX Specifications (`03_FIELD_APP_UX.md`, `04_COMMAND_DASHBOARD.md`) | Frontend layout assistance, presentation prep |

---

## 3. Individual Member Profiles & Responsibilities

---

### MEMBER 1 — Team Lead / Architect / Integration

#### Role Overview
Primary custodian of system architecture, high-complexity networking, cross-track integration, and emergency pivot decisions.

#### Primary Ownership
* System architecture conformance (`00_SHARED/02_ARCHITECTURE.md`)
* Local WebSocket signaling server for peer discovery
* WebRTC DataChannel connection lifecycle & ICE negotiation
* Store-carry-forward relay state machine (`00_SHARED/06_RELAY_PROTOCOL.md`)
* Bi-directional Firestore cloud sync integration
* Master Git integration, continuous build health, and conflict resolution

#### Secondary / Support Responsibilities
* Assisting Member 3 with complex Dexie indexing or async query optimization
* Assisting Member 2 with Leaflet map tile failure fallbacks
* Coordinating with Member 4 on edge-case bug verification

#### Pre-Event Learning Checklist
- [ ] Review WebRTC DataChannel API (`RTCPeerConnection`, `createDataChannel`, `RTCDataChannel.onmessage`).
- [ ] Review Node.js `ws` library for lightweight LAN signaling.
- [ ] Review Firebase JS Modular SDK v11/v12 (`setDoc`, `onSnapshot`, `enableIndexedDbPersistence`).
- [ ] Review the Hour-9 Decision Gate criteria in `00_SHARED/12_24H_EXECUTION.md`.

#### Event-Time Code Implementation
* `src/transport/signaling.ts` & signaling server script `server/signaler.js`
* `src/transport/webrtcAdapter.ts`
* `src/relay/relayEngine.ts` (handling `HELLO`, `MANIFEST`, `REQUEST`, `PAYLOAD`, `ACK`)
* `src/sync/firestoreSync.ts`
* Root integration wiring in `src/App.tsx` and context providers

#### How to Demonstrate Contribution to Jury
* Explain the WebRTC peer negotiation flow without internet access.
* Demonstrate the store-carry-forward relay state machine across three separate physical devices.
* Walk the jury through the architectural rationale for keeping the local incident engine fully decoupled from the cloud layer.

---

### MEMBER 2 — Frontend / Product Implementation

#### Role Overview
Owner of user experience, interactive screens, emergency reporting workflows, and responder command panels.

#### Primary Ownership
* Mobile-first NEXUS Field App screens and routing (`02_FRONTEND_PRODUCT/03_FIELD_APP_UX.md`)
* NEXUS Command Dashboard desktop interface (`02_FRONTEND_PRODUCT/04_COMMAND_DASHBOARD.md`)
* 6-step incident creation flow with panic-friendly ergonomics
* Leaflet live incident map integration, custom markers, and fallback views
* Incident filter controls (P0-P3, Status) and audit queue lists
* Responder action triggers (Verify, Assign, Resolve)

#### Secondary / Support Responsibilities
* Providing UI feedback and review for Member 4's reusable component library
* Wireframe compliance and light-theme contrast tuning
* Coordinating with Member 3 to bind Dexie reactive hooks (`useLiveQuery`) to UI views

#### Pre-Event Learning Checklist
- [ ] Review React state management, context, and custom hooks.
- [ ] Review Tailwind CSS styling for mobile-first touch interfaces.
- [ ] Review Leaflet & React-Leaflet (`MapContainer`, `TileLayer`, `Marker`, `Popup`).
- [ ] Review Vite asset handling for Leaflet marker icons.

#### Event-Time Code Implementation
* `src/pages/field/HomeScreen.tsx`, `ReportWizard.tsx`, `MyIncidents.tsx`
* `src/pages/dashboard/DashboardLayout.tsx`, `IncidentQueue.tsx`, `IncidentDetail.tsx`
* `src/components/map/IncidentMap.tsx`
* `src/components/layout/ConnectivityBanner.tsx`
* View routing and navigation state

#### How to Demonstrate Contribution to Jury
* Walk through the Field App panic-friendly reporting flow, demonstrating how clear contrast and single-action screens reduce cognitive load.
* Show how the Command Dashboard updates in real time when new incidents are ingested or verified.
* Explain the graceful map degradation when map tiles cannot load during an internet blackout.

---

### MEMBER 3 — Data / Database / Backend

#### Role Overview
Owner of client-side persistence, schema validation, incident lifecycle state, deduplication, and outbox synchronization pipelines.

#### Context on Database Experience
* *Note on MongoDB Experience*: Member 3's existing understanding of document schemas, collections, indexes, and BSON maps directly to **IndexedDB/Dexie** and **Firestore** documents. (See concept comparison table in `03_DATA_BACKEND/README.md`). MongoDB is not used directly, but document-store mental models apply 100%.

#### Primary Ownership
* Dexie database initialization and table schema configuration (`00_SHARED/05_DATA_CONTRACT.md`)
* Runtime validation using Zod schemas for all inbound and outbound payloads
* Incident CRUD operations and custom query hooks
* Duplicate suppression and semantic versioning logic (higher version accepts, lower/same ignores)
* Priority ranking engine (P0 > P1 > P2 > P3) and TTL calculation
* Outbox queue management (marking incidents eligible for peer forwarding and cloud sync)

#### Secondary / Support Responsibilities
* Supporting Member 1 with Firestore document mapping and sync payload structures
* Supporting Member 2 with live Dexie queries (`useLiveQuery`) for fluid UI updates
* Assisting Member 4 with generating realistic mock data fixtures for automated and manual tests

#### Pre-Event Learning Checklist
- [ ] Review Dexie.js basics (`Dexie`, `Table`, `db.version().stores()`, `toArray()`, `where()`).
- [ ] Review Zod validation (`z.object()`, `z.enum()`, `safeParse()`).
- [ ] Study the incident lifecycle state diagram in `00_SHARED/07_UML.md`.
- [ ] Read the MongoDB-to-Dexie translation guide in `03_DATA_BACKEND/README.md`.

#### Event-Time Code Implementation
* `src/core/db.ts` (Dexie database definition and table declarations)
* `src/core/schema.ts` (Zod validation schemas and TypeScript types)
* `src/core/incidentService.ts` (save, update, query, version-check, priority assignment)
* `src/core/outboxService.ts` (outbox queue, pending sync states, hop count incrementer)
* `src/core/dedup.ts` (duplicate detection and TTL expiration evaluation)

#### How to Demonstrate Contribution to Jury
* Live-demonstrate that an incident created with Wi-Fi disabled persists in IndexedDB across browser tab restarts.
* Show automated unit tests proving that duplicate incidents or lower-version stale updates are safely suppressed.
* Explain the outbox state machine and how local persistence is guaranteed before any peer forwarding occurs.

---

### MEMBER 4 — QA / UI Support / Operations Implementation

#### Role Overview
Owner of reusable visual building blocks, accessible UI components, form validation feedback, end-to-end device testing, failure simulation, and presentation data readiness.

#### Primary Ownership
* Building the reusable design system component library (buttons, cards, badges, modal dialogs)
* Form input components with validation feedback and touch-friendly tap targets (minimum 48px)
* Status pills and Priority badges (`P0 Life-Threatening`, `P1 Urgent`, `P2 Resource`, `P3 Safety`)
* Empty states, loading spinners, and error notification banners
* Execution of the physical multi-device testing checklist (`00_SHARED/15_TESTING_CHECKLIST.md`)
* Maintaining the bug report log during integration checkpoints
* Preparing realistic demonstration incident scenarios for the final pitch

#### Secondary / Support Responsibilities
* Assisting Member 2 with responsive CSS adjustments on various test phone screen sizes
* Assisting Member 1 by verifying that peer connection failure prompts appear truthfully
* Ensuring strict adherence to accessibility (WCAG AA color contrast) and light-theme guidelines

#### Pre-Event Learning Checklist
- [ ] Review HTML5 semantics and basic React functional component creation.
- [ ] Review Tailwind CSS utility classes (spacing, flexbox, colors, touch targets).
- [ ] Review the testing matrix in `00_SHARED/15_TESTING_CHECKLIST.md`.
- [ ] Review the Golden Demo script in `00_SHARED/17_DEMO_SCRIPT.md`.

#### Event-Time Code Implementation
* `src/components/ui/Button.tsx` (primary, secondary, danger, disabled states)
* `src/components/ui/Badge.tsx` (priority badges P0-P3, status tags)
* `src/components/ui/Card.tsx` & `IncidentCard.tsx`
* `src/components/ui/InputField.tsx`, `SelectField.tsx`, `TextArea.tsx`
* `src/components/ui/EmptyState.tsx` & `ErrorBanner.tsx`
* `src/fixtures/demoIncidents.ts` (realistic mock datasets for campus outage demo)

#### How to Demonstrate Contribution to Jury
* Showcase the reusable UI design system and explain how component modularity enabled rapid screen assembly.
* Walk the jury through the testing checklist results, showing documented evidence of successful failure-handling (malformed payload rejection, offline persistence verification).
* Act as the operator for Device A or Device B during the live presentation pitch.

---

## 4. Dependencies & Handoff Points

```text
+--------------------------------------------------------------------------------+
|                                00_SHARED                                       |
|                    Data Contract & Architecture Specs                          |
+--------------------------------------------------------------------------------+
          |                                                   |
          v                                                   v
+-----------------------------+                     +----------------------------+
|        MEMBER 4             |                     |        MEMBER 3            |
|   Reusable UI Components    |                     |   Offline Data Core        |
|  (Buttons, Badges, Forms)   |                     |   (Dexie, Zod, Outbox)     |
+-----------------------------+                     +----------------------------+
          |                                                   |
          | (Delivers UI Elements)                            | (Delivers Data Layer)
          v                                                   v
+--------------------------------------------------------------------------------+
|                                MEMBER 2                                        |
|                       Frontend / Product Screens                               |
|              (Field App Wizard, Dashboard, Map View, Queue)                    |
+--------------------------------------------------------------------------------+
                                       |
                                       | (Connects to Storage & UI)
                                       v
+--------------------------------------------------------------------------------+
|                                MEMBER 1                                        |
|                      Integration & Transport Core                              |
|           (WebRTC DataChannel, Local Signaling, Relay Engine, Cloud Sync)      |
+--------------------------------------------------------------------------------+
                                       |
                                       | (Delivers Full System)
                                       v
+--------------------------------------------------------------------------------+
|                                MEMBER 4                                        |
|                          System-Wide QA & Pitch                                |
|        (Multi-Device Testing, Failure Injection, Demo Scenarios)               |
+--------------------------------------------------------------------------------+
```

---

## 5. Integration Checkpoints (Every 2 Hours)

| Hour | Milestone | Integration Checkpoint Target | Lead Validator |
| :--- | :--- | :--- | :--- |
| **H1** | Environment Setup | Repository initialized, packages installed, local dev server runs on all 4 machines. | Member 1 |
| **H3** | Shell & Core Schema | Member 4's base components merge with Member 2's shell. Member 3's Dexie schema compiles. | Member 1 & 2 |
| **H5** | Offline Creation Loop | Field App report wizard creates, validates, and stores an incident in IndexedDB. Persists after restart. | Member 3 & 4 |
| **H7** | Priority & Queue | Dedup, versioning, and P0-P3 queue ordering verified via automated tests and UI cards. | Member 3 & 4 |
| **H9** | **DECISION GATE** | **Real A-B transport checkpoint**: Prove WebRTC DataChannel exchanges JSON over local LAN. If failed, trigger WebSocket fallback. | **Member 1 (Mandatory)** |
| **H11** | Relay Handshake | `HELLO` -> `MANIFEST` -> `REQUEST` -> `PAYLOAD` -> `ACK` successfully relays incident from Device A to Device B. | Member 1 & 3 |
| **H13** | Two-Hop A-B-C | A sends to B; A disconnects; B reconnects to C; C receives and stores. | Member 1 & 4 |
| **H15** | Cloud Sync | Device C connects to internet; outbox uploads to Firestore idempotently. | Member 1 & 3 |
| **H17** | Command Dashboard | Synced incidents appear on desktop dashboard; Leaflet map renders coordinates. | Member 2 & 1 |
| **H19** | Action Loop | Responders can Verify, Assign, and Resolve incidents on the dashboard. | Member 2 & 4 |
| **H21** | System Hardening | Failure testing: malformed peer packets, expired TTL, map tile failures, offline status truthfulness. | Member 4 & 1 |
| **H23** | Golden Demo Rehearsal | Full continuous run of the emergency scenario script across 3 physical devices + dashboard. | All 4 Members |

---

## 6. Strict Event Boundaries: What Must NOT Be Done Independently

To prevent catastrophic merge conflicts or disqualification, the following actions are strictly prohibited without unanimous team consent:
1. **Never Modify the Frozen Data Contract**: No one may rename fields, change status enum values, or add fields (e.g. `synced: boolean`) to `00_SHARED/05_DATA_CONTRACT.md`.
2. **Never Swap Core Architecture**: Member 3 must not introduce MongoDB; Member 1 must not introduce external cloud TURN servers or non-approved mesh frameworks.
3. **Never Add Paid APIs**: No Google Maps API keys or subscription services. Leaflet and OSM fallback are mandatory.
4. **Never Mask Relay Reality**: Never substitute a mock `BroadcastChannel` in the judge presentation and call it a physical mesh network.
5. **Never Commit Directly to Main**: Every member works on designated feature branches (`feat/ui-components`, `feat/field-app`, `feat/dexie-core`, `feat/webrtc-relay`), merged through Member 1 after passing the checkpoint test.

---

## 7. Individual Jury Pitch Guidelines

During the final presentation, each member will have 60–90 seconds to speak directly to the jury regarding their individual engineering contribution:

* **Member 1 (Team Lead / Architect)**:
  > *"I architected the store-carry-forward relay protocol and developed the direct WebRTC DataChannel transport, allowing multi-hop packet propagation across disconnected physical devices without cellular or internet infrastructure."*
* **Member 2 (Frontend / Product)**:
  > *"I engineered the mobile-first Field App and desktop Command Dashboard, focusing on high-contrast panic-friendly UX with zero latency, live map marker tracking, and multi-status governance workflows."*
* **Member 3 (Data / Backend)**:
  > *"I implemented the offline client data engine using Dexie and IndexedDB, building runtime Zod validation, automated deduplication, versioning conflict resolution, and the persistent outbox synchronization pipeline."*
* **Member 4 (QA / UI Support)**:
  > *"I developed the reusable design system and accessible form controls, generated the operational demo data scenarios, and executed the multi-device failure resilience test matrix to prove the app survives network drops and malformed peer payloads."*
