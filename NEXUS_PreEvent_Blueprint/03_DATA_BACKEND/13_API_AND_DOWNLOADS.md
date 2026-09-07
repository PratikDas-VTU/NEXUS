# NEXUS Tools, Downloads and External Services

## Install before the event — tooling only
- Git
- Node.js LTS/current supported version
- VS Code or preferred editor
- Google Chrome
- Modern browser on test phones
- Optional Firebase CLI
- Optional GitHub CLI
- Optional QR/camera-capable test device

Installing tools is preparation. Do not scaffold/build NEXUS before the event.

## Application dependencies — install during the event
- React
- Vite
- TypeScript
- Dexie
- Zod
- Leaflet
- react-leaflet if needed
- Firebase SDK
- Browser WebRTC APIs
- Node/WebSocket dependencies for local signaling
- QR library only if pairing UX is implemented

Every dependency must have a clear purpose.

## External services

### Firebase
Use the no-cost Spark plan where quotas and event restrictions fit. Confirm current quotas at event start. Cloud sync must not be required for local incident creation.

### Maps
Leaflet is the map UI library; tiles are a separate service.
Do not design the MVP around paid Google Maps APIs.
Do not bulk-download/prefetch public OSM tiles. If tiles are unavailable, gracefully show incident coordinates/list instead.

### Location
Browser Geolocation API requires no paid API key. Provide manual location fallback.

## API policy
Target: no paid API required for the MVP.
Any service requiring paid keys, mandatory billing, paid quotas, or unnecessary external infrastructure is optional and replaceable.

## Local networking
The signaling server must be reachable by test devices on the controlled LAN/hotspot. Do not assume Internet is required for peer signaling.
