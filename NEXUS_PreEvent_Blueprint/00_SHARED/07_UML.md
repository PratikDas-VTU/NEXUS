# NEXUS UML / Mermaid Source

## Use-case diagram

```mermaid
flowchart LR
  User((Field User))
  Responder((Responder))
  App[NEXUS Field App]
  Dash[NEXUS Command Dashboard]
  Peer[Peer Device]
  Cloud[Cloud Sync]

  User --> App
  App --> Peer
  Peer --> App
  App --> Cloud
  Responder --> Dash
  Cloud --> Dash
```

## Component diagram

```mermaid
flowchart TB
  UI[Field UI / PWA]
  Core[Offline Incident Core]
  DB[(IndexedDB / Dexie)]
  Queue[Outbox Queue]
  Transport[Transport Interface]
  WebRTC[WebRTC DataChannel]
  WSTransport[Local WebSocket Transport]
  Signal[Local Signaling Server]
  Relay[Relay Engine]
  Sync[Cloud Sync]
  Firestore[(Firestore)]
  Dashboard[Responder Dashboard]

  UI --> Core
  Core --> DB
  Core --> Queue
  Queue --> Relay
  Relay --> Transport
  Transport --> WebRTC
  Transport --> WSTransport
  WebRTC --> Signal
  WSTransport --> Signal
  Core --> Sync
  Sync --> Firestore
  Firestore --> Dashboard
```

## Incident state diagram

```mermaid
stateDiagram-v2
  [*] --> Reported
  Reported --> Stored
  Stored --> Queued
  Queued --> Relayed
  Relayed --> Stored
  Stored --> Synced
  Synced --> Verified
  Verified --> Assigned
  Assigned --> Resolved

  Reported --> Expired
  Stored --> Expired
  Queued --> Expired
  Relayed --> Expired
  Synced --> Expired

  Resolved --> [*]
  Expired --> [*]
```

Expired is terminal for relay purposes but retained for audit/history.

## Transport decision

```mermaid
flowchart TD
  A[Need peer transport] --> B{WebRTC A-B works?}
  B -->|Yes| C[Use WebRTC DataChannel]
  B -->|No by checkpoint| D{Local LAN WebSocket reachable?}
  D -->|Yes| E[Use WebSocket transport]
  D -->|No| F[Protect offline/persistence demo]
```

## Sequence: A -> B

```mermaid
sequenceDiagram
  participant A as Device A
  participant S as Local Signaling
  participant B as Device B

  A->>S: signaling messages
  B->>S: signaling messages
  A->>B: WebRTC connection
  A->>B: HELLO
  B->>A: MANIFEST
  A->>B: MISSING
  B->>A: REQUEST
  A->>B: PAYLOAD
  B->>A: Validate + Store
  B->>A: ACK
```
