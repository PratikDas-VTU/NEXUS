# Backend / Core Breakdown

NEXUS backend is split into local core, transport/relay, and cloud response.

## Local core
- Incident model
- Validation
- Priority engine
- Deduplication
- Versioning
- Device identity
- IndexedDB/Dexie persistence
- Outbox queue
- TTL/hop policy

## Transport
- Transport interface
- Local signaling
- WebRTC adapter
- Connection lifecycle
- Message validation

## Relay
- HELLO
- MANIFEST
- MISSING
- REQUEST
- PAYLOAD
- ACK
- Forwarding policy
- Store-before-forward

## Cloud
- Firebase configuration
- Firestore schema
- Idempotent sync
- Retry/sync state
- Dashboard data access
- Verify/assign/resolve

## Signaling server
- Local-only LAN/hotspot server
- WebSocket signaling
- No incident payload storage required
- Keep it minimal and disposable
