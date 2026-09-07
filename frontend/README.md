# Frontend Workstream

This directory is reserved for **Member 2 (Frontend / Product)**.

---

## Purpose
During the ANVESHAN'26 event, this folder will house the user-facing web applications of NEXUS:
1. **NEXUS Field App**: Mobile-first, panic-friendly, high-contrast interface for reporting emergencies and local coordination under blackout conditions.
2. **NEXUS Command Dashboard**: Desktop-first responder/governance interface featuring real-time incident queues, live Leaflet map tracking, priority filters, and verification/assignment workflows.
3. **UI Components & Layouts**: Application views, forms, wizards, modals, and status displays built using React and Tailwind CSS.
4. **Client State & Interaction**: User interface interaction states and subscriptions to local reactive data stores.

---

## Member Ownership & Responsibilities
* **Primary Owner**: Member 2 (Frontend / Product)
* **Branch**: `frontend`
* **Core Responsibilities**:
  * Implement the 6-step incident creation wizard per UX specifications.
  * Integrate Leaflet for coordinate display and incident markers with graceful offline degradation.
  * Implement truthful connectivity and sync status banners.
  * Ensure full mobile touch compliance (minimum 48px touch targets) and WCAG AA contrast.
  * Coordinate with Member 4 on consuming reusable base components.
  * Coordinate with Member 3 on consuming Dexie reactive query hooks.

---

## Relationship to Other Layers
* **Depends on `shared/`**: Imports frozen data contracts, incident models, priority/status enums, and validation schemas.
* **Interfaces with `backend/data/`**: Consumes typed database service methods and reactive query hooks for local persistence.
* **Integrates with `backend/integration/` & `networking/`**: Reflects real-time local peer relay status and cloud sync progress.

---

## Pre-Event Status
> [!IMPORTANT]
> **No application source code is present in this directory.**
> React/Vite scaffolding, component code, styling, and application scripts will be developed strictly during the hackathon following the team lead's instruction to start coding.
