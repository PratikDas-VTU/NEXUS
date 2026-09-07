# NEXUS — Pre-Event Master Blueprint Directory

> [!IMPORTANT]
> **ANVESHAN'26 Pre-Event Compliance**:
> This folder contains specifications, architecture designs, data contracts, and team planning documents only.
> **No application source code has been written or pre-scaffolded.** All NEXUS application code will be developed during the 24-hour event window.

---

## Directory Organization & Team Workstreams

```text
NEXUS_PreEvent_Blueprint/
├── README.md                      # Master directory guide (this file)
├── TEAM_WORK_ASSIGNMENT.md        # 4-member roles, ownership, pre-event learning & jury pitch
├── TEAM_HANDOFF.md                # Layer interaction pipeline & contract expectations
├── EVENT_TASK_BOARD.md            # 24-hour hackathon task board across all workstreams
│
├── 00_SHARED/                     # Authoritative documents that EVERY member must know
│   ├── 00_README.md               # Core principles and product split
│   ├── 01_REQUIREMENTS.md         # Functional and non-functional specifications
│   ├── 02_ARCHITECTURE.md         # 2-block product architecture & transport principles
│   ├── 05_DATA_CONTRACT.md        # Frozen incident schema, enums & lifecycle states
│   ├── 07_UML.md                  # Component, sequence, and state diagrams
│   ├── 08_FLOWCHARTS.md           # Incident creation & deduplication logic
│   ├── 11_EVENT_CODE_STAGES.md    # 10 milestone implementation stages
│   ├── 12_24H_EXECUTION.md        # Hour-by-hour timeline & Hour-9 decision gate
│   ├── 15_TESTING_CHECKLIST.md    # Master QA checklist across all layers
│   ├── 16_RISK_FALLBACK.md        # Risk mitigation & transport fallbacks
│   ├── 17_DEMO_SCRIPT.md          # 4-minute golden demo presentation script
│   ├── MANIFEST.md                # Pre-event documentation manifest
│   └── NEXUS_PreEvent_Master_Blueprint.docx
│
├── 01_TEAM_LEAD_ARCHITECTURE/     # Member 1 (Team Lead / Architect / Integration)
│   ├── README.md                  # Lead responsibilities, checkpoints, and decision gate
│   ├── 06_RELAY_PROTOCOL.md       # Store-carry-forward peer packet handshake protocol
│   ├── 18_AI_EVENT_RULES.md       # AI coding rules & mandatory prompt logging
│   └── 19_CODING_PROMPTS_FINAL.md # Frozen event-time coding prompt library
│
├── 02_FRONTEND_PRODUCT/           # Member 2 (Frontend / Product Implementation)
│   ├── README.md                  # Frontend ownership, guidelines, and shared references
│   ├── 03_FIELD_APP_UX.md         # Mobile-first panic-friendly Field App UX
│   ├── 04_COMMAND_DASHBOARD.md    # Desktop responder dashboard, alerts & map layout
│   └── 09_FRONTEND_BREAKDOWN.md   # Step-by-step frontend component architecture
│
├── 03_DATA_BACKEND/               # Member 3 (Data / Database / Backend Core)
│   ├── README.md                  # Data core ownership & MongoDB-to-Dexie translation guide
│   ├── 10_BACKEND_CORE_BREAKDOWN.md # IndexedDB, validation, outbox, and cloud sync breakdown
│   └── 13_API_AND_DOWNLOADS.md    # Pre-event tooling and application dependency list
│
└── 04_QA_UI_SUPPORT/              # Member 4 (QA / UI Support / Operations)
    ├── README.md                  # Reusable UI component catalog, QA procedures, bug workflow
    └── 14_TEAM_BREAKDOWN.md       # Multi-track team collaboration overview
```

---

## Quick Navigation by Role

* **Are you Member 1 (Team Lead / Integration)?**
  👉 Start with [`01_TEAM_LEAD_ARCHITECTURE/README.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/01_TEAM_LEAD_ARCHITECTURE/README.md) and [`TEAM_WORK_ASSIGNMENT.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/TEAM_WORK_ASSIGNMENT.md).
* **Are you Member 2 (Frontend / Product)?**
  👉 Start with [`02_FRONTEND_PRODUCT/README.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/02_FRONTEND_PRODUCT/README.md) and [`00_SHARED/05_DATA_CONTRACT.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/05_DATA_CONTRACT.md).
* **Are you Member 3 (Data / Backend)?**
  👉 Start with [`03_DATA_BACKEND/README.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/03_DATA_BACKEND/README.md) (read the MongoDB-to-Dexie concept bridge) and [`00_SHARED/05_DATA_CONTRACT.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/05_DATA_CONTRACT.md).
* **Are you Member 4 (QA / UI Support)?**
  👉 Start with [`04_QA_UI_SUPPORT/README.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/04_QA_UI_SUPPORT/README.md) and [`00_SHARED/15_TESTING_CHECKLIST.md`](file:///c:/Users/PRATIK%20DAS/OneDrive/Desktop/NEXUS/NEXUS_PreEvent_Blueprint/00_SHARED/15_TESTING_CHECKLIST.md).
