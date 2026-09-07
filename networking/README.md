# Networking & Relay Workstream

This directory is reserved primarily for **Member 1 (Team Lead / Core Architecture / Networking / System Integration)**.

---

## Purpose
During the ANVESHAN'26 event, this folder will contain the core communication engine of NEXUS: direct device-to-device transport, local network peer discovery, store-carry-forward relay protocol, and multi-hop packet propagation without cellular or internet infrastructure.

---

## Member Ownership & Responsibilities
* **Primary Owner**: Member 1 (Team Lead / Architect / Integration)
* **Branch**: `core-architecture`
* **Core Responsibilities**:
  * Implement local peer signaling client and server script over LAN/hotspot (`ws`).
  * Implement direct **WebRTC DataChannel** peer connection management, SDP offer/answer exchange, and ICE candidate handling.
  * Implement the **local WebSocket fallback** transport if WebRTC is blocked at the Hour-9 decision gate.
  * Implement the 6-stage **Relay Protocol**:
    * `HELLO` $\rightarrow$ Peer and session identification
    * `MANIFEST` $\rightarrow$ Known incident IDs and versions advertisement
    * `MISSING` $\rightarrow$ Missing payload detection
    * `REQUEST` $\rightarrow$ Incident payload request
    * `PAYLOAD` $\rightarrow$ Validated incident transfer
    * `ACK` $\rightarrow$ Confirmation of local persistence
  * Enforce hop budget (`hopCount <= 3`) and TTL expiration to prevent infinite forwarding loops.
  * Manage local device identity (`originDeviceId` generation/persistence).
  * Build networking failure handling (channel drops, timeouts, AP isolation mitigation).

---

## Relationship to Other Layers
* **Depends on `shared/`**: Operates against frozen message envelopes and the shared incident data contract.
* **Interfaces with `backend/data/`**: Pulls pending items from the Outbox queue; ensures inbound packets are validated and persisted locally before forwarding or ACKing.
* **Coordinates with `backend/integration/`**: Utilizes serialization and error response utilities authored by Member 4.
* **Connects to `frontend/`**: Emits real-time connection status updates (signaling status, active peers, DataChannel open/closed) for truthful UI banners.

---

## Pre-Event Status
> [!IMPORTANT]
> **No WebRTC, signaling, or networking implementation code is present in this directory.**
> Transport adapters, signaling scripts, and relay state machines will be developed strictly during the hackathon following the team lead's instruction to start coding.
