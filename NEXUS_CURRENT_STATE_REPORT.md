# NEXUS — Offline-First Emergency & Community Network
## Comprehensive Current-State Audit & Technical Architecture Report

> **Audit Date:** September 7, 2026  
> **Repository:** [https://github.com/PratikDas-VTU/NEXUS.git](https://github.com/PratikDas-VTU/NEXUS.git)  
> **Workspace Path:** `c:\Users\PRATIK DAS\OneDrive\Desktop\NEXUS`  
> **Project Type:** Web Application (React 19 + TypeScript + Vite) with Node.js LAN Signaling Backend and Browser WebRTC/IndexedDB Core  
> **Audit Status:** Complete Source & Architecture Audit (Zero-Code-Modification Phase)

---

## 1. Executive Summary

NEXUS was envisioned as an **offline-first emergency incident coordination and store-carry-forward relay system** to operate during blackout scenarios (power cuts, network blackouts, cellular collapse, natural disasters).

### The Reality of the Current Codebase
1. **Platform Reality:** Despite the project's long-term mobile emergency vision, **there is currently NO native Android codebase** (no Gradle files, no Kotlin or Java source, no `AndroidManifest.xml`, no Android Foreground Services, and no Android NDK/SDK native bindings). NEXUS is currently implemented as a **Node.js + React 19 + TypeScript browser web application (PWA-style)**. It is served locally via Vite and accessed via desktop and mobile web browsers (such as Android Chrome or mobile Safari) connected to a common local Wi-Fi router or phone Wi-Fi hotspot.
2. **Current Node-to-Node Transport:** NEXUS currently relies on **Local LAN WebSockets and WebRTC DataChannels (`RTCDataChannel`)**. Devices must be connected to the same local IP subnet (e.g., connected to the same Wi-Fi router or portable Wi-Fi hotspot) where a zero-dependency Node.js signaling server (`networking/signaler.js`) facilitates peer discovery and SDP/ICE candidate exchange. Once signaled, devices exchange data directly via peer-to-peer WebRTC DataChannels, or fall back to local WebSocket relaying through `signaler.js` if WebRTC fails (e.g., due to router AP client isolation).
3. **Absence of Native Phone Radios:** There is **NO implementation of Bluetooth Classic, Bluetooth Low Energy (BLE) Mesh, Wi-Fi Direct, Wi-Fi Aware (NAN), or Google Nearby Connections**. Mentions of "BLE 5.2 Mesh", "LoRa 868MHz", "433 MHz RF", and "AES-256 Mesh" in the UI are strictly **mock data, simulated labels, or UI toggles** that do not transmit actual radio packets.
4. **Relay & Mesh Logic Status:** An actual **6-stage Store-Carry-Forward relay protocol** (`HELLO` -> `MANIFEST` -> `REQUEST` -> `PAYLOAD` -> `ACK` + `PURGE`) is fully implemented in TypeScript (`networking/relayEngine.ts`) and backed by an IndexedDB storage engine (`backend/data/`). It implements deduplication, semantic versioning, hop count tracking (max 3 hops), priority queue sorting (P0 to P3), and TTL expiration (24 hours). This protocol works across simulated disconnections and multi-hop transfers (A -> B -> C).
5. **GPS / GNSS Reality:** Location capabilities rely entirely on the browser's standard W3C Geolocation API (`navigator.geolocation`). NEXUS retrieves latitude, longitude, accuracy in meters, and (where provided by hardware) altitude, speed, and heading. It persists the last-known fix to offline `localStorage` and provides manual coordinate input and campus landmark presets. However, **raw GNSS measurements, satellite constellation telemetry (GPS/GLONASS/Galileo/BeiDou), NMEA sentence parsing, and native geofencing are NOT present** because the browser sandbox does not expose them. Furthermore, on mobile Android Chrome, accessing the app over plain HTTP on a LAN IP causes the browser to block hardware GPS unless HTTPS is enabled (`npm run dev:https`) or Chrome security flags are overridden.
6. **Data Persistence:** Offline storage is implemented and verified using **Dexie.js v4.4.5 (IndexedDB)**. Incidents, outbox items, device identity, and sync state persist across browser reloads, network loss, and device restarts.

---

## 2. Repository Structure

The workspace is organized as a monorepo containing modular layers, pre-event planning blueprints, shared contracts, and tests:

```text
c:\Users\PRATIK DAS\OneDrive\Desktop\NEXUS\
├── package.json                   # Root monorepo manifest (scripts, workspaces, test configs)
├── package-lock.json              # Dependency lockfile
├── tsconfig.json                  # Root TypeScript configuration (ESNext, Node resolution)
├── vitest.config.ts               # Vitest runner configuration (fake-indexeddb environment)
├── README.md                      # Pre-event team charter & compliance notice
├── scripts/
│   └── dev.js                     # Unified dev runner (spawns signaler.js + Vite frontend)
├── shared/                        # Transport-independent frozen contracts & types
│   ├── types.ts                   # Canonical Incident envelope (12 fields), priority & status enums
│   ├── constants.ts               # MAX_HOPS (3), DEFAULT_TTL_MS (24h), priority weights, TTL checks
│   ├── protocol.ts                # RelayMessage wire envelopes (HELLO, MANIFEST, REQUEST, PAYLOAD, ACK, PURGE)
│   ├── interfaces.ts              # Inter-layer boundaries (IOfflineStorageAdapter, ITransport, INetworkRelayService)
│   └── index.ts                   # Barrel export
├── backend/
│   ├── data/                      # Offline Data Core (Dexie.js / IndexedDB)
│   │   ├── db.ts                  # NexusDatabase schema (incidents, outbox, peerCache, device, syncState)
│   │   ├── types.ts               # OutboxItem, DeviceRecord, SyncStateRecord, DedupResult
│   │   ├── schema.ts              # Runtime Zod validation schemas for Incident envelopes & drafts
│   │   ├── deviceId.ts            # Persistent UUIDv4 local device identity (Dexie + localStorage)
│   │   ├── priority.ts            # Deterministic P0-P3 queue sorting and suggestions
│   │   ├── ttl.ts                 # Expiration calculation, dual epoch/duration tolerance, hop budget
│   │   ├── dedup.ts               # Conflict resolution pipeline (NEW, UPDATE, DUPLICATE, STALE)
│   │   ├── incidentService.ts     # Incident CRUD, version incrementation, Dexie liveQuery subscriptions
│   │   ├── outboxService.ts       # Priority outbox queue, relay confirmation, cloud sync tracking
│   │   ├── adapter.ts             # OfflineStorageAdapter implementing IOfflineStorageAdapter
│   │   ├── index.ts               # Data core barrel export
│   │   └── __tests__/             # 9 Vitest test suites for database, dedup, TTL, schema, adapter
│   └── integration/
│       └── README.md              # Workstream documentation (no code pre-written in this subfolder)
├── networking/                    # Transport & Relay Engine
│   ├── signaler.js                # Zero-dependency Node.js HTTP & RFC 6455 WebSocket signaling server
│   ├── signalingClient.ts         # Browser & Node WebSocket client for signaling routing
│   ├── types.ts                   # Signaling messages (SIGNAL_JOIN, PEERS, OFFER, ANSWER, CANDIDATE, RELAY)
│   ├── webRtcTransport.ts         # WebRTC DataChannel transport implementing ITransport
│   ├── webSocketTransport.ts      # Local LAN WebSocket fallback transport implementing ITransport
│   ├── wsTransport.ts             # Alternative direct WebSocket transport implementation
│   ├── relayEngine.ts             # 6-stage store-carry-forward handshake state machine
│   ├── mockStorageAdapter.ts      # In-memory storage mock for isolated network testing
│   ├── index.ts                   # Networking barrel export
│   └── test/
│       ├── relay.test.ts          # Standalone Node test verifying 5 relay & multi-hop scenarios
│       └── signaler.test.ts       # Standalone Node test verifying signaling server routing
├── frontend/                      # User-Facing Web Application
│   ├── package.json               # Frontend dependencies (React 19, Leaflet, Tailwind, Lucide, GenAI)
│   ├── vite.config.ts             # Vite build & dev server config (port 3000, host 0.0.0.0, optional HTTPS)
│   ├── index.html                 # HTML entry point
│   ├── src/
│   │   ├── main.tsx               # React root entry point
│   │   ├── App.tsx                # Main view router (Field App vs Admin Login vs Admin Dashboard)
│   │   ├── types.ts               # Frontend view models (IncidentItem, MapBeacon, MeshPeer, DeviceProfile)
│   │   ├── index.css              # Tailwind CSS styles and theme variables
│   │   ├── context/
│   │   │   └── ServiceContext.tsx # Central provider wiring incidentService, networkService, GPS, permissions
│   │   ├── services/
│   │   │   ├── networkCoordinator.ts # WebRTC connection orchestrator, ICE buffer, fallback timer
│   │   │   ├── incidentMapper.ts     # Maps frozen Incident contract to UI IncidentItem view model
│   │   │   └── api/
│   │   │       ├── geolocation.ts    # navigator.geolocation wrapper, offline cache, campus fallback
│   │   │       ├── permissions.ts    # Truthful device readiness checks (GPS, storage, wakeLock, bluetooth)
│   │   │       ├── geminiService.ts  # Google Gemini 3.5 Flash Lite emergency triage & landmark geocoder
│   │   │       └── config.ts         # Signaling URL resolution and Leaflet tile provider configs
│   │   ├── components/
│   │   │   ├── FeedTab.tsx           # Incident feed, P0 broadcast card, filters, live GPS indicator
│   │   │   ├── MapTab.tsx            # Leaflet map, GPS marker, hop lines, offline turn-by-turn route
│   │   │   ├── NetworkTab.tsx        # Real signaling/peer telemetry card + simulated radar visualization
│   │   │   ├── DeviceTab.tsx         # Battery monitor, storage estimate, permission toggles, purge button
│   │   │   ├── EmergencyReportModal.tsx # 5-step incident wizard with GPS autofill & Gemini AI triage
│   │   │   ├── LocationPromptModal.tsx  # First-launch GPS onboarding & explanation modal
│   │   │   ├── TopBar.tsx            # Header with peer count, GPS pill, admin toggle
│   │   │   ├── BottomNav.tsx         # Tab switcher (Feed, Map, Network, Device)
│   │   │   ├── MobileFrame.tsx       # Responsive mobile wrapper frame
│   │   │   └── StitchDataModal.tsx   # Asset preview and mock data injection modal
│   │   ├── data/
│   │   │   └── mockData.ts           # Demo incidents, mock radar peers, initial device profile
│   │   └── admin/
│   │       ├── AdminDashboard.tsx    # Incident Commander dashboard with live stats & GIS map
│   │       ├── AdminHeader.tsx       # Admin header with status badges & logout
│   │       ├── AdminLoginView.tsx    # Pin authentication screen
│   │       ├── IncidentManager.tsx   # Incident management table, dispatch, resolve, purge
│   │       ├── NodeTelemetry.tsx     # Simulated repeater nodes (LoRa, BLE, RSSI)
│   │       ├── ResponderDirectory.tsx # Simulated emergency responder teams (433 MHz RF)
│   │       ├── mockAdminData.ts      # Reference data for nodes, teams, and audit logs
│   │       └── types.ts              # Admin data structures
├── tests/
│   ├── location_permissions.test.ts  # 15 Vitest tests for location caching, states, and permissions
│   └── integration/
│       └── e2eRelay.test.ts          # End-to-end multi-node relay tests (A -> B, A -> B -> C, Purge)
├── docs/                             # Documentation runbooks
└── NEXUS_PreEvent_Blueprint/         # Original 24-hour hackathon blueprints and UML diagrams
```

---

## 3. Current Architecture

The architecture currently implemented in the codebase is represented below:

```text
+-----------------------------------------------------------------------------------+
|                                 USER INTERACTION                                  |
|                                                                                   |
|   FIELD APP (Mobile-First)                 COMMAND HUB (Admin Dashboard)          |
|   - FeedTab: Live SOS Broadcast            - IncidentManager: Table & Dispatch    |
|   - MapTab: Leaflet GIS & Hops             - NodeTelemetry: Repeater Status       |
|   - NetworkTab: Signaling & Peers          - ResponderDirectory: Team Allocation  |
|   - DeviceTab: Hardware Status             - TacticalMap: Perimeter Monitoring    |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                        REACT SERVICE CONTEXT & COORDINATION                       |
|  (frontend/src/context/ServiceContext.tsx & networkCoordinator.ts)               |
|                                                                                   |
|  - Manages application lifecycle and reactive data propagation                    |
|  - Coordinates WebRTC RTCPeerConnections, RTCDataChannels, and ICE negotiation   |
|  - 3.5s Fallback Watchdog: Switches to WebSocketTransport if WebRTC fails        |
|  - Truthful Device Permissions Monitor (GPS, Storage Persistence, Wake Lock)     |
+---------------------+---------------------------------------+---------------------+
                      |                                       |
                      v                                       v
+---------------------------------------------+ +-----------------------------------+
|              OFFLINE DATA CORE              | |          NETWORKING LAYER         |
|  (backend/data/)                            | |  (networking/)                    |
|                                             | |                                   |
|  - NexusDatabase (Dexie.js / IndexedDB)     | |  - RelayEngine State Machine      |
|    Stores: incidents, outbox, peerCache,    | |    Handles 6-stage protocol:      |
|            device, syncState                | |    HELLO -> MANIFEST -> REQUEST   |
|  - Zod Runtime Validation (schema.ts)       | |          -> PAYLOAD -> ACK        |
|  - Deduplication Engine (dedup.ts)          | |  - Hop Budget Check (hops <= 3)   |
|    Rules: NEW, UPDATE, DUPLICATE, STALE     | |  - Expiration Check (TTL = 24h)   |
|  - Priority Queue Sorter (priority.ts)      | |  - SignalingClient (WebSocket)    |
|  - Monotonic Versioning & TTL Evaluator     | |                                   |
+---------------------+-----------------------+ +-----------------+-----------------+
                      |                                           |
                      +-------------------+-----------------------+
                                          | IOfflineStorageAdapter
                                          v
+-----------------------------------------------------------------------------------+
|                           TRANSPORTS & LOCAL INFRASTRUCTURE                       |
|                                                                                   |
|  1. Primary Local P2P Transport:                                                  |
|     - WebRtcTransport: Direct RTCDataChannel ('nexus-relay') over Local LAN       |
|                                                                                   |
|  2. Fallback Local Transport:                                                     |
|     - WebSocketTransport: Relays wire messages via local signaler on same subnet  |
|                                                                                   |
|  3. Local LAN Signaling Backend:                                                  |
|     - signaler.js: Pure Node.js HTTP/WebSocket server on port 8080 (0 dependencies)|
|     - Performs mDNS IPv4 candidate unmasking for Chrome LAN peer connections      |
|                                                                                   |
|  4. Hardware & Platform APIs:                                                     |
|     - W3C Geolocation API: Hardware GPS coordinates, accuracy, speed, heading     |
|     - W3C StorageManager: Persistent storage locking against disk eviction        |
|     - Screen Wake Lock API: Prevents screen timeout during field usage            |
|                                                                                   |
|  5. Optional Cloud Gateways (Online only):                                        |
|     - Google Gemini API (gemini-3.5-flash-lite) for AI triage & landmark parsing  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Feature Status Matrix

| Feature / Subsystem | Classification | Primary Code / File Location | Detailed Findings & Code Evidence |
| :--- | :--- | :--- | :--- |
| **Local Offline Storage** | **IMPLEMENTED & WORKING** | [`backend/data/db.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/db.ts), [`incidentService.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/incidentService.ts) | Uses Dexie.js (IndexedDB). 5 stores: `incidents`, `outbox`, `peerCache`, `device`, `syncState`. Full offline CRUD. Survives browser restart. Verified with 147 passing tests. |
| **Data Validation** | **IMPLEMENTED & WORKING** | [`backend/data/schema.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/schema.ts) | Strict runtime Zod schema enforcing full 12-field envelope (UUID, coordinates, epoch timestamps, enums). Rejects malformed inbound payloads before storage. |
| **Deduplication & Versioning** | **IMPLEMENTED & WORKING** | [`backend/data/dedup.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/dedup.ts) | Implements deterministic conflict resolution: `NEW` (stored), `UPDATE` (higher version overwrites), `DUPLICATE` (same version ignored), `STALE` (lower version rejected). |
| **Priority Queue Sorting** | **IMPLEMENTED & WORKING** | [`backend/data/priority.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/priority.ts) | P0 (Critical) > P1 (Urgent) > P2 (Resource) > P3 (Safety). Outbox queue sorts by Priority -> Recency -> Remaining TTL. |
| **TTL & Hop Count Budget** | **IMPLEMENTED & WORKING** | [`backend/data/ttl.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/ttl.ts), [`shared/constants.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/shared/constants.ts) | Default 24h TTL. Maximum 3 relay hops (`MAX_HOPS = 3`). Forwarding halts automatically if hops exceed 3 or TTL has expired. |
| **Store-Carry-Forward Protocol** | **IMPLEMENTED & WORKING** | [`networking/relayEngine.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/relayEngine.ts) | Full 6-stage handshake: `HELLO` -> `MANIFEST` -> `REQUEST` -> `PAYLOAD` -> `ACK`. Verified in headless multi-hop tests (A -> B -> C). |
| **Local WebRTC P2P DataChannel** | **IMPLEMENTED & WORKING** | [`networking/webRtcTransport.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/webRtcTransport.ts), [`networkCoordinator.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/networkCoordinator.ts) | Creates `RTCPeerConnection` with `nexus-relay` DataChannel between devices on the same LAN/hotspot. Tested and functioning on modern desktop & mobile browsers. |
| **Local Signaling Server** | **IMPLEMENTED & WORKING** | [`networking/signaler.js`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/signaler.js) | Zero-dependency Node.js HTTP/WebSocket server. Handles peer join/leave, SDP offer/answer forwarding, ICE candidates, and mDNS IPv4 candidate unmasking. |
| **Local WebSocket Fallback Transport** | **IMPLEMENTED & WORKING** | [`networking/webSocketTransport.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/webSocketTransport.ts) | Activates after 3.5s if WebRTC is blocked by venue router AP isolation. Passes identical wire envelopes over LAN WebSocket. |
| **Network-Wide Purge** | **IMPLEMENTED & WORKING** | [`networking/relayEngine.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/relayEngine.ts#L401), [`networkCoordinator.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/networkCoordinator.ts#L644) | 1-click network-wide wipe message (`PURGE` / `SIGNAL_PURGE_ALL`). Clears local and remote Dexie tables across all connected peers. |
| **Hardware GPS Location** | **IMPLEMENTED BUT NOT VERIFIED** | [`frontend/src/services/api/geolocation.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/geolocation.ts) | Uses `navigator.geolocation`. Obtains lat, lng, accuracy, altitude, speed, heading. Functions offline on real devices with hardware GPS, but subject to Chrome HTTPS origin policy. |
| **Offline Location Caching & Fallback** | **IMPLEMENTED & WORKING** | [`frontend/src/services/api/geolocation.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/geolocation.ts) | Last-known coordinates cached in `localStorage`. Clear `LIVE` vs `CACHED` vs `MANUAL` state tags. Campus landmark presets and manual coordinate inputs. |
| **Emergency SOS Creation (Field App)** | **IMPLEMENTED & WORKING** | [`frontend/src/components/EmergencyReportModal.tsx`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/components/EmergencyReportModal.tsx) | Form captures need type, priority, coordinates (GPS/manual), affected count, description. Validates and saves to Dexie and outbox. |
| **Interactive Leaflet Map** | **PARTIALLY IMPLEMENTED** | [`frontend/src/components/MapTab.tsx`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/components/MapTab.tsx) | Renders real incident markers, user position, accuracy circle, inter-node mesh lines, and navigation line. However, **map tiles require internet or browser cache**; offline renders on blank tactical grid. |
| **Screen Wake Lock** | **IMPLEMENTED & WORKING** | [`frontend/src/services/api/permissions.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/permissions.ts#L183) | Uses Screen Wake Lock API (`navigator.wakeLock`) to keep display awake during field emergency operations. |
| **Persistent Storage Request** | **IMPLEMENTED & WORKING** | [`frontend/src/services/api/permissions.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/permissions.ts#L169) | Calls `navigator.storage.persist()` to lock IndexedDB against browser eviction during low disk scenarios. |
| **Gemini AI Emergency Triage** | **IMPLEMENTED & WORKING** | [`frontend/src/services/api/geminiService.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/geminiService.ts) | Online-only feature calling Google Gemini 3.5 Flash Lite to classify emergency text and geocode landmarks. Gracefully bypassed when offline. |
| **Admin Command Hub** | **PARTIALLY IMPLEMENTED** | [`frontend/src/admin/AdminDashboard.tsx`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/admin/AdminDashboard.tsx) | Real incident management (resolving, broadcasting, purging) reading directly from Dexie. However, Node Telemetry (LoRa) and Responder Directory (433MHz RF) are **mock datasets**. |
| **Offline QR Vault Export** | **SCAFFOLDED / PLACEHOLDER** | [`frontend/src/components/DeviceTab.tsx`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/components/DeviceTab.tsx#L738) | Renders a hardcoded SVG QR illustration. There is **no QR encoder generating actual vault data and no camera scanner**. |
| **Web Bluetooth Test** | **SCAFFOLDED / PLACEHOLDER** | [`frontend/src/services/api/permissions.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/permissions.ts#L222) | Prompts browser Bluetooth device picker via `navigator.bluetooth.requestDevice()`. Does NOT connect, pair, or transfer packets. |
| **Bluetooth Classic** | **NOT PRESENT** | N/A | No RFCOMM, L2CAP, or native serial sockets. |
| **BLE Mesh** | **NOT PRESENT** | N/A | No BLE advertising, scanning, GATT server, or mesh profile. References in UI are mock strings. |
| **Wi-Fi Direct** | **NOT PRESENT** | N/A | No P2P group owner negotiation or Wi-Fi Direct socket. References in UI are mock strings. |
| **Wi-Fi Aware (NAN)** | **NOT PRESENT** | N/A | Zero code or references. |
| **Nearby Connections** | **NOT PRESENT** | N/A | No Google Play Services Nearby Connections API. |
| **AES-256 Encryption** | **NOT PRESENT** | N/A | Plaintext JSON over WebRTC/WebSocket. "AES-256" references in UI modals and logs are mock text. |
| **Native Android Project** | **NOT PRESENT** | N/A | No Gradle, Java, Kotlin, AndroidManifest, or foreground services. |

---

## 5. Communication Technology Audit

### 1. Bluetooth / Bluetooth Classic
* **Implementation Location:** None.
* **APIs / Libraries:** None.
* **Findings:** No Bluetooth Classic socket (RFCOMM/SPP) implementation exists anywhere in the repository.

### 2. Bluetooth Low Energy (BLE)
* **Implementation Location:** Experimental stub in [`frontend/src/services/api/permissions.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/permissions.ts#L222-L262).
* **APIs / Libraries:** Web Bluetooth API (`navigator.bluetooth.requestDevice()`).
* **Connection & Data Transfer:** Does **NOT** establish a connection and does **NOT** transfer any data. It simply opens the browser's native device selection modal to test if the browser supports Web Bluetooth.
* **Offline Capability:** Web Bluetooth requires a user gesture and an HTTPS secure context. It cannot advertise as a peripheral in standard browsers and cannot form a BLE mesh network.
* **Simulated Mentions:** In [`frontend/src/components/NetworkTab.tsx`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/components/NetworkTab.tsx#L57), clicking a simulated peer outputs `Pinging ... via BLE mesh`. In [`mockAdminData.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/admin/mockAdminData.ts#L42), nodes list `protocol: 'BLE 5.2 Mesh'`. These are **purely mock labels**.

### 3. Wi-Fi Direct
* **Implementation Location:** None.
* **APIs / Libraries:** None.
* **Findings:** Wi-Fi Direct (P2P Wi-Fi) requires native OS APIs (such as Android's `WifiP2pManager`). Browser environments cannot access Wi-Fi Direct APIs. Mentioned only as a toggle switch in [`DeviceTab.tsx`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/components/DeviceTab.tsx#L121) and in mock telemetry strings.

### 4. Wi-Fi Aware (Neighbor Awareness Networking - NAN)
* **Implementation Location:** None.
* **APIs / Libraries:** None.
* **Findings:** Completely absent from the codebase.

### 5. Local Wi-Fi / LAN
* **Implementation Location:** [`networking/signaler.js`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/signaler.js), [`frontend/src/services/networkCoordinator.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/networkCoordinator.ts).
* **APIs / Libraries:** Node.js `node:http`, `node:crypto`, browser `WebSocket`.
* **Connection & Data Transfer:** **IMPLEMENTED & WORKING**. Devices connect to the same Wi-Fi access point or a phone's mobile Wi-Fi hotspot. The local Node.js signaling server listens on `0.0.0.0:8080`. Phones on the hotspot connect to `ws://<host-ip>:8080`.
* **Offline Capable:** **YES**. Operates with **zero internet access**. The router or hotspot does not require a cellular uplink or WAN connection; it only provides local IPv4 routing.

### 6. Nearby Connections (Google Play Services)
* **Implementation Location:** None.
* **APIs / Libraries:** None.
* **Findings:** Completely absent.

### 7. WebRTC (Web Real-Time Communication)
* **Implementation Location:** [`networking/webRtcTransport.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/webRtcTransport.ts), [`frontend/src/services/networkCoordinator.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/networkCoordinator.ts).
* **APIs / Libraries:** Standard W3C `RTCPeerConnection`, `RTCDataChannel`.
* **Connection & Data Transfer:** **IMPLEMENTED & WORKING**.
  * Offerer creates an `RTCDataChannel` labeled `nexus-relay`.
  * Local signaling server exchanges SDP offers, answers, and ICE host candidates.
  * `signaler.js` includes a specialized mDNS unmasking routine ([`signaler.js:L142-L148`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/signaler.js#L142-L148)) that replaces `.local` mDNS hostnames generated by Chrome with actual LAN IPv4 addresses, allowing peer connections to establish over local Wi-Fi without STUN or TURN servers.
  * Incidents and handshake packets are serialized as JSON and transmitted directly through `dataChannel.send()`.
* **Offline Capable:** **YES**. Host ICE candidates connect directly between device IP addresses on the local network.
* **Topology:** Supports multi-peer 1-to-1 meshes (each device establishes a WebRTC connection with other discovered peers on the LAN).

### 8. TCP / UDP / Sockets
* **WebSockets:** **IMPLEMENTED & WORKING** via RFC 6455 frame parser in [`networking/signaler.js`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/signaler.js#L70-L140) and [`webSocketTransport.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/webSocketTransport.ts).
* **Raw TCP / UDP:** **NOT PRESENT** (not accessible within standard browser JavaScript).

---

## 6. Node-to-Node Capability Audit

### Can two devices communicate right now?
**YES.** Two devices can communicate if they are connected to the same local Wi-Fi network or mobile hotspot where the NEXUS signaling server (`signaler.js`) is running.

### How do they discover each other?
1. Device A and Device B open the NEXUS web application in their browsers.
2. Both devices connect to `ws://<signaler-ip>:8080`.
3. Each device immediately sends a `SIGNAL_JOIN` packet containing its persistent `peerId` and `deviceId`.
4. The signaling server registers them in an in-memory map and broadcasts `SIGNAL_PEER_JOINED` to existing peers and sends `SIGNAL_PEERS` (the active peer list) to the newcomer.

### How is the connection established?
1. [`networkCoordinator.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/networkCoordinator.ts#L231-L240) uses a deterministic tie-breaker (`deviceIdA < deviceIdB`) so only one node initiates the WebRTC offer.
2. The initiator creates an `RTCPeerConnection`, adds an `RTCDataChannel('nexus-relay')`, creates an SDP offer, and sends it via the signaling server.
3. The callee receives the offer, creates an SDP answer, and sends it back.
4. ICE host candidates are exchanged. `signaler.js` unmasks any Chrome mDNS `.local` hostnames with the sender's real IPv4 address.
5. The `RTCDataChannel` opens.
6. If the DataChannel fails to open within 3.5 seconds (e.g. router AP isolation), a fallback timer automatically activates [`WebSocketTransport`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/networkCoordinator.ts#L259-L275), relaying the packets through the local signaling server.

### Is data transferred?
**YES.** Once the transport (WebRTC DataChannel or WebSocket fallback) opens, [`RelayEngine`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/relayEngine.ts) automatically triggers the 6-stage handshake:
1. Stage 1: `HELLO` exchanged to identify device capabilities.
2. Stage 2: `MANIFEST` exchanged (list of known `incidentId` and `version` records).
3. Stage 3/4: Receiving peer compares remote manifest with local Dexie store and sends `REQUEST` for missing or newer version IDs.
4. Stage 5: Sender reads incidents from Dexie, increments `hopCount`, and transmits `PAYLOAD`.
5. Stage 6: Receiver validates Zod schema, checks TTL and hop budget, commits to Dexie, and replies with `ACK`.

### Is it offline?
**YES.** It functions completely without cellular network, internet uplink, or external cloud infrastructure. However, it requires a local RF link (Wi-Fi router or hotspot) carrying IP packets.

### Does multi-node communication exist?
**YES.** The signaling server supports multiple peers simultaneously. Each peer maintains distinct `RTCPeerConnection` instances with each other peer.

### Does multi-hop relay exist?
**YES.** Multi-hop store-and-forward is implemented in [`networking/relayEngine.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/relayEngine.ts#L236-L264):
* When Node A sends an incident to Node B, Node B stores it in its local Dexie database and outbox, incrementing `hopCount` from 0 to 1.
* If Node A disconnects and Node B later encounters Node C, Node B advertises the incident in its `MANIFEST`. Node C requests it. Node B increments `hopCount` to 2 and sends `PAYLOAD` to Node C.
* If `hopCount >= 3` (`MAX_HOPS`), [`isEligibleForForwarding()`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/shared/constants.ts#L95-L103) halts forwarding.
* This multi-hop behavior is verified in automated end-to-end tests ([`tests/integration/e2eRelay.test.ts:L171-L228`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/tests/integration/e2eRelay.test.ts#L171-L228)).

---

## 7. NEXUS Protocol Audit

| Protocol Aspect | Implemented Status | Code Location | Mechanism & Details |
| :--- | :--- | :--- | :--- |
| **Node Identity** | **IMPLEMENTED** | [`backend/data/deviceId.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/deviceId.ts) | Generates UUIDv4 stored in Dexie `device` singleton table (`id: 'local'`) and mirrored in `localStorage`. Preserved across restarts. Supports `?node=A` URL parameter for testing. |
| **Message IDs** | **IMPLEMENTED** | [`shared/protocol.ts:L126`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/shared/protocol.ts#L126) | `generateMessageId()` generates `msg_${Date.now()}_${random}` attached to every wire envelope. |
| **Incident IDs** | **IMPLEMENTED** | [`backend/data/incidentService.ts:L64`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/incidentService.ts#L64) | Standard UUIDv4 assigned on creation. Primary key in database. |
| **Packet Structure** | **IMPLEMENTED** | [`shared/protocol.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/shared/protocol.ts) | Discriminated union of 8 envelopes: `HELLO`, `MANIFEST`, `MISSING`, `REQUEST`, `PAYLOAD`, `ACK`, `FORWARD`, `PURGE`. All share `type`, `messageId`, `senderDeviceId`, `timestamp`, `protocolVersion`. |
| **TTL (Time-To-Live)** | **IMPLEMENTED** | [`backend/data/ttl.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/ttl.ts), [`shared/constants.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/shared/constants.ts) | Default 24 hours (`86,400,000 ms`). Dual-mode tolerance handles relative durations and absolute epoch timestamps. Expired items are excluded from manifest and rejected on receipt with code `TTL_EXPIRED`. |
| **Hop Budget** | **IMPLEMENTED** | [`shared/constants.ts:L12`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/shared/constants.ts#L12), [`backend/data/ttl.ts:L64`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/ttl.ts#L64) | Initialized to 0. Incremented by 1 upon forwarding. Capped at `MAX_HOPS = 3`. Packets exceeding 3 hops are dropped with `HOP_BUDGET_EXCEEDED`. |
| **Deduplication** | **IMPLEMENTED** | [`backend/data/dedup.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/dedup.ts) | Evaluates incoming `incidentId` and integer `version`. If already present with same or lower version, rejected with `STALE_VERSION`. If version is higher, accepted and overwritten. |
| **Store-and-Forward** | **IMPLEMENTED** | [`networking/relayEngine.ts:L236-L312`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/relayEngine.ts#L236-L312) | Golden rule enforced: Validate schema -> Check TTL & Hops -> Store locally in Dexie -> Send ACK -> Queue in Outbox for future relay. |
| **Routing Algorithm** | **PARTIALLY IMPLEMENTED** | [`networking/relayEngine.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/relayEngine.ts) | **Epidemic / Manifest Reconciliation Routing**. Nodes exchange inventory manifests and pull missing records. There is **no link-state, distance-vector, geographic (greedy forwarding), or Dijkstra routing**. |
| **Acknowledgements** | **IMPLEMENTED** | [`shared/protocol.ts:L91`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/shared/protocol.ts#L91), [`relayEngine.ts:L307`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/relayEngine.ts#L307) | `ACK` message returns `acceptedIncidentIds` and array of `rejectedItems` with specific protocol error codes (`STALE_VERSION`, `TTL_EXPIRED`, `HOP_BUDGET_EXCEEDED`, `MALFORMED_SCHEMA`). |
| **Priority Handling** | **IMPLEMENTED** | [`backend/data/priority.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/priority.ts) | Numeric weights: P0=0, P1=1, P2=2, P3=3. Outbox queue sorts items by Priority ascending, then timestamp descending, then remaining TTL ascending. |
| **Offline Outbox Queue** | **IMPLEMENTED** | [`backend/data/outboxService.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/backend/data/outboxService.ts) | Dexie `outbox` table tracks status: `pending_relay` -> `relayed` -> `pending_sync` -> `synced`. Outbox count exposed reactively to UI. |

---

## 8. GPS / GNSS Capability Audit

| Capability | Status | Detailed Findings |
| :--- | :--- | :--- |
| **Latitude & Longitude** | **IMPLEMENTED & WORKING** | Retrieved via `navigator.geolocation.getCurrentPosition()` and `watchPosition()`. Formatted in UI and attached to every incident record. |
| **Accuracy (Horizontal)** | **IMPLEMENTED & WORKING** | Extracted from `position.coords.accuracy` in meters. Displayed in UI as `(±Xm)`. Used in `MapTab.tsx` to render a blue accuracy radius circle. |
| **Altitude** | **DISPLAYED / CAPTURED** | Captured from `position.coords.altitude` in `geolocation.ts:L194`. Can be null if hardware/browser does not supply vertical fix. Not utilized for 3D elevation routing. |
| **Speed & Heading** | **DISPLAYED / CAPTURED** | Captured from `position.coords.speed` and `heading` in `geolocation.ts:L195-L196`. Null when stationary or unsupported. |
| **Timestamps** | **IMPLEMENTED & WORKING** | Captured from `position.timestamp` (epoch milliseconds). |
| **Satellite Count / Constellation Telemetry** | **NOT PRESENT** | The W3C Geolocation API does not expose satellite counts, PRN numbers, SNR/CNo ratios, or satellite constellations (GPS, GLONASS, Galileo, BeiDou). |
| **GNSS Status & NMEA Sentences** | **NOT PRESENT** | Browser sandbox has no access to raw NMEA streams (`$GPGGA`, `$GPRMC`) or Android `GnssStatus.Callback`. |
| **Raw GNSS Measurements** | **NOT PRESENT** | No carrier phase, pseudorange, or Doppler measurements. |
| **Geofencing** | **NOT PRESENT** | No geofence monitoring, polygon bounds checking, or proximity trigger engine exists. |
| **Movement Tracking** | **PARTIALLY IMPLEMENTED** | `watchUserPosition()` continuously updates the current position in memory as the device moves. |
| **Location History / Breadcrumbs** | **NOT PRESENT** | Historical positions are discarded; only the single latest coordinate is retained in `localStorage`. |
| **Offline Location Acquisition** | **IMPLEMENTED BUT RESTRICTED** | Hardware GPS chip in a mobile phone acquires satellite fixes offline without cellular/internet. However, **browser security policies block GPS over plain HTTP on LAN IPs** (e.g. `http://192.168.1.5:3000`). To unlock offline GPS in mobile Chrome, the user must run `--https` or enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure`. |
| **Offline Map Data (Tiles)** | **PARTIALLY IMPLEMENTED** | Leaflet renders markers, accuracy circles, and vector lines offline. However, **raster tile imagery is loaded over HTTP from Esri/OSM**. When offline, tile requests fail unless pre-cached in the browser's HTTP cache. |
| **Campus Fallback Coordinates** | **IMPLEMENTED & WORKING** | When GPS is unavailable, [`geolocation.ts:L87-L114`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/frontend/src/services/api/geolocation.ts#L87-L114) provides deterministic fallback coordinates around the Amrita Vengal Campus (13.2384, 80.0094) jittered pseudo-randomly per device ID so devices do not overlap. |

---

## 9. Emergency System Audit

### SOS & Incident Life Cycle
The complete emergency data flow from user action to peer storage was traced:
1. **User Action:** User taps "BROADCAST EMERGENCY" in `FeedTab.tsx` or opens `EmergencyReportModal.tsx`.
2. **Draft Composition:** User selects category (`medical`, `rescue`, `water`, `food`, `shelter`, `safety`), priority (`P0`, `P1`, `P2`), and people affected.
3. **Location Attachment:** The form auto-populates coordinates from live GPS (`LIVE`), last-known cache (`CACHED`), campus landmark presets, or manual typing (`MANUAL`).
4. **Validation:** Draft is validated against `draftIncidentSchema` in `schema.ts`.
5. **Enrichment:** `incidentService.createIncident()` assigns:
   * UUIDv4 `incidentId`
   * Persistent `originDeviceId`
   * Creation epoch `timestamp`
   * Initial `version: 1`
   * Initial `hopCount: 0`
   * `ttl: timestamp + 86400000` (24 hours)
   * `status: 'stored'` then updated to `'queued'`
6. **Local Persistence:** Incident is saved into the Dexie `incidents` table and an entry is created in the `outbox` table (`status: 'pending_relay'`).
7. **Transport Dispatch:** The database storage listener triggers `RelayEngine`. For each active peer, `RelayEngine` sends a `MANIFEST` message.
8. **Peer Ingestion:** The remote peer receives `MANIFEST`, identifies the new `incidentId`, sends a `REQUEST`, receives the `PAYLOAD`, validates the Zod schema, checks TTL and hops, commits to its own Dexie database, and returns an `ACK`.
9. **UI Reactivity:** On both nodes, Dexie `liveQuery` subscriptions trigger immediately, rendering the new incident on the Feed and Map.

### Community & Responder Workflows
* **Citizen / Field Mode:** Citizens can broadcast distress reports and view active incidents within their perimeter.
* **Responder Assignment:** In `FeedTab.tsx`, clicking "Respond" toggles status to `assigned` ("Assigned (En Route)"), incrementing the incident version.
* **Incident Resolution:** In `AdminDashboard.tsx`, clicking "Resolve" marks status as `resolved`, halting further peer forwarding.
* **Escalation & Rescue Coordination:** The Admin dashboard displays responder teams ("Alpha Medic 1", "Vengal Perimeter Patrol") and radio frequencies ("433.150 MHz"), but these teams and frequencies are **hardcoded mock records** in `mockAdminData.ts`. Clicking "Dispatch" only displays a toast notification.

---

## 10. Offline Capability Assessment

> **"If the internet and cellular network completely disappear right now, what parts of NEXUS continue to work?"**

### WHAT CONTINUES TO WORK:
1. **Local Node Boot & UI:** The web application loads and functions (if served from local dev server or installed as PWA cache).
2. **Local Incident Creation & Persistence:** Users can create incidents with full P0-P3 metadata. All records persist reliably in Dexie (IndexedDB) and survive browser/device restarts.
3. **Hardware GPS Geotagging:** Satellite GPS coordinates continue to acquire on devices with hardware GPS chips (provided HTTPS or Chrome flag is active). Manual coordinate entry and landmark presets remain 100% operational.
4. **Peer Discovery on Local Wi-Fi / Hotspot:** Multiple devices connected to a portable battery-powered Wi-Fi router or mobile hotspot discover each other via the local Node.js signaling server.
5. **Direct Node-to-Node Data Transfer:** Direct peer-to-peer WebRTC DataChannels and local WebSocket fallback connections transmit incident packets between real devices.
6. **Multi-Hop Relay:** Store-Carry-Forward propagation (A -> B -> C) functions completely offline.
7. **Deduplication, Versioning, TTL, and Priority:** All core protocol logic operates inside client-side TypeScript without cloud dependencies.
8. **Vector Map Tactical Displays:** Incident markers, user position indicator, accuracy circles, inter-node mesh lines, and navigation vectors continue to render on Leaflet's tactical canvas.
9. **Network-Wide Purge:** 1-click purge broadcast wipes test data across all connected mesh devices without internet.

### WHAT STOPS WORKING / FAILS:
1. **Gemini AI Auto-Triage:** Calls to `generativelanguage.googleapis.com` fail. The application displays an offline notice and falls back to manual classification.
2. **Leaflet Raster Map Tiles:** Leaflet cannot download new map tile images from Esri or OpenStreetMap servers. The map renders markers and vector lines over a dark/empty background unless tiles were previously cached in the browser.
3. **Cloud Central Command Sync:** Syncing outbox items to central cloud Firestore/servers cannot execute until an internet uplink returns.
4. **Connectivity Without Local Wi-Fi / Hotspot:** If no Wi-Fi access point or hotspot is available, **devices cannot discover each other or communicate**, because browser-based WebRTC requires an IP network and signaling mechanism. There is no ad-hoc BLE mesh or Wi-Fi Direct to bridge phones without a common access point.

---

## 11. Real Device Testing Status

| Testing Category | Status | Evidence & Test Details |
| :--- | :--- | :--- |
| **Unit & Schema Tests** | **VERIFIED (Automated)** | 147 automated Vitest unit tests pass in 1.52s ([`vitest.config.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/vitest.config.ts)). Covers Zod schemas, priority sorting, TTL calculation, version dedup, outbox queues, and Dexie storage. |
| **In-Memory Multi-Hop Relay** | **VERIFIED (Automated)** | [`networking/test/relay.test.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/test/relay.test.ts) and [`tests/integration/e2eRelay.test.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/tests/integration/e2eRelay.test.ts) verify A -> B transfer, A -> B -> C relay, version updates, hop budget drop (at 3 hops), and TTL expiration in Node. |
| **Signaling Server Routing** | **VERIFIED (Automated)** | [`networking/test/signaler.test.ts`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/networking/test/signaler.test.ts) spawns `signaler.js`, tests HTTP `/status` endpoint, WebSocket client join, peer list broadcast, OFFER forwarding, and SIGNAL_RELAY. |
| **Multi-Device WebRTC over LAN** | **VERIFIED (Manual/Dev)** | Commit history (`feat(mesh): working multi-phone WebRTC mesh...`, `fix(gps): auto-hydrate campus position...`) documents multi-phone testing over local Wi-Fi router. The signaling server logs mDNS unmasking for Chrome mobile clients. |
| **Bluetooth / BLE Mesh** | **UNVERIFIED / UNTESTED** | Never demonstrated on real devices. No BLE packet transmission code exists. |
| **Wi-Fi Direct / Wi-Fi Aware** | **UNVERIFIED / UNTESTED** | Never demonstrated. No native Wi-Fi Direct code exists. |
| **LoRa / Radio Frequencies** | **UNVERIFIED / UNTESTED** | Telemetry in Admin dashboard is purely simulated reference data. |

---

## 12. Dependencies & Platform Requirements

### Current Web & Node Environment
* **Runtime:** Node.js v22.x or higher (utilizing native `fetch`, `WebSocket`, and `--experimental-strip-types`).
* **Package Manager:** npm workspaces (`nexus` root + `frontend` workspace).
* **Core Production Dependencies:**
  * `dexie` (`^4.4.5`): IndexedDB client-side database wrapper.
  * `dexie-react-hooks` (`^4.4.0`): Reactive `useLiveQuery` hooks.
  * `zod` (`^4.5.4`): Runtime schema validation.
  * `uuid` (`^14.0.2`): RFC 4122 UUID generator.
  * `react` / `react-dom` (`^19.0.1`): UI component rendering.
  * `leaflet` (`^1.9.4`): GIS interactive mapping.
  * `lucide-react` (`^0.546.0`): UI iconography.
  * `@google/genai` (`^2.4.0`): Google Gemini generative AI SDK.
* **Required Browser Capabilities & Permissions:**
  * `Geolocation API`: GPS coordinates (`navigator.geolocation`).
  * `IndexedDB`: Local persistent vault.
  * `WebSockets`: LAN signaling connection (`ws://` or `wss://`).
  * `WebRTC`: Peer-to-peer data channels (`RTCPeerConnection`, `RTCDataChannel`).
  * `StorageManager`: Storage persistence (`navigator.storage.persist()`).
  * `Screen Wake Lock`: Display sleep prevention (`navigator.wakeLock`).
  * `Notifications`: Push notification permission (`Notification.requestPermission()`).

### Native Android Comparison (What Would Be Required for Native APK)
If NEXUS is to be ported to a true native Android application:
* **Android Minimum SDK:** API 26 (Android 8.0) or API 24 (Android 7.0). Recommended Target SDK: API 34/35 (Android 14/15).
* **Required Android Permissions:**
  * Location: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`.
  * Bluetooth: `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT` (Android 12+), `BLUETOOTH`, `BLUETOOTH_ADMIN` (Android 11-).
  * Wi-Fi Direct / Local: `NEARBY_WIFI_DEVICES` (Android 13+), `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE`.
  * Services & Battery: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
  * Notifications: `POST_NOTIFICATIONS` (Android 13+).
* **Foreground Service Architecture:** Android's Doze Mode and App Standby aggressively kill background sockets, BLE scans, and Wi-Fi Direct connections after a few minutes of screen lock. A continuous native `ForegroundService` with a persistent notification is required to sustain an offline mesh when the phone is in a user's pocket.

---

## 13. Known Problems / Technical Risks

1. **Dependency on Common Wi-Fi/Hotspot Infrastructure:** WebRTC currently requires all participating phones to be connected to the same Wi-Fi access point or hotspot. In a true disaster where no router is powered, a user must manually configure a phone as a portable Wi-Fi hotspot and have other survivors connect to it. True infrastructure-less peer-to-peer (phone-to-phone without any access point) is not supported by WebRTC in web browsers.
2. **Chromium Insecure Origin GPS Restriction:** Google Chrome blocks `navigator.geolocation` on plain HTTP URLs over LAN IPs (e.g. `http://192.168.43.1:3000`). If survivors connect to a hotspot and browse via HTTP, hardware GPS is blocked unless served via HTTPS with a trusted certificate or configured in `chrome://flags`.
3. **Lack of Background Operation in Web Browsers:** When mobile Chrome or Safari is minimized or the screen turns off, the browser throttles or suspends JavaScript timers, WebSockets, and WebRTC channels. The web app cannot act as an autonomous background relay node while carried in a pocket.
4. **Signaling Server Single Point of Failure:** While data transfer is peer-to-peer via WebRTC, peer discovery and connection setup depend on `signaler.js`. If the node running the signaling server goes offline, new peers cannot discover each other or establish new WebRTC DataChannels (existing open DataChannels may persist).
5. **No Offline Map Tile Caching:** Leaflet attempts to fetch raster tiles from online servers. In a total internet outage, users see markers and routes on a blank gray/black grid unless tile packages (e.g. MBTiles, vector tiles, or pre-cached raster blobs) are bundled into IndexedDB.
6. **Lack of Encryption:** Wire packets and local IndexedDB records are stored and transmitted in plaintext JSON. There is no cryptographic signing of incidents, no public-key node authentication, and no end-to-end encryption.
7. **Simulated UI vs Reality Discrepancy:** The UI contains references and toggles for "BLE 5.2 Mesh", "Wi-Fi Direct", "LoRa 868MHz", "AES-256 Mesh Local", and an SVG QR code scanner that does not scan. This could mislead users or evaluators if not clearly identified as simulated.

---

## 14. Missing Pieces

Functionality required by the long-term NEXUS vision that does not yet exist in the codebase:

1. **Native Offline RF Transports:**
   * Direct Bluetooth Low Energy (BLE) advertising, scanning, and GATT-based mesh transport.
   * Wi-Fi Direct (P2P Group Owner / Client) automated discovery and socket negotiation.
   * Wi-Fi Aware (NAN) publish/subscribe data path.
   * Google Nearby Connections API integration.
2. **Autonomous Background Node Operation:**
   * Android native `ForegroundService` and background execution pipeline to keep relaying packets while the phone is locked.
3. **True Ad-Hoc Discovery (Zero Hotspot Requirement):**
   * Ability for two phones to walk past each other on a street with no pre-existing Wi-Fi connection and exchange packets opportunistically.
4. **Offline Cartography:**
   * Embedded offline vector tile database (e.g. PMTiles, MBTiles, or Protobuf vector tiles stored in IndexedDB/SQLite) for complete offline topographic and street map rendering.
5. **Raw GNSS Telemetry & Offline Location Intelligence:**
   * Native GNSS API integration extracting satellite constellations, PRN numbers, signal-to-noise ratio (SNR), DOP (dilution of precision), multipath detection, and hardware dead reckoning (accelerometer/gyroscope step integration).
   * Geographic geofencing and location-aware store-and-forward routing (e.g. geocast: relaying incidents only to nodes heading toward the disaster zone).
6. **Cryptographic Identity & Security:**
   * Asymmetric key pair generation per node (e.g. Ed25519).
   * Cryptographic signatures on emergency incidents to prevent spoofing, tampering, or malicious spam in an open mesh.
   * Optional end-to-end payload encryption for sensitive community reports.
7. **Working Camera QR Code Scanner & Generator:**
   * Dynamic QR code generation containing compressed binary incident bundles (e.g. CBOR / MessagePack / gzip).
   * Camera-based QR code scanner to import emergency bundles optical-airgap style.

---

## 15. Current vs Intended Architecture

### CURRENT ARCHITECTURE (As Built in Repository)

```text
+---------------------------------------------------------------------------------+
|                              REACT 19 FRONTEND                                  |
|   - Field App Tabs (Feed, Map, Network, Device)                                 |
|   - Disaster Command Hub (AdminDashboard, IncidentManager, Telemetry)          |
+---------------------------------------+-----------------------------------------+
                                        |
                                        v
+---------------------------------------------------------------------------------+
|                        REACT CONTEXT & COORDINATION                             |
|   - ServiceContext.tsx (Central provider & Dexie liveQuery hooks)               |
|   - NetworkCoordinator.ts (WebRTC session management, ICE unmasking, fallback) |
+-----------------------+---------------------------------+-----------------------+
                        |                                 |
                        v                                 v
+-----------------------------------------------+ +-------------------------------+
|               OFFLINE DATA CORE               | |       NETWORKING ENGINE       |
|  - Dexie.js (IndexedDB: incidents, outbox,    | |  - RelayEngine (TypeScript)   |
|    device, peerCache, syncState)              | |    6-Stage Handshake Protocol |
|  - Zod Schemas & Validation                   | |    (HELLO -> MANIFEST ->      |
|  - Dedup Engine (v1 -> v2 versioning)         | |     REQUEST -> PAYLOAD -> ACK)|
|  - Priority Queue (P0 - P3)                   | |  - TTL (24h) & Max Hops (3)   |
+-----------------------+-----------------------+ +---------------+---------------+
                        |                                         |
                        +-------------------+---------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------+
|                         LOCAL SUBNET TRANSPORT & APIS                           |
|                                                                                 |
|   Local Wi-Fi Router or Portable Mobile Hotspot (LAN IPv4 Subnet)               |
|   ├── Central Node.js Signaler: signaler.js (WebSocket on port 8080)            |
|   ├── WebRtcTransport: Direct P2P DataChannels between browser instances        |
|   └── WebSocketTransport: Fallback relay via signaler.js                        |
|                                                                                 |
|   Browser Sandbox APIs:                                                         |
|   ├── W3C Geolocation: Hardware GPS coordinates, accuracy                      |
|   ├── W3C StorageManager: Persistent storage locking                            |
|   └── Screen WakeLock: Display sleep prevention                                 |
+---------------------------------------------------------------------------------+
```

---

### INTENDED / POSSIBLE FUTURE ARCHITECTURE (Multi-Transport Native Mesh)

```text
+---------------------------------------------------------------------------------+
|                           NEXUS UNIFIED APPLICATION                             |
|   - Mobile Field Responder App (Android / Cross-Platform)                       |
|   - Command & Control Tactical Dashboard                                        |
+---------------------------------------+-----------------------------------------+
                                        |
                                        v
+---------------------------------------------------------------------------------+
|                   NEXUS ROUTING & STORE-FORWARD CONTROLLER                      |
|   - Content-Centric Packet Router & Opportunistic Delay-Tolerant Network (DTN)  |
|   - Geographic & Directional Routing Engine (GNSS Heading/Velocity Aware)      |
|   - Asymmetric Cryptographic Identity (Ed25519 Signatures & Mutual Auth)       |
|   - Deduplication, Monotonic Versioning, Multi-Hop (TTL / Hop Budget Control)   |
|   - Local Encrypted Storage Vault (SQLCipher / Room / IndexedDB)                |
|   - Offline Vector Map Engine (Embedded PMTiles / MBTiles)                      |
+---------------------------------------+-----------------------------------------+
                                        |
                                        v
+---------------------------------------------------------------------------------+
|                    MULTI-TRANSPORT ABSTRACTION CONVERGENCE                      |
|                                                                                 |
|   Dynamic Link Layer Adapter choosing or aggregating available offline links:   |
|                                                                                 |
|   [Transport 1]      [Transport 2]     [Transport 3]   [Transport 4] [Transport 5]
|   Bluetooth Low      Wi-Fi Direct /    Nearby          Local LAN     Optical /
|   Energy (BLE)       Wi-Fi Aware       Connections     WebSockets &  Camera QR
|   Ad-Hoc Mesh        (NAN P2P Sockets) (Google P2P)    WebRTC Data   Airgap Token
|                                                                                 |
|   - No access point  - High throughput - High level    - Venue Wi-Fi - Physical
|     required           P2P links         Google stack    & hotspots    display &
|   - Discovery in     - Range ~50m      - Range ~30m    - Multi-peer    scanner
|     pocket (screen   - Fast payload    - Multi-tech      browser     - Completely
|     off)               sync              hybrid          support       radio-free
+---------------------------------------+-----------------------------------------+
                                        |
                                        v
+---------------------------------------------------------------------------------+
|                      NATIVE ANDROID PLATFORM LAYER                              |
|   - Android Native Background ForegroundService (WAKE_LOCK, ongoing notification)|
|   - Android GnssStatus & Raw GNSS Engine (NMEA, Satellites, DOP, Dead Reckoning)|
|   - Android Battery Optimization Bypass for persistent background mesh relay   |
+---------------------------------------------------------------------------------+
```

---

## 16. Recommended Next Investigation Areas

Before writing new code or making architectural decisions, the following fundamental questions must be investigated:

### 1. Platform & Runtime Selection
* Should NEXUS remain a Web Application (PWA) with native wrapper bridges (e.g. Capacitor / Tauri / React Native), or transition to a 100% native Android application (Kotlin)?
* *Investigation Need:* Can Web Bluetooth, WebRTC, or WebSockets ever provide true ad-hoc background mesh relaying on Android/iOS without a native background service? (The standard answer in mobile OS security is no: background radio scanning requires native platform permissions).

### 2. Multi-Transport Convergence & Selection
* How should NEXUS arbitrate between multiple offline transports?
  * Should BLE be used exclusively for peer discovery and small metadata/SOS beacons, while Wi-Fi Direct or WebRTC is negotiated for bulk incident and telemetry sync?
  * What is the latency and battery consumption tradeoff of maintaining concurrent BLE advertising and scanning?

### 3. Wi-Fi Direct vs Wi-Fi Aware (NAN) vs Nearby Connections
* What are the compatibility and reliability differences across phone vendors (Samsung, Xiaomi, Google Pixel, OnePlus)?
  * *Nearby Connections:* Easy to implement, handles Wi-Fi/BLE switching automatically, but depends on Google Play Services (unavailable on de-Googled devices or some emergency handsets).
  * *Wi-Fi Direct:* Universal on Android, but requires OS prompt or complex Group Owner (GO) negotiation.
  * *Wi-Fi Aware:* Best low-power infrastructure-less P2P technology, but only supported on Android 8+ devices with specific hardware chipsets.

### 4. Offline GNSS Intelligence Beyond Coordinates
* How can raw GNSS measurements enhance emergency routing?
  * Can node velocity and heading vectors predict when two nodes are moving toward each other, prioritizing data exchange before they pass out of radio range?
  * Can GPS accuracy estimates (DOP) automatically flag unreliable coordinates in structural collapse/indoor zones?
  * How can offline geofences be calculated mathematically on-device without cloud GIS servers?

### 5. Offline Cartography & Map Tile Storage
* What is the most lightweight, zero-internet map storage solution for NEXUS?
  * Vector tiles (PMTiles or MapLibre) vs compressed SQLite/MBTiles?
  * How many megabytes are required to pre-package tactical campus or municipal district maps?

### 6. Cryptography & Mesh Security in Blackouts
* In an open, infrastructure-free emergency mesh, how do we prevent malicious or accidental message flooding (denial of service)?
* How can a receiver verify that an emergency SOS originated from a genuine citizen or responder without an online certificate authority?

---
*Report compiled directly from workspace code and automated test suite verification.*
