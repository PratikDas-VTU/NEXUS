# NEXUS Requirements

## Functional requirements

### Field App
- Launch with Internet unavailable.
- Clear online/local-only/offline state.
- Create emergency/resource/safety incident.
- Capture type, severity, people affected, description and location.
- GPS location capture with manual fallback.
- P0-P3 priority.
- Local persistence using IndexedDB/Dexie.
- Incident remains after app/browser restart.
- Outbox for unsent incidents.
- Incident versioning.
- Duplicate suppression.
- TTL and hop count.
- Peer exchange over local transport.
- Store-before-forward.
- A -> B transfer.
- A -> B -> C relay.
- Sync to cloud when Internet returns.
- Clear delivery/sync status.

### Command Dashboard
- Live incident list.
- Map view.
- Priority filtering.
- Status filtering.
- Incident detail.
- Verify.
- Assign.
- Resolve.
- Alert/high-priority queue.
- Relay/source/hop visibility where available.
- Connectivity/sync status.
- Audit-friendly event history.

## Non-functional requirements
- Mobile-first field UX.
- Light theme as default.
- Large touch targets.
- Minimal typing under stress.
- One primary action per screen.
- High contrast and readable typography.
- Truthful connectivity/status labels.
- Graceful offline degradation.
- No dependency on cloud for incident creation.
- Validate every received peer payload.

## Constraints
- 24-hour implementation window.
- Code developed during the event.
- Prefer free/no-cost/open-source components.
- Avoid paid APIs and unnecessary external services.
