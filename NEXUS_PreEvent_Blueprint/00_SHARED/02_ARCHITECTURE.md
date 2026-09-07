# NEXUS Architecture

## Two-block product architecture

```text
+-------------------------------+       +-------------------------------+
| BLOCK A: FIELD APP            |       | BLOCK B: COMMAND DASHBOARD    |
| Mobile-first / light / panic  |       | Desktop-first / governance    |
| friendly                      |       | live map / alerts             |
+---------------+---------------+       +---------------+---------------+
                |                                       ^
                v                                       |
+---------------------------------------------------------------+
| OFFLINE INCIDENT CORE                                         |
| validation | priority | dedup | version | TTL | queue        |
+--------------------------+------------------------------------+
                           |
                           v
+---------------------------------------------------------------+
| LOCAL TRANSPORT / RELAY                                      |
| local signaling | WebRTC DataChannel | store-carry-forward  |
+--------------------------+------------------------------------+
                           |
                    Internet returns
                           |
                           v
+---------------------------------------------------------------+
| CLOUD SYNC / RESPONSE                                         |
| Firestore | dashboard data | verify | assign | resolve       |
+---------------------------------------------------------------+
```

## Golden rule

The incident engine must never depend on the network.

## Layer responsibilities

1. UI/PWA
2. Offline core
3. Local transport
4. Relay protocol
5. Cloud sync
6. Responder/governance dashboard

## Primary data path

Capture -> Validate -> Prioritize -> Persist -> Queue -> Peer Exchange -> Store -> Forward -> Cloud Sync -> Respond -> Resolve

## Transport principle

Use direct local WebRTC first. Local signaling is coordination for the peer connection; it is not the incident transport itself. Do not make TURN a core MVP dependency.
