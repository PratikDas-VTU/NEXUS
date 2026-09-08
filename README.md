# NEXUS — Offline-First Emergency & Community Network

<div align="center">

![NEXUS Banner](https://img.shields.io/badge/NEXUS-Offline--First%20Mesh-0f172a?style=for-the-badge&logo=satellite&logoColor=white)
![Build Status](https://img.shields.io/badge/Build-Passing-15803d?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Web-2563eb?style=for-the-badge)
![Transport](https://img.shields.io/badge/Transport-Google%20Nearby%20%7C%20WebRTC%20%7C%20WebSocket-7e22ce?style=for-the-badge)

**Communication That Survives When Infrastructure Doesn't**

*An ad-hoc, multi-hop peer-to-peer mesh network empowering disaster victims and first responders to exchange verified emergency beacons, civilian reports, and field coordination data when cellular networks, power grids, and internet backhauls completely fail.*

[Architecture Flow & Interactive Deep Dive](nexus_architecture_flow.html) • [Physical Demo Flow](#-physical-demonstration--capabilities) • [Quick Start](#-quick-start)

---

</div>

## 📌 The Problem

During natural disasters (earthquakes, cyclones, floods) or infrastructure grid failures:
* **Cell towers collapse** from power cuts or physical destruction.
* **Internet backhauls sever**, leaving standard communication apps (WhatsApp, SMS, 911/112 dialers) completely dead.
* **First responders and victims** become isolated into physical communication islands with zero visibility into survivor locations or hazard zones.

---

## ⚡ The NEXUS Solution

**NEXUS turns ordinary consumer smartphones into autonomous, relaying mesh nodes.**

Without needing SIM cards, mobile data, Wi-Fi routers, or internet access, nearby devices running NEXUS:
1. **Discover each other over native radios** using Bluetooth Low Energy and Wi-Fi Direct.
2. **Form ad-hoc peer-to-peer links** securely and automatically.
3. **Store, carry, and forward emergency reports** asynchronously across geographic disaster zones.
4. **Deliver critical situational awareness** to nearby responders and local Command Center dashboards.

> [!IMPORTANT]
> **Core Principle: Offline-First by Design**  
> NEXUS does not create artificial internet or cellular access. GPS captures coordinates; it does not transmit data. NEXUS preserves, validates, and propagates structured emergency payloads opportunistically over local device radios.

---

## 🏗️ Architecture Stack

NEXUS decouples high-level incident application logic from underlying physical transport radios via a strict layered architecture:

```text
┌────────────────────────────────────────────────────────┐
│                   NEXUS Application                    │
│      Emergency SOS • Civilian Feeds • Offline Map      │
├────────────────────────────────────────────────────────┤
│                      MeshRuntime                       │
│    Local Outbox • Dexie (IndexedDB) • State Machine    │
├────────────────────────────────────────────────────────┤
│                      RelayEngine                       │
│  Deduplication • Bounded Hop Budget • Sync Protocols   │
├────────────────────────────────────────────────────────┤
│                 MultiTransportManager                  │
│   Transport-Agnostic Multiplexing & Connection Pools   │
├───────────────────┬───────────────────┬────────────────┤
│   Google Nearby   │ WebRTC DataChan   │ WebSocket LAN  │
│  (Primary Radio)  │   (Alternate)     │ (Fallback/Ops) │
├───────────────────┴───────────────────┴────────────────┤
│                 Android Radio Stack                    │
│          Bluetooth Low Energy • Wi-Fi Direct           │
└────────────────────────────────────────────────────────┘
```

### 1. Primary Physical Mesh: Google Nearby Connections
- Uses Google Play Services Nearby Connections API (`Strategy.P2P_CLUSTER`).
- Discovers physical peer radios directly in background/foreground via Bluetooth Low Energy and negotiates high-speed Wi-Fi Direct connections automatically.
- Bridges into the web runtime via a custom native Capacitor Android plugin (`NexusNativePlugin.java`).

### 2. Transport-Agnostic RelayEngine
- The core protocol engine does not care which transport delivers bytes.
- Treats Google Nearby, WebRTC DataChannel, and WebSocket as interchangeable byte streams (`ITransportConnection`).

### 3. Store-Carry-Forward (SCF) Propagation
- A disaster area often lacks a simultaneous, uninterrupted path from victim to rescue base.
- When Node A connects to Node B, they sync their stores. If Node B physically moves 500 meters toward a rescue camp and meets Node C, the emergency packet jumps across the physical gap asynchronously.

---

## 🔄 The Deterministic Wire Protocol

NEXUS enforces a strict 5-phase session handshake between any two discovered peers before exchanging data:

```text
Peer A                                                     Peer B
  │                                                          │
  │─── 1. HELLO (Node ID, Protocol Version, Capabilities) ──>│
  │<── 1. HELLO (Node ID, Protocol Version, Capabilities) ───│
  │                                                          │
  │─── 2. MANIFEST (List of owned Incident IDs + Hashes) ───>│
  │<── 2. MANIFEST (List of owned Incident IDs + Hashes) ────│
  │                                                          │
  │─── 3. REQUEST (List of missing Packet IDs needed) ──────>│
  │<── 3. REQUEST (List of missing Packet IDs needed) ───────│
  │                                                          │
  │─── 4. PAYLOAD (Full serialized incident packets) ───────>│
  │<── 4. PAYLOAD (Full serialized incident packets) ────────│
  │                                                          │
  │─── 5. ACK (Receipt & Hop Budget decrement) ─────────────>│
  │<── 5. ACK (Receipt & Hop Budget decrement) ──────────────│
```

### Key Protocol Invariants:
* **Idempotent Ingestion**: Every packet is indexed by a deterministic content hash. Re-receiving an existing packet is a silent no-op.
* **Bounded Hop Budget**: Every emergency packet carries a TTL/hop budget (default: 3 hops) to strictly prevent broadcast storms and radio congestion.
* **Cryptographic Integrity**: Payloads are immutable; packet signatures and hashes are verified before committing to local IndexedDB storage.

---

## 🛠️ Technology Stack

| Domain | Technology / Library | Purpose |
| :--- | :--- | :--- |
| **Physical Radios** | Google Nearby Connections 19.3.0 | Zero-infrastructure BLE discovery & Wi-Fi Direct radio clustering |
| **Native Bridge** | Capacitor 7 + Custom Java Plugin | High-performance JSON/byte bridge between Android native and WebView |
| **Frontend UI** | React 18, TypeScript, TailwindCSS | Responsive Field App (mobile) + Tactical Command Dashboard (desktop) |
| **Offline Mapping** | Leaflet + OpenStreetMap | Offline-cached tile rendering, incident pins, density heatmaps |
| **Local Storage** | Dexie.js (IndexedDB) | ACID-compliant local persistence for outbox queue, incident manifests |
| **Signaling & LAN** | Node.js (`ws`) | Local area network signaling and laptop Command Center node integration |
| **Quality & Tests** | Vitest, Node.js E2E Suites | Multi-node serialization tests, state machine verification, relay tests |

---

## 📁 Repository Structure

```text
NEXUS/
├── android/                             # Android Native Project (Capacitor wrapper)
│   └── app/src/main/
│       ├── AndroidManifest.xml          # BLE, Wi-Fi Direct, and Nearby permissions
│       ├── res/xml/network_security_config.xml # Cleartext LAN signaling policy
│       └── java/org/nexus/mesh/
│           ├── MainActivity.java        # Mixed content & WebView security config
│           └── NexusNativePlugin.java   # Google Nearby Connections native plugin
│
├── frontend/                            # React 18 / Vite Mobile & Admin Web App
│   ├── src/
│   │   ├── admin/                       # Incident Command Center Tactical Dashboard
│   │   ├── components/                  # SOS Modal, MapTab, FeedTab, NetworkTab
│   │   ├── context/                     # Global Service & Mesh State Providers
│   │   └── services/                    # RelayEngine, NearbyController, Storage
│   └── vite.config.ts
│
├── networking/                          # Transport & Relay Engine
│   ├── nativeBridge.ts                  # Capacitor-to-Native TypeScript bridge
│   ├── signaler.js                      # Local WebSocket LAN signaler
│   └── signalingClient.ts               # WebRTC & LAN socket transport implementation
│
├── shared/                              # Shared schemas & protocol definitions
│   └── types/                           # Incident data schemas, wire envelopes
│
├── tests/                               # Test suites
│   └── integration/                     # End-to-end multi-hop relay simulation tests
│
├── nexus_architecture_flow.html         # 🌟 Standalone Interactive Judge Architecture Doc
└── capacitor.config.ts                  # Capacitor configuration (HTTPS Android scheme)
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v18+ (tested on v20/v24)
- **Android Studio / SDK**: Android 12+ (API 31+) for physical radio mesh testing
- **Physical Devices**: 2+ Android smartphones with Bluetooth and Wi-Fi enabled

### 1. Clone & Install
```bash
git clone https://github.com/PratikDas-VTU/NEXUS.git
cd NEXUS/frontend
npm install
```

### 2. Run Local Web Dev Server
```bash
npm run dev
```
Open `http://localhost:5173` to interact with the responsive Field App or append `/#admin` for the Command Dashboard.

### 3. Run Local LAN Signaler (Optional)
To test LAN WebSocket fallback or bridge a laptop Command Center to the mesh:
```bash
node ../networking/signaler.js
```

### 4. Build & Run on Physical Android Devices
```bash
# Build web assets and sync to Android project
npm run build
npx cap sync android

# Open in Android Studio or compile debug APK directly
cd ../android
./gradlew assembleDebug
```
The compiled APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📊 Physical Demonstration & Capabilities

| Capability | Demonstration Status | Verification Method |
| :--- | :--- | :--- |
| **Phone ↔ Phone Radio Mesh** | ✅ **Physically Verified** | Real physical BLE discovery and Wi-Fi Direct connection via Google Nearby API |
| **Offline Incident Broadcast** | ✅ **Physically Verified** | Beacon generated in Airplane Mode, committed to local IndexedDB, synced over radio |
| **Transport Agnosticism** | ✅ **Physically Verified** | RelayEngine ingests identical packets from Google Nearby, WebRTC, or LAN WebSocket |
| **Deduplication & TTL** | ✅ **Verified via Test Suites** | Invariant tests confirm duplicate packets are dropped and hop budgets strictly bounded |
| **Interactive Architecture Flow** | ✅ **Delivered** | Standalone visual documentation in `nexus_architecture_flow.html` |
| **Satellite / LoRa Gateways** | 🔮 *Future Scope* | Long-range uplink gateway bridging offline mesh islands to remote Cloud HQ |

---



<div align="center">

**Developed with ❤️ for ANVESHAN'26 Hackathon**  
*Pratik Das & Team NEXUS*

</div>
