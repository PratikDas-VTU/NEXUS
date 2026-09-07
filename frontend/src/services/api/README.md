# NEXUS — API & Browser Services Inventory

This document details the external, browser, and network APIs integrated within the NEXUS offline-first field application.

---

## A. Browser APIs

### 1. Geolocation API (`navigator.geolocation`)
- **Location**: [`frontend/src/services/api/geolocation.ts`](./geolocation.ts)
- **Status**: **ACTIVE & INTEGRATED**
- **Purpose**: Captures actual latitude, longitude, and accuracy radius from the client's physical GPS receiver when reporting emergencies or positioning on the tactical map.
- **Fail-safe Behavior**: Rejects silent fallbacks to fake coordinates. If permission is denied or times out, the UI explicitly reports GPS unavailability and offers an explicit "Manual Location" fallback.

### 2. IndexedDB API (`window.indexedDB`)
- **Location**: [`backend/data/db.ts`](../../../backend/data/db.ts) (via Dexie.js)
- **Status**: **ACTIVE & INTEGRATED**
- **Purpose**: Provides persistent, zero-cloud local storage for canonical `Incident` records, the outgoing relay queue (`outbox`), and persistent device identities (`deviceId`). Data survives complete offline restarts and network blackout.

### 3. Battery Status API (`navigator.getBattery`)
- **Location**: [`frontend/src/components/DeviceTab.tsx`](../../components/DeviceTab.tsx)
- **Status**: **ACTIVE & INTEGRATED (Graceful Degradation)**
- **Purpose**: Queries physical battery charge level and charging status on supported mobile browsers.
- **Fail-safe Behavior**: When not exposed by desktop browsers (e.g. Chrome on Windows/macOS for privacy), NEXUS honestly displays `N/A (Hardware battery API not exposed by browser)` instead of faking hardware telemetry.

### 4. StorageManager API (`navigator.storage.estimate`)
- **Location**: [`frontend/src/components/DeviceTab.tsx`](../../components/DeviceTab.tsx)
- **Status**: **ACTIVE & INTEGRATED**
- **Purpose**: Inspects exact quota and IndexedDB disk usage in real time, accurately reporting kilobytes utilized by cached emergency incidents.

---

## B. Application & Network APIs

### 1. WebRTC RTCDataChannel (`RTCPeerConnection`, `RTCDataChannel`)
- **Location**: [`networking/transport.ts`](../../../networking/transport.ts)
- **Status**: **ACTIVE & INTEGRATED**
- **Purpose**: Establishes peer-to-peer data channels between field responder devices over local Wi-Fi or ad-hoc mesh links without routing traffic through central internet servers.
- **Protocol**: Exchanges versioned emergency manifests, handshake syn/ack messages, and store-carry-forward incident payloads.

### 2. WebSocket Signaling (`ws://` / `wss://`)
- **Location**: [`networking/signaler.js`](../../../networking/signaler.js), [`frontend/src/services/networkCoordinator.ts`](../networkCoordinator.ts)
- **Status**: **ACTIVE & INTEGRATED**
- **Configuration**: Managed centrally in [`frontend/src/services/api/config.ts`](./config.ts) (`VITE_SIGNALING_URL` with dynamic LAN IP resolution).
- **Purpose**: Performs lightweight session negotiation (SDP offers/answers and ICE candidate exchange) when nodes connect to the same local area network.

### 3. HTTP Signaling Health Endpoint
- **Location**: `http://localhost:8080/status` (or `http://<LAN-IP>:8080/status`)
- **Status**: **ACTIVE & INTEGRATED**
- **Purpose**: Returns JSON health and active peer count from the local signaling server for diagnostics and automated testing.

---

## C. Core Libraries

### 1. Dexie.js (`v4.x`)
- **Status**: **ACTIVE & INTEGRATED**
- **Purpose**: Minimalist, type-safe wrapper over IndexedDB providing reactive queries (`useLiveQuery` / `subscribeToIncidents`), compound indexing (`[status+priority]`), and atomic transactions for outbox deduplication.

### 2. Leaflet / Tactical Map Visualizer (`leaflet`)
- **Status**: **ACTIVE & INTEGRATED**
- **Location**: [`frontend/src/components/MapTab.tsx`](../../components/MapTab.tsx), configuration in [`config.ts`](./config.ts)
- **Map Providers**:
  - **Dark Tactical (Default)**: **Esri World Dark Gray Canvas** (`https://server.arcgisonline.com/...`) — 100% Free, NO API KEY REQUIRED, NO WATERMARK.
  - **Street Map (Layer toggle)**: **OpenStreetMap Standard** (`https://tile.openstreetmap.org/...`) — 100% Free, NO API KEY REQUIRED, NO WATERMARK.
  - **Custom CARTO (Optional)**: If user provides `VITE_CARTO_API_KEY` in `.env`, the app can load Carto Dark Matter directly without watermark. Free key signup: [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey).
- **Purpose**: Renders offline map coordinates, emergency beacons, threat radii, and real-time GPS positioning without requiring an external Google Maps API key or commercial subscription.

---

## D. Future & Planned Cloud Services

### 1. Firebase / Supabase Cloud Synchronization
- **Status**: **PLANNED / NOT CURRENTLY INTEGRATED (Zero-Internet Mode Priority)**
- **Intended Purpose**: In disaster scenarios where an uplink node eventually reaches an internet-connected gateway (satellite link or cell tower), cached outbox incidents will bridge to central emergency command servers.
- **Architectural Isolation**: The core application functions 100% offline without any Firebase/Supabase credentials or cloud dependencies.
