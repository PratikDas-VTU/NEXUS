# NEXUS Command Dashboard — UX Specification

## Purpose
Give responders/governance staff a real-time operational view when incidents reach the connected side.

## Main layout

```text
+---------------------------------------------------------------+
| NEXUS | CONNECTIVITY | SYNC | ALERTS                         |
+----------------------+----------------------------------------+
| FILTERS              | LIVE MAP                               |
| P0 / P1 / P2 / P3    | incident markers                       |
| New / Verified       | priority/status                        |
| Assigned / Resolved  |                                        |
+----------------------+----------------------------------------+
| INCIDENT QUEUE       | SELECTED INCIDENT                      |
| P0 first             | details / location / source            |
| latest updates       | verify -> assign -> resolve            |
+----------------------+----------------------------------------+
```

## Dashboard capabilities
- Live map.
- P0/P1 alert emphasis.
- Priority-sorted incident queue.
- Search/filter.
- Incident details.
- Verify.
- Assign.
- Resolve.
- Source/origin and relay metadata where available.
- Sync/connectivity status.
- Operational history.

## P0 alert behavior
When a new P0 arrives:
- ALWAYS show a prominent visual alert/banner.
- Audio alert is optional and only used when browser autoplay/user-interaction rules permit it.
- Never make sound the only notification.
- Avoid repeated alerts for the same incident/version.

## Governance principle
Distinguish:
- reported
- locally stored
- relayed
- synced
- verified
- assigned
- resolved
- expired

Never collapse these into a false single "delivered" state.
