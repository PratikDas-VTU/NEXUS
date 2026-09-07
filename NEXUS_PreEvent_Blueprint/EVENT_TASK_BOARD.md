# NEXUS — 24-Hour Event Planning Task Board

> [!IMPORTANT]
> This is a planning-only task board. **Do NOT execute or implement any of these tasks before the hackathon officially commences.**

---

## Task Matrix Overview

| Section | Target Hours | Core Focus | Lead Member |
| :--- | :--- | :--- | :--- |
| **0. Before Event** | Pre-Event | Tooling readiness, network config, concept study | All Members |
| **1. Stage 0: Event Setup** | H0 – H1 | Scaffolding, dependency install, repository structure | Member 1 |
| **2. Field App Development** | H1 – H6 | PWA shell, report wizard, panic UX, status screens | Member 2 & 4 |
| **3. Data / Backend Core** | H1 – H6 | Dexie database, Zod schema, persistence, outbox | Member 3 |
| **4. Local Networking & Relay** | H6 – H13 | Local signaling, WebRTC DataChannel, multi-hop relay | Member 1 |
| **5. Command Dashboard** | H13 – H19 | Desktop view, Leaflet map, incident queue, actions | Member 2 & 1 |
| **6. QA & Testing Operations** | Continuous | Unit checks, failure injection, multi-device audit | Member 4 |
| **7. Final Integration** | H19 – H22 | Cross-layer tie-in, hardening, error handling | Member 1 & All |
| **8. Final Demo & Pitch** | H22 – H24 | Script rehearsal, presentation slides, judge demo | All Members |

---

## 1. BEFORE EVENT (Preparation Only — No Code)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PRE-01** | Tooling & Cache Audit | Member 1 | Node/npm installed | Verify Node, npm, Git, and npm package cache | Entire Team | P0 | Low |
| **PRE-02** | Firebase CLI Re-Auth | Member 1 | Google account | `firebase login --reauth` verified working | Member 3 | P0 | Low |
| **PRE-03** | Wi-Fi Router / Hotspot Setup | Member 1 | Local router / phone | Controlled LAN with AP isolation disabled | Entire Team | P0 | Medium |
| **PRE-04** | Read UX & Data Specs | Member 2 & 4 | Blueprint docs | Full understanding of Field UX & Dashboard | Member 1 | P0 | Low |
| **PRE-05** | Dexie & Zod Architecture Study | Member 3 | Blueprint docs | Read MongoDB-to-Dexie concept bridge | Member 1 | P0 | Low |
| **PRE-06** | Test Device Preparation | Member 4 | 2+ phones / laptops | Browsers updated, camera ready for QR | Entire Team | P1 | Low |

---

## 2. DURING EVENT — STAGE 0: SETUP & SCAFFOLDING (H0 – H1)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STG0-01**| Initialize Git Repo | Member 1 | Event start signal | Clean repository with `.gitignore` | Entire Team | P0 | Low |
| **STG0-02**| Scaffold Vite + React + TS | Member 1 | STG0-01 | Baseline Vite project with Tailwind CSS | Member 2 & 3 | P0 | Low |
| **STG0-03**| Install Cached Dependencies | Member 1 | STG0-02 | `npm install --prefer-offline` completes | Entire Team | P0 | Low |
| **STG0-04**| Setup Folder Architecture | Member 1 | STG0-03 | `/core`, `/components`, `/pages`, `/transport` | Entire Team | P0 | Low |
| **STG0-05**| Minimal Signaling Server Script | Member 1 | STG0-03 | Lightweight Node.js WebSocket script (`server/signaler.js`) | Local network | P1 | Medium |
| **STG0-06**| Smoke Test on 4 Laptops | Member 4 | STG0-04 | Dev server launches on each team member's machine | Member 1 | P0 | Low |

---

## 3. DURING EVENT — FIELD APP DEVELOPMENT (H1 – H6)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FLD-01** | Base UI Component Library | Member 4 | STG0-04 | `Button`, `Badge`, `Card`, `InputField` components | Member 2 | P0 | Low |
| **FLD-02** | Light Theme & PWA Layout Shell | Member 2 | STG0-04 | Mobile frame, header, navigation container | Member 4 | P0 | Medium |
| **FLD-03** | Truthful Connectivity Banner | Member 2 | FLD-02 | Online / Local-Only / Offline visual status | Member 4 | P0 | Low |
| **FLD-04** | Home Screen & Emergency Triggers | Member 2 | FLD-01, FLD-02 | 3 prominent buttons: Emergency, Resource, Safety | Member 4 | P0 | Low |
| **FLD-05** | 6-Step Incident Report Wizard | Member 2 | FLD-01, FLD-04 | Step-by-step panic-friendly form wizard | Member 3 | P0 | High |
| **FLD-06** | Geolocation Capture & Manual Fallback| Member 2 | FLD-05 | GPS coordinate grab with latitude/longitude inputs | Member 3 | P0 | Medium |
| **FLD-07** | My Incidents / Status View | Member 2 | FLD-01 | List showing saved reports and their lifecycle state | Member 4 | P1 | Medium |

---

## 4. DURING EVENT — DATA / BACKEND CORE (H1 – H6)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DAT-01** | Incident Zod Schema Definition | Member 3 | STG0-04 | Strict runtime validator matching `05_DATA_CONTRACT.md` | Member 1 & 2 | P0 | Medium |
| **DAT-02** | Dexie Database Stores Config | Member 3 | DAT-01 | IndexedDB stores: `incidents`, `outbox`, `peerCache` | Member 2 | P0 | Medium |
| **DAT-03** | Incident CRUD Service Layer | Member 3 | DAT-02 | Methods: `createIncident`, `getIncidents`, `updateStatus` | Member 2 | P0 | Medium |
| **DAT-04** | Priority Ranking & TTL Engine | Member 3 | DAT-01 | Automatic P0-P3 suggestion and TTL expiration calculation | Member 2 | P1 | Medium |
| **DAT-05** | Deduplication & Versioning Engine | Member 3 | DAT-02 | Monotonic version check; stale duplicate rejection | Member 1 | P0 | High |
| **DAT-06** | Outbox Queue Implementation | Member 3 | DAT-02 | Outbox store for pending peer relays and cloud sync | Member 1 | P0 | Medium |

---

## 5. DURING EVENT — LOCAL NETWORKING & RELAY (H6 – H13)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NET-01** | WebSocket Signaling Client | Member 1 | STG0-05 | Client module connecting to local signaling server | Member 1 | P0 | Medium |
| **NET-02** | Peer Discovery & QR Session UX | Member 1 & 2 | NET-01 | QR code generation and scan / short-code pairing | Member 4 | P1 | Medium |
| **NET-03** | WebRTC DataChannel Adapter | Member 1 | NET-01 | Peer-to-peer data connection established over LAN | Member 1 | P0 | High |
| **NET-04** | **HOUR-9 DECISION GATE CHECK** | Member 1 | NET-03 | Two physical devices exchange JSON offline. (Switch to WS fallback if failed) | Entire Team | P0 | Critical |
| **NET-05** | Relay Protocol State Machine | Member 1 | NET-03 or WS | `HELLO` -> `MANIFEST` -> `REQUEST` -> `PAYLOAD` -> `ACK` | Member 3 | P0 | High |
| **NET-06** | Two-Hop Relay (A -> B -> C) | Member 1 | NET-05, DAT-05 | Device B retains incident after A disconnects; relays to C | Member 4 | P0 | High |
| **NET-07** | Firestore Cloud Sync Service | Member 1 & 3 | DAT-06 | Idempotent upload of outbox incidents to Firestore | Member 2 | P0 | Medium |

---

## 6. DURING EVENT — COMMAND DASHBOARD (H13 – H19)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DSH-01** | Desktop Dashboard Layout | Member 2 | FLD-01 | Split view: Incident Queue, Detail Panel, Map View | Member 4 | P0 | Medium |
| **DSH-02** | Leaflet Live Incident Map | Member 2 | DSH-01 | Map pins color-coded by priority (P0 red, P1 orange) | Member 4 | P0 | High |
| **DSH-03** | Map Offline Graceful Fallback | Member 2 | DSH-02 | If tile server unreachable, coordinates/list render cleanly | Member 4 | P1 | Medium |
| **DSH-04** | Priority & Status Filter Bar | Member 2 | DSH-01 | Filters: P0-P3, Reported, Synced, Verified, Resolved | Member 4 | P1 | Low |
| **DSH-05** | P0 High-Priority Alert Banner | Member 2 & 4 | DSH-01 | Visual banner on incoming P0 incident (non-blocking) | Member 1 | P0 | Low |
| **DSH-06** | Governance Controls | Member 2 | DSH-01, DAT-03 | Buttons to `Verify`, `Assign`, `Resolve` incidents | Member 3 | P0 | Medium |

---

## 7. DURING EVENT — QA & OPERATIONS (Continuous)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **QA-01**  | Form Validation Test Suite | Member 4 | FLD-05, DAT-01 | Verify invalid coordinates and blank fields are blocked | Member 2 & 3 | P0 | Low |
| **QA-02**  | Offline Persistence Test | Member 4 | FLD-05, DAT-03 | Kill tab after save -> reload -> incident verified intact | Member 3 | P0 | Low |
| **QA-03**  | Deduplication Stress Check | Member 4 | DAT-05 | Resend identical incident -> verify no duplicate created | Member 3 | P0 | Medium |
| **QA-04**  | Two-Device Relay Validation | Member 4 | NET-05 | Device A to Device B transfer with Wi-Fi disabled | Member 1 | P0 | Medium |
| **QA-05**  | Malformed Payload Injection | Member 4 | NET-05, DAT-01 | Corrupt JSON sent over socket -> app rejects without crash | Member 1 & 3 | P1 | Medium |
| **QA-06**  | Realistic Incident Seed Data | Member 4 | DAT-01 | Campus outage scenario: 5 incidents (medical, trapped, water) | Member 2 | P1 | Low |

---

## 8. FINAL INTEGRATION & SYSTEM HARDENING (H19 – H22)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **INT-01** | Full Branch Merge & Conflict Pass | Member 1 | FLD, DAT, NET, DSH | Clean compilation on `main` branch with 0 errors | Entire Team | P0 | High |
| **INT-02** | Status Truthfulness Audit | Member 1 & 4 | INT-01 | Confirm app never claims "Delivered" when only stored | Member 2 | P0 | Low |
| **INT-03** | Performance & Touch Audit | Member 2 & 4 | INT-01 | Confirm 60fps animations and accessible tap targets | Member 1 | P1 | Low |
| **INT-04** | Backup Video Capture | Member 4 | INT-01 | 60-second backup screen recording of A-B-C relay | Entire Team | P1 | Low |

---

## 9. FINAL DEMO & JURY PRESENTATION (H22 – H24)

| Task ID | Task Name | Owner | Prerequisite | Expected Output | Handoff Target | Priority | Estimated Difficulty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DMO-01** | Golden Demo Dry Run 1 | All Members | INT-01 | Complete 4-minute rehearsed run-through | Entire Team | P0 | Medium |
| **DMO-02** | Device Role Assignment Check | All Members | DMO-01 | Device A (Member 2), B (Member 4), C & Dash (Member 1) | Jury | P0 | Low |
| **DMO-03** | Individual Speaking Points Ready| All Members | TEAM_WORK_ASSIGNMENT | Each member delivers 60s pitch on their module | Jury | P0 | Low |
| **DMO-04** | Final Hackathon Submission | Member 1 | INT-01, DMO-01 | Code repository & AI prompt logs submitted on time | Organizers | P0 | Low |
