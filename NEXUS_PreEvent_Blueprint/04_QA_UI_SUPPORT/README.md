# Track 04 — QA / UI Support / Operations Implementation

This directory contains component specifications, testing procedures, bug workflows, and implementation task lists for **Member 4 (QA / UI Support / Operations Implementation)**.

---

## Assigned Responsibilities & Ownership
* **Real Code Ownership**: You own the creation of the reusable design system components in `src/components/ui/` that Member 2 uses across the entire app.
* **Accessibility & Ergonomics**: Ensuring buttons and touch targets meet the **minimum 48px height** requirement for panicked field use.
* **Form & Validation Controls**: Building text inputs, dropdowns, and clear visual error messages.
* **Quality Assurance**: Executing the multi-device test checklist on real laptops and mobile phones.
* **Bug Reproduction & Logging**: Filing clean bug reports for Member 1, 2, and 3 during 2-hour integration checkpoints.
* **Demo Scenario Data**: Creating realistic disaster-scenario mock datasets for the final jury pitch.

---

## Authoritative Documents in this Directory
1. [`14_TEAM_BREAKDOWN.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/04_QA_UI_SUPPORT/14_TEAM_BREAKDOWN.md): High-level multi-track collaboration rules.

---

## Required Reading in `00_SHARED/`
* [`00_SHARED/15_TESTING_CHECKLIST.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/15_TESTING_CHECKLIST.md) — The master checklist of what to verify at each stage.
* [`00_SHARED/17_DEMO_SCRIPT.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/17_DEMO_SCRIPT.md) — The exact steps of the 4-minute presentation demo.
* [`00_SHARED/03_FIELD_APP_UX.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/02_FRONTEND_PRODUCT/03_FIELD_APP_UX.md) — Field App design constraints.

---

## Concrete UI Component Catalog (To Implement During Stage 1)

Member 4 will independently code these components in `src/components/ui/`:

### 1. `Button.tsx`
* **Purpose**: Primary tap target for emergency actions.
* **Requirements**:
  * Minimum height: `h-12` (48px) for mobile finger tapping.
  * Variants:
    * `primary`: High-contrast dark or blue (`bg-blue-600 text-white active:bg-blue-700`).
    * `danger`: High-urgency red for P0 actions (`bg-red-600 text-white active:bg-red-700`).
    * `secondary`: Light gray surface (`bg-gray-100 text-gray-900 active:bg-gray-200`).
    * `outline`: Clean white surface with gray border (`border border-gray-300`).
  * States: Handles `disabled`, `loading` (shows small spinner), `fullWidth`.

### 2. `PriorityBadge.tsx`
* **Purpose**: Displays incident severity tag prominently.
* **Requirements**:
  * Must pair color with bold text and icon (never color alone):
    * `P0`: Red background, white bold text (`P0 • Life Threatening`).
    * `P1`: Orange background, dark text (`P1 • Urgent`).
    * `P2`: Yellow background, dark text (`P2 • Resource / Shelter`).
    * `P3`: Slate/Blue background (`P3 • Safety / Info`).

### 3. `StatusPill.tsx`
* **Purpose**: Reflects truthful incident lifecycle state.
* **Values**: `Saved locally`, `Queued for relay`, `Relayed`, `Synced`, `Verified`, `Assigned`, `Resolved`.
* **Requirements**: Small rounded pill (`rounded-full px-3 py-1 text-xs font-semibold`).

### 4. `InputField.tsx` & `SelectField.tsx`
* **Purpose**: Touch-friendly form elements with inline validation error display.
* **Requirements**:
  * Minimum 48px height.
  * Clear label above field.
  * Red outline and friendly error text below field when validation fails.

### 5. `IncidentCard.tsx`
* **Purpose**: Displays summary of an incident in lists and queues.
* **Requirements**: Shows priority badge, incident type, timestamp, people affected, and status pill.

---

## Step-by-Step QA & Testing Procedure

During each integration checkpoint, Member 4 performs the following physical tests:

```text
[ Test 1: Offline Creation ]
1. Turn off Wi-Fi on test phone.
2. Open NEXUS Field App.
3. Tap "Report Emergency" -> Select "Medical" -> Set Priority "P0".
4. Submit report -> Verify "Saved on this device" confirmation appears.
5. Close browser tab completely.
6. Re-open browser tab -> Verify incident is still in "My Reports".
   ==> PASS / FAIL

[ Test 2: Two-Device Peer Transfer ]
1. Place Device A and Device B on the local Wi-Fi hotspot.
2. Keep Internet disconnected on both devices.
3. Open Relay screen on Device A; scan or enter code on Device B.
4. Verify Device B receives the P0 incident.
5. Verify incident status on Device A updates to "Relayed".
   ==> PASS / FAIL

[ Test 3: Failure Injection ]
1. Submit incident with invalid coordinates (e.g. Latitude: 999).
2. Verify app does NOT crash and shows helpful validation error.
   ==> PASS / FAIL
```

---

## Bug Report Workflow

When a test fails, post a bug report directly in team chat using this template:

```markdown
### 🐛 Bug Report
* **Milestone / Hour**: [e.g. H5 Offline Creation]
* **Component / Area**: [e.g. Report Wizard / Geolocation]
* **Device / OS**: [e.g. Android Chrome / Laptop Edge]
* **Steps to Reproduce**:
  1. Open Report Wizard
  2. Leave People Affected field blank
  3. Click Send
* **Expected Result**: Validation message appears asking for number.
* **Actual Result**: App showed blank white screen / unhandled error.
* **Assigned To**: [Member 2 / Member 3]
```

---

## Final Presentation Role for Member 4

During the jury demo:
1. You operate **Device B** during the live relay scenario.
2. When Member 1 and Member 2 explain the architecture, you demonstrate receiving the incident on your phone live with internet disabled.
3. You present your testing findings: *"I verified our system against 15 failure scenarios, ensuring malformed peer packets are safely rejected and emergency reports survive device restarts."*
