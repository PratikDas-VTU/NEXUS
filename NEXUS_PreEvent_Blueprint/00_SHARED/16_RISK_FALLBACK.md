# Risk and Fallback Plan

## R1 — WebRTC fails
First verify local network, signaling and browser compatibility.
Do not add TURN blindly.
Protect the working offline/persistence demo.

## R2 — AP isolation
Use a controlled local hotspot/LAN if permitted and available.

## R3 — A-B works but A-B-C fails
Freeze the working A-B path. Debug relay separately. Do not destabilize the core demo.

## R4 — Cloud fails
Demonstrate local/relay path and use a pre-prepared non-live dashboard fallback only if allowed and clearly labeled.

## R5 — Map tiles fail
Show coordinate + incident list. The map is a visualization, not the incident data source.

## R6 — Optional feature consumes time
Drop it immediately. Core path wins.

## Fallback hierarchy
1. Live A -> B -> C -> Cloud
2. Live A -> B + dashboard
3. Offline persistence + recorded/controlled relay evidence
4. Application-level relay logic test fallback
5. Screen recording
