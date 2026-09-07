# NEXUS Testing Checklist

## Offline
- [ ] Launch with Internet disabled
- [ ] Create incident
- [ ] Save locally
- [ ] Close/reopen
- [ ] Incident remains

## Location
- [ ] GPS capture
- [ ] Manual fallback
- [ ] Coordinate validation

## Intelligence
- [ ] P0/P1/P2/P3
- [ ] Duplicate suppression
- [ ] Higher-version update
- [ ] Lower-version rejection
- [ ] TTL
- [ ] Hop count

## Networking
- [ ] Internet disabled
- [ ] A-B signaling
- [ ] A-B DataChannel
- [ ] JSON transfer
- [ ] PAYLOAD validation
- [ ] ACK
- [ ] B stores
- [ ] A disconnects
- [ ] B-C transfer
- [ ] C stores

## Cloud
- [ ] C reconnects Internet
- [ ] Sync succeeds
- [ ] Duplicate cloud upload does not create duplicate incident

## Dashboard
- [ ] Incident visible
- [ ] P0 highlighted
- [ ] Map marker
- [ ] Verify
- [ ] Assign
- [ ] Resolve
- [ ] Status reflects actual state

## Failure tests
- [ ] Malformed peer message
- [ ] Expired TTL
- [ ] Duplicate payload
- [ ] Lost DataChannel
- [ ] Firebase unavailable
- [ ] Map tiles unavailable
