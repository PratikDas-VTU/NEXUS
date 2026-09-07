# NEXUS Relay Protocol

## Peer discovery / pairing

Two devices must first be reachable on the same local network.

Preferred UX:
- Host creates a short-lived relay session.
- Host displays a QR containing a reachable local signaling address and session ID.
- Joining device scans it.
- If QR/camera fails, use a short-code/manual-address fallback.
- Then begin HELLO.

Do not assume an arbitrary detected local IP is reachable. If automatic address discovery is unreliable, expose a clearly labeled manual fallback.

## Handshake
HELLO -> identify peer/session
MANIFEST -> advertise known incident IDs/versions
MISSING -> identify required items
REQUEST -> request selected payloads
PAYLOAD -> transfer incident
ACK -> confirm validated receipt/storage
FORWARD -> eligible receiver may relay later

## Store-before-forward

```text
Receive PAYLOAD
    |
Validate schema/integrity
    |
Deduplicate/version-check
    |
Persist locally
    |
ACK
    |
Eligible for forwarding
```

## A -> B -> C

```text
A creates P0
   |
   v
B receives -> validates -> stores
   |
A disconnects
   |
   v
B meets C
   |
   v
C receives -> validates -> stores
   |
C gets Internet
   |
   v
Cloud
```

## Transport hierarchy

### Primary
Direct WebRTC DataChannel between real devices over the available local network.

### Event-time fallback
Local LAN WebSocket transport may carry the same relay protocol if WebRTC has not passed the agreed checkpoint. This remains real multi-device local communication when devices can reach the signaling server.

### Development-only fallback
BroadcastChannel may validate application/relay logic during development, but it is NOT real multi-device networking and must never be presented as such to judges.

## Validation
Every received message must be parsed, checked against its expected message type, schema-validated, and safely rejected if malformed.
