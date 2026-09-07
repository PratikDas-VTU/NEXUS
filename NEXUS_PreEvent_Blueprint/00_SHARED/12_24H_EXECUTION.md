# NEXUS 24-Hour Execution Board

## Critical path
Offline incident -> persistence -> priority/dedup/TTL -> real A-B -> relay -> A-B-C -> cloud -> dashboard.

## Suggested allocation
H0-H1: setup + architecture freeze
H1-H3: PWA/Field UI shell
H3-H5: IndexedDB + incident core
H5-H6: report flow + outbox
H6-H7: priority/dedup/TTL
H7-H9: real A-B WebRTC spike
H9-H11: relay protocol / transport decision
H11-H13: A-B-C
H13-H15: cloud sync
H15-H17: dashboard/map
H17-H19: verify/assign/resolve
H19-H21: hardening
H21-H23: demo rehearsal
H23-H24: buffer/submission

## Hour-9 decision gate
1. WebRTC works reliably -> continue with WebRTC.
2. WebRTC is unreliable but local WebSocket is reachable between real devices -> switch transport while keeping relay protocol unchanged.
3. Neither is reliable -> protect offline/persistence and the strongest live path; do not spend the remaining event on uncontrolled networking experiments.

## Rule
If time is lost, remove optional features before sacrificing A-B, A-B-C, persistence, or the cloud/dashboard golden path.
