# Track 02 — Frontend / Product Implementation

This directory contains specifications, layout guides, and breakdown documents for **Member 2 (Frontend / Product Implementation)**.

---

## Assigned Responsibilities
* Complete ownership of the mobile-first **NEXUS Field App UI**.
* Complete ownership of the desktop **NEXUS Command Dashboard UI**.
* Building the 6-step panic-friendly incident reporting wizard.
* Integrating the Leaflet live incident map and custom priority-colored markers.
* Building the incident filter bar (P0-P3, Status) and audit queue views.
* Responsive layouts, high contrast visual hierarchy, and accessible touch interactions.

---

## Authoritative Documents in this Directory
1. [`03_FIELD_APP_UX.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/02_FRONTEND_PRODUCT/03_FIELD_APP_UX.md): Screen breakdown, 6-step report flow, panic-friendly UI constraints, light-theme specifications.
2. [`04_COMMAND_DASHBOARD.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/02_FRONTEND_PRODUCT/04_COMMAND_DASHBOARD.md): Split-screen desktop operational layout, alert banners, queue sorting, responder actions (Verify, Assign, Resolve).
3. [`09_FRONTEND_BREAKDOWN.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/02_FRONTEND_PRODUCT/09_FRONTEND_BREAKDOWN.md): Step-by-step frontend component architecture.

---

## Required Reading in `00_SHARED/`
* [`00_SHARED/05_DATA_CONTRACT.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/05_DATA_CONTRACT.md) — Must use exact fields: `incidentId`, `type`, `priority` (P0-P3), `latitude`, `longitude`, `status`, etc.
* [`00_SHARED/08_FLOWCHARTS.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/08_FLOWCHARTS.md) — Visual flow of incident creation and responder lifecycle.
* [`00_SHARED/15_TESTING_CHECKLIST.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/15_TESTING_CHECKLIST.md) — Frontend verification items.

---

## Frontend Implementation Guidelines
* **Component Handoff**: Consume reusable components (`Button`, `Badge`, `InputField`, `Card`) developed by Member 4 in `src/components/ui/`.
* **State Handoff**: Subscribe to Dexie live queries provided by Member 3 (`useLiveQuery`) rather than managing disconnected local React state.
* **Map Tile Failure Resilience**: Leaflet map must degrade gracefully. If internet is down and OSM tiles fail to load, display the coordinate coordinates and priority badge cleanly without throwing an unhandled exception.
* **Truthful Status**: Never display "Sent" or "Delivered" when an incident is stored locally offline. Always show "Saved on this device" or "Queued for relay".
