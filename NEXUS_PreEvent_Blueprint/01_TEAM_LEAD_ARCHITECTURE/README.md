# Track 01 — Team Lead / Architecture / Integration

This directory contains specifications, protocols, and implementation rules for **Member 1 (Team Lead / Architect / Integration)**.

---

## Assigned Responsibilities
* Overall system architecture and non-negotiable contract enforcement.
* Local WebSocket signaling server for peer discovery on LAN/hotspot.
* WebRTC DataChannel connection lifecycle, ICE negotiation, and fallback handling.
* Store-carry-forward relay state machine implementation (`06_RELAY_PROTOCOL.md`).
* Cloud synchronization integration with Firebase/Firestore.
* Master repository integration, branch merges, conflict resolution, and final debugging.

---

## Authoritative Documents in this Directory
1. [`06_RELAY_PROTOCOL.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/01_TEAM_LEAD_ARCHITECTURE/06_RELAY_PROTOCOL.md): Detailed packet exchange specifications (`HELLO`, `MANIFEST`, `MISSING`, `REQUEST`, `PAYLOAD`, `ACK`).
2. [`18_AI_EVENT_RULES.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/01_TEAM_LEAD_ARCHITECTURE/18_AI_EVENT_RULES.md): Strict rules for AI-assisted coding during the event, prompt logging requirements, and guardrails.
3. [`19_CODING_PROMPTS_FINAL.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/01_TEAM_LEAD_ARCHITECTURE/19_CODING_PROMPTS_FINAL.md): Frozen prompt library for event-time generation (Stage 0 to Stage 10).

---

## Required Reading in `00_SHARED/`
Every architectural decision must align with the shared specifications:
* [`00_SHARED/01_REQUIREMENTS.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/01_REQUIREMENTS.md) — Functional and non-functional requirements.
* [`00_SHARED/02_ARCHITECTURE.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/02_ARCHITECTURE.md) — 2-block product architecture and golden rule.
* [`00_SHARED/05_DATA_CONTRACT.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/05_DATA_CONTRACT.md) — Frozen incident schema and lifecycle enums.
* [`00_SHARED/07_UML.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/07_UML.md) — Component, sequence, and state diagrams.
* [`00_SHARED/11_EVENT_CODE_STAGES.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/11_EVENT_CODE_STAGES.md) — 10 implementation stages.
* [`00_SHARED/12_24H_EXECUTION.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/12_24H_EXECUTION.md) — Hour-9 decision gate and time budgeting.
* [`00_SHARED/16_RISK_FALLBACK.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/16_RISK_FALLBACK.md) — Fallback hierarchy when network issues arise.

---

## Hour-9 Decision Gate Guideline
At Hour 9, Member 1 must execute the critical networking test:
1. If WebRTC DataChannel successfully transmits JSON between two physical devices on the local LAN without internet -> **Proceed with WebRTC**.
2. If WebRTC is blocked by AP isolation or mDNS host issues, but local WebSocket is reachable -> **Switch to WebSocket transport**, keeping the exact same relay protocol.
3. If neither works -> Freeze offline persistence and controlled relay demonstrations. Do not consume remaining hours on networking rabbit holes.
