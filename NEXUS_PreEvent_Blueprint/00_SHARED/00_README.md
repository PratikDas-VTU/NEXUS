# NEXUS — Pre-Event Preparation Pack

Purpose: prepare every non-code decision before ANVESHAN'26 so implementation can begin immediately when the event starts.

IMPORTANT:
- This pack contains planning/specification/documentation only.
- Do NOT pre-build the NEXUS application.
- Do NOT create the React/Vite implementation, database implementation, WebRTC implementation, Firebase implementation, or completed UI before the event.
- Actual NEXUS code is to be written during the event under the event rule.

## Product split

### Block A — NEXUS Field App
Mobile-first, light-theme, panic-friendly incident reporting and local/offline coordination.

### Block B — NEXUS Command Dashboard
Desktop-first responder/governance dashboard with live map, alerts, incident queue, verification, assignment, resolution and network/relay visibility.

## Core principle

NEXUS is an offline-first emergency incident coordination and store-carry-forward layer. It does not create Internet/cellular connectivity and GPS is location capture, not communication.
