# NEXUS Golden Demo

## Scene
Campus emergency during network outage.

### Device A
- Turn Internet OFF.
- Open NEXUS.
- Show LOCAL/OFFLINE state.
- Create P0 emergency.
- Capture location.
- Save report.
- Show "Stored on this device".

### Device B
- Connect locally.
- Exchange manifests.
- Request missing incident.
- Receive PAYLOAD.
- Validate/store.
- ACK.

### Relay
- Disconnect A.
- Show B still owns the incident.
- Connect B to C.
- Relay B -> C.

### Cloud
- Give C Internet.
- Sync incident.
- Open responder dashboard.

### Responder
- Show P0 alert.
- Open live map.
- Verify.
- Assign.
- Resolve.

## Judge message

NEXUS does not create connectivity. It preserves and moves structured emergency information opportunistically when local connectivity exists, then synchronizes it to responders when Internet access returns.
