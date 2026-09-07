# NEXUS Data Contract

## Incident envelope

Required fields:
- incidentId
- originDeviceId
- type
- priority
- latitude
- longitude
- timestamp
- status
- peopleAffected
- version
- hopCount
- ttl

## Type enum

| Home action | type values | Default priority |
|---|---|---|
| REPORT EMERGENCY | `medical`, `trapped`, `missing` | P0 |
| REPORT RESOURCE NEED | `resource`, `shelter` | P2 |
| REPORT SAFETY ISSUE | `safety` | P3 |

Default priority is a suggestion; the user can override it.

## Identity
- incidentId is the primary incident identity.
- originDeviceId identifies the originating device.

## Status lifecycle

Canonical active/responder lifecycle:
`reported` -> `stored` -> `queued` -> `relayed` -> `synced` -> `verified` -> `assigned` -> `resolved`

Terminal audit state:
`expired`

Expired incidents remain retained for audit/history but are not forwarded or treated as active delivery candidates.

## Version rules
- Same incidentId + same version: ignore duplicate.
- Same incidentId + lower version: ignore stale update.
- Same incidentId + higher version: accept/update.
- Meaningful incident/status updates increment version.

## Relay rules
- Validate before storing.
- Store before forwarding.
- Increment hopCount when forwarding.
- Stop forwarding on TTL expiry, exhausted hop budget, resolved state, or expired state.
- Do not delete an incident solely because TTL expired.

## Priority
- P0: life-threatening
- P1: urgent
- P2: resource/shelter
- P3: safety/information

Queue order:
1. priority
2. recency/version
3. remaining TTL

## Local stores
- incidents
- outbox
- peerCache
- device
- syncState

## Synchronization source of truth
Do NOT add a `synced: boolean` to Incident. The Incident `status` represents lifecycle state; outbox/syncState contain synchronization bookkeeping.
