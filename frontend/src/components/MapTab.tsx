import React, { useState, useMemo } from 'react';
import { MapBeacon, IncidentItem } from '../types';
import { mapBackgroundUrl } from '../data/mockData';
import { getCurrentPosition } from '../services/api/geolocation';

interface MapTabProps {
  onShowToast: (msg: string) => void;
  incidents?: IncidentItem[];
}

export const MapTab: React.FC<MapTabProps> = ({ onShowToast, incidents = [] }) => {
  const [selectedBeaconId, setSelectedBeaconId] = useState<string>('');
  const [isSpinningRecenter, setIsSpinningRecenter] = useState<boolean>(false);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [showLayers, setShowLayers] = useState<boolean>(true);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [pingActive, setPingActive] = useState<boolean>(false);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);

  // Reference center point
  const centerLat = userLocation?.latitude ?? (incidents.length > 0 && incidents[0].latitude ? incidents[0].latitude : 12.9716);
  const centerLng = userLocation?.longitude ?? (incidents.length > 0 && incidents[0].longitude ? incidents[0].longitude : 77.5946);

  // Dynamically map real incidents from Dexie to tactical map beacons
  const dynamicBeacons: MapBeacon[] = useMemo(() => {
    if (!incidents || incidents.length === 0) return [];

    const latSpan = 0.04;
    const lngSpan = 0.04;

    return incidents.map((inc, idx) => {
      let topPerc = 50;
      let leftPerc = 50;

      if (inc.latitude !== undefined && inc.longitude !== undefined) {
        const dLat = inc.latitude - centerLat;
        const dLng = inc.longitude - centerLng;
        // Invert dLat because latitude increases northwards (top decreases)
        topPerc = Math.max(14, Math.min(82, 50 - (dLat / latSpan) * 36));
        leftPerc = Math.max(12, Math.min(88, 50 + (dLng / lngSpan) * 36));
      } else {
        topPerc = 25 + ((idx * 17) % 55);
        leftPerc = 20 + ((idx * 23) % 65);
      }

      const beaconType: 'amber' | 'blue' | 'critical' =
        inc.badgeColor === 'error' ? 'critical' : inc.badgeColor === 'amber' ? 'amber' : 'blue';

      return {
        id: inc.id,
        type: beaconType,
        label: inc.title.slice(0, 16),
        title: inc.title,
        category: inc.category,
        sector: inc.location,
        distance: inc.distance,
        walkTime: '4m walk',
        threatLevel: inc.badgeColor === 'error' ? 'P0 Critical' : inc.badgeColor === 'amber' ? 'P1 Urgent' : 'P2 Standard',
        pos: {
          top: `${topPerc.toFixed(1)}%`,
          left: `${leftPerc.toFixed(1)}%`,
        },
        responders: {
          initials: ['NX', 'R1'],
          countText: inc.hasResponded ? '1 responder assigned' : '0 responders en route',
        },
      };
    });
  }, [incidents, centerLat, centerLng]);

  const selectedBeacon: MapBeacon | null = useMemo(() => {
    if (dynamicBeacons.length === 0) return null;
    return dynamicBeacons.find((b) => b.id === selectedBeaconId) || dynamicBeacons[0];
  }, [dynamicBeacons, selectedBeaconId]);

  const handleRecenter = async () => {
    setIsSpinningRecenter(true);
    try {
      const pos = await getCurrentPosition();
      if (pos.success && pos.coords) {
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        onShowToast(`GPS locked: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${pos.coords.accuracy}m)`);
      } else {
        onShowToast(`GPS notice: ${pos.error || 'Coordinates unavailable'}`);
      }
    } catch {
      onShowToast('Could not acquire GPS position');
    } finally {
      setIsSpinningRecenter(false);
      setZoomLevel(1);
    }
  };

  const handleZoomIn = () => {
    const next = Math.min(zoomLevel + 0.25, 1.75);
    setZoomLevel(next);
    onShowToast(`Tactical zoom: ${Math.round(next * 100)}%`);
  };

  const handleZoomOut = () => {
    const next = Math.max(zoomLevel - 0.25, 0.85);
    setZoomLevel(next);
    onShowToast(`Tactical zoom: ${Math.round(next * 100)}%`);
  };

  const handleToggleNav = () => {
    if (!selectedBeacon) return;
    if (!isNavigating) {
      setIsNavigating(true);
      onShowToast(`Offline turn-by-turn started for ${selectedBeacon.title}`);
    } else {
      setIsNavigating(false);
      onShowToast('Offline navigation cancelled');
    }
  };

  const handlePingResponders = () => {
    if (!selectedBeacon) return;
    setPingActive(true);
    onShowToast(`Contactless peer ping sent to responders at ${selectedBeacon.sector}`);
    setTimeout(() => setPingActive(false), 800);
  };

  const filteredBeacons = searchQuery.trim()
    ? dynamicBeacons.filter(b => b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : dynamicBeacons;

  return (
    <div className="flex flex-col w-full h-full flex-1 min-h-0 relative overflow-hidden select-none bg-[#0e0e0e]">
      {/* Map Canvas Simulation with Zoom capability */}
      <div
        className="absolute inset-0 w-full h-full bg-[#0e0e0e] bg-cover bg-center transition-transform duration-300 origin-center"
        style={{
          backgroundImage: `url('${mapBackgroundUrl}')`,
          transform: `scale(${zoomLevel})`,
        }}
      >
        {/* Subtle Tactical Vector Linework & Elevation Contours Overlay */}
        {showLayers && (
          <svg className="absolute inset-0 w-full h-full opacity-35 pointer-events-none" height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern height="48" id="tactical-grid" patternUnits="userSpaceOnUse" width="48">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#aac7ff" strokeOpacity="0.15" strokeWidth="0.3" />
                <circle cx="24" cy="24" fill="#aac7ff" fillOpacity="0.2" r="0.75" />
              </pattern>
            </defs>
            <rect fill="url(#tactical-grid)" height="100%" width="100%" />

            {/* Topographic Contour Silhouettes */}
            <path d="M-50,220 C100,180 180,260 320,210 C460,160 540,240 600,200" fill="none" stroke="#aac7ff" strokeDasharray="4 6" strokeOpacity="0.1" strokeWidth="0.8" />
            <path d="M-30,340 C80,310 210,380 360,330 C490,280 570,360 620,320" fill="none" stroke="#aac7ff" strokeDasharray="4 6" strokeOpacity="0.1" strokeWidth="0.8" />
            <path d="M-20,460 C120,430 240,510 390,470 C510,420 580,520 640,480" fill="none" stroke="#aac7ff" strokeDasharray="2 4" strokeOpacity="0.08" strokeWidth="0.8" />

            {/* Dynamic mesh vectors if multiple beacons exist */}
            {dynamicBeacons.length >= 2 && (
              <polyline
                points={dynamicBeacons.map(b => `${b.pos.left},${b.pos.top}`).join(' ')}
                fill="none"
                stroke="#aac7ff"
                strokeDasharray="4 4"
                strokeOpacity="0.3"
                strokeWidth="1.2"
              />
            )}

            {/* Simulated Active Route path when navigating */}
            {isNavigating && selectedBeacon && (
              <line
                x1="50%"
                y1="50%"
                x2={selectedBeacon.pos.left}
                y2={selectedBeacon.pos.top}
                stroke="#3e90ff"
                strokeWidth="3.5"
                strokeDasharray="8 4"
                className="animate-pulse"
              />
            )}
          </svg>
        )}

        {/* User's Current GPS Location Dot */}
        {(() => {
          const latSpan = 0.04;
          const lngSpan = 0.04;
          const userTop = userLocation ? Math.max(10, Math.min(90, 50 - ((userLocation.latitude - centerLat) / latSpan) * 36)) : 50;
          const userLeft = userLocation ? Math.max(10, Math.min(90, 50 + ((userLocation.longitude - centerLng) / lngSpan) * 36)) : 50;

          return (
            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-500"
              style={{ top: `${userTop}%`, left: `${userLeft}%` }}
            >
              <div className="relative flex items-center justify-center w-10 h-10">
                <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-[#3e90ff] opacity-40" />
                <span className="relative flex items-center justify-center w-5 h-5 rounded-full bg-[#1c1b1b] shadow-lg border-2 border-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3e90ff] shadow-[0_0_10px_#3e90ff]" />
                </span>
              </div>
              <span className="absolute top-9 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#131313]/90 backdrop-blur-md text-[#aac7ff] font-semibold text-[10px] whitespace-nowrap shadow-md border border-[#3e90ff]/40">
                {userLocation ? `My GPS (±${userLocation.accuracy ?? 10}m)` : 'My Location'}
              </span>
            </div>
          );
        })()}

        {/* Real Dynamic Incident Beacons */}
        {dynamicBeacons.map((beacon) => {
          const isSelected = selectedBeacon?.id === beacon.id;
          const isCritical = beacon.type === 'critical';
          const isAmber = beacon.type === 'amber';

          return (
            <button
              key={beacon.id}
              aria-label={`Incident: ${beacon.title}`}
              onClick={() => {
                setSelectedBeaconId(beacon.id);
                setIsSheetCollapsed(false);
              }}
              style={{
                top: beacon.pos.top,
                left: beacon.pos.left,
              }}
              className={`group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none cursor-pointer z-15 transition-transform ${
                isSelected ? 'scale-125 z-25' : 'hover:scale-110'
              }`}
              type="button"
            >
              <span className="relative flex items-center justify-center w-11 h-11">
                {isCritical && (
                  <>
                    <span className="absolute w-12 h-12 rounded-full bg-[#ffb4ab]/30 animate-ping" />
                    <span className="absolute w-8 h-8 rounded-full bg-[#93000a]/50" />
                    <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#1c1b1b] shadow-2xl border-2 border-[#ffb4ab]">
                      <span className="w-3 h-3 rounded-full bg-[#ef4444] shadow-[0_0_16px_#ef4444] animate-pulse" />
                    </span>
                  </>
                )}
                {isAmber && (
                  <>
                    <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-amber-500 opacity-40" />
                    <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#1c1b1b] shadow-lg border-2 border-amber-400">
                      <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_12px_#f59e0b]" />
                    </span>
                  </>
                )}
                {!isCritical && !isAmber && (
                  <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#3e90ff]/20 backdrop-blur-sm border-2 border-[#aac7ff]">
                    <span className="w-3 h-3 rounded-full bg-[#aac7ff] shadow-[0_0_12px_#3e90ff]" />
                  </span>
                )}
              </span>
              <span
                className={`absolute top-10 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full backdrop-blur-md text-[10.5px] whitespace-nowrap shadow-md border font-semibold ${
                  isCritical
                    ? 'bg-[#93000a]/95 text-[#ffdad6] border-[#ffb4ab]/40'
                    : isAmber
                    ? 'bg-[#1c1b1b]/95 text-amber-300 border-amber-500/40'
                    : 'bg-[#1c1b1b]/95 text-[#aac7ff] border-[#3e90ff]/40'
                }`}
              >
                {beacon.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty State Banner when no incidents in Dexie */}
      {dynamicBeacons.length === 0 && (
        <div className="absolute top-20 inset-x-4 z-20 flex flex-col items-center justify-center py-4 px-5 rounded-2xl bg-[#1c1b1b]/90 backdrop-blur-md border border-[#2a2a2a] text-center shadow-xl">
          <div className="w-9 h-9 rounded-full bg-[#201f1f] flex items-center justify-center text-[#8b91a0] mb-2">
            <span className="material-symbols-outlined text-[20px]">radar</span>
          </div>
          <span className="text-[13px] font-bold text-[#e5e2e1] uppercase tracking-wider mb-0.5">
            No reported incidents nearby
          </span>
          <p className="text-[11.5px] text-[#8b91a0] max-w-[260px] leading-relaxed">
            Perimeter clear. Reports created on this node or received via mesh will populate here in real-time.
          </p>
        </div>
      )}

      {/* Top Gradient Scrim */}
      <div className="pointer-events-none absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-[#131313]/90 via-[#131313]/40 to-transparent" />

      {/* Top Controls Header */}
      <div className="absolute top-3 inset-x-3 flex flex-col gap-2 z-20 pointer-events-none">
        <div className="flex items-center justify-between w-full">
          {/* Status Chip */}
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1b1b]/95 backdrop-blur-xl shadow-lg border border-[#2a2a2a]">
            <span className="w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
            <span className="text-[12px] text-[#e5e2e1] font-semibold">Offline Tactical Map</span>
          </div>

          {/* Right Controls Stack */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            {/* Zoom In Button */}
            <button
              aria-label="Zoom in"
              onClick={handleZoomIn}
              className="w-9 h-9 rounded-xl bg-[#1c1b1b]/90 backdrop-blur-xl shadow-md flex items-center justify-center text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a]"
              type="button"
              title="Zoom in"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>

            {/* Zoom Out Button */}
            <button
              aria-label="Zoom out"
              onClick={handleZoomOut}
              className="w-9 h-9 rounded-xl bg-[#1c1b1b]/90 backdrop-blur-xl shadow-md flex items-center justify-center text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a]"
              type="button"
              title="Zoom out"
            >
              <span className="material-symbols-outlined text-[18px]">remove</span>
            </button>

            {/* Search Pill */}
            {dynamicBeacons.length > 0 && (
              <button
                aria-label="Search map"
                onClick={() => setShowSearch(!showSearch)}
                className={`w-9 h-9 rounded-xl backdrop-blur-xl shadow-md flex items-center justify-center transition-all active:scale-95 cursor-pointer border ${
                  showSearch ? 'bg-[#3e90ff] text-[#002957] border-[#3e90ff]' : 'bg-[#1c1b1b]/90 text-[#e5e2e1] hover:bg-[#2a2a2a] border-[#2a2a2a]'
                }`}
                type="button"
                title="Search Beacons"
              >
                <span className="material-symbols-outlined text-[18px]">search</span>
              </button>
            )}

            {/* Layers Pill */}
            <button
              aria-label="Toggle tactical layers"
              onClick={() => {
                setShowLayers(!showLayers);
                onShowToast(showLayers ? 'Vector overlay hidden' : 'Topographic contours displayed');
              }}
              className={`w-9 h-9 rounded-xl backdrop-blur-xl shadow-md flex items-center justify-center transition-all active:scale-95 cursor-pointer border ${
                showLayers ? 'bg-[#2a2a2a] text-[#aac7ff] border-[#3e90ff]/50' : 'bg-[#1c1b1b]/90 text-[#8b91a0] border-[#2a2a2a]'
              }`}
              id="layer-btn"
              type="button"
              title="Toggle Grid & Contours"
            >
              <span className="material-symbols-outlined text-[18px]">layers</span>
            </button>

            {/* Use My Location / GPS Pill */}
            <button
              aria-label="Use My Location"
              onClick={handleRecenter}
              className={`w-9 h-9 rounded-xl bg-[#1c1b1b]/90 backdrop-blur-xl shadow-md flex items-center justify-center text-[#aac7ff] hover:bg-[#2a2a2a] transition-all active:scale-95 cursor-pointer border border-[#2a2a2a] ${
                isSpinningRecenter ? 'rotate-180 duration-500' : ''
              }`}
              id="recenter-btn"
              type="button"
              title="Use My Location"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                my_location
              </span>
            </button>
          </div>
        </div>

        {/* Quick Beacon Switcher Carousel (when incidents exist) */}
        {dynamicBeacons.length > 0 && (
          <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {dynamicBeacons.map((beacon) => {
              const isSelected = beacon.id === selectedBeacon?.id;
              return (
                <button
                  key={beacon.id}
                  onClick={() => {
                    setSelectedBeaconId(beacon.id);
                    setIsSheetCollapsed(false);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap cursor-pointer border shadow-sm ${
                    isSelected
                      ? beacon.type === 'critical'
                        ? 'bg-[#93000a] text-[#ffdad6] border-[#ffb4ab]/60'
                        : beacon.type === 'amber'
                        ? 'bg-amber-950 text-amber-200 border-amber-400/60'
                        : 'bg-[#002957] text-[#aac7ff] border-[#3e90ff]/60'
                      : 'bg-[#1c1b1b]/90 text-[#c0c6d6] border-[#2a2a2a] hover:bg-[#2a2a2a]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    beacon.type === 'critical' ? 'bg-[#ffb4ab]' : beacon.type === 'amber' ? 'bg-amber-400' : 'bg-[#3e90ff]'
                  }`} />
                  <span>{beacon.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Search Overlay */}
      {showSearch && dynamicBeacons.length > 0 && (
        <div className="absolute top-20 inset-x-3 z-30 bg-[#1c1b1b]/95 backdrop-blur-2xl rounded-2xl p-3 shadow-2xl border border-[#2a2a2a]">
          <div className="flex items-center gap-2 bg-[#131313] px-3 py-1.5 rounded-xl border border-[#2a2a2a]">
            <span className="material-symbols-outlined text-[18px] text-[#8b91a0]">search</span>
            <input
              type="text"
              placeholder="Search active incidents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#e5e2e1] placeholder-[#8b91a0] focus:outline-none"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#8b91a0] text-xs cursor-pointer">Clear</button>
            )}
          </div>
          <div className="mt-2 space-y-1 max-h-36 overflow-y-auto">
            {filteredBeacons.map(b => (
              <div
                key={b.id}
                onClick={() => {
                  setSelectedBeaconId(b.id);
                  setShowSearch(false);
                  setIsSheetCollapsed(false);
                }}
                className="p-2 rounded-lg hover:bg-[#2a2a2a] text-xs text-[#e5e2e1] flex items-center justify-between cursor-pointer"
              >
                <span className="font-medium">{b.title}</span>
                <span className="text-[10px] text-[#c0c6d6] font-mono">{b.distance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Bottom Sheet */}
      <div className="mt-auto z-30 w-full px-2.5 pb-2.5">
        <div className="w-full max-w-md mx-auto rounded-3xl bg-[#1c1b1b]/95 backdrop-blur-2xl shadow-[0_15px_40px_rgba(0,0,0,0.7)] p-4 transition-all duration-300 ease-out border border-[#2a2a2a]">
          {selectedBeacon ? (
            <>
              {/* Tactile Drag & Toggle Handle */}
              <button
                onClick={() => setIsSheetCollapsed(!isSheetCollapsed)}
                className="w-full flex items-center justify-center py-1 -mt-1 mb-2 group cursor-pointer focus:outline-none"
                title={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <div className="w-10 h-1 rounded-full bg-[#414754] group-hover:bg-[#aac7ff] transition-colors" />
              </button>

              {/* Collapsed Compact State */}
              {isSheetCollapsed ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      selectedBeacon.type === 'critical' ? 'bg-[#ffb4ab] animate-pulse' : selectedBeacon.type === 'amber' ? 'bg-amber-400' : 'bg-[#3e90ff]'
                    }`} />
                    <div className="flex flex-col truncate">
                      <span className="text-[14px] font-bold text-[#e5e2e1] truncate">{selectedBeacon.title}</span>
                      <span className="text-[11px] text-[#c0c6d6]">{selectedBeacon.sector} · {selectedBeacon.distance}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleToggleNav}
                      className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1 cursor-pointer ${
                        isNavigating ? 'bg-[#00531a] text-[#6cff82]' : 'bg-[#3e90ff] text-[#002957]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">near_me</span>
                      <span>{isNavigating ? 'Navigating' : 'Navigate'}</span>
                    </button>
                    <button
                      onClick={() => setIsSheetCollapsed(false)}
                      className="w-8 h-8 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center cursor-pointer"
                      title="Expand"
                    >
                      <span className="material-symbols-outlined text-[18px]">expand_less</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Expanded Full State */
                <>
                  {/* Incident Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          selectedBeacon.type === 'critical' ? 'bg-[#ffb4ab] animate-pulse' : selectedBeacon.type === 'amber' ? 'bg-amber-400' : 'bg-[#3e90ff]'
                        }`} />
                        <span className="text-[17px] text-[#e5e2e1] font-bold tracking-tight">
                          {selectedBeacon.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-[#c0c6d6]">
                        <span>{selectedBeacon.sector}</span>
                        <span className="text-[#8b91a0]">•</span>
                        <span>{selectedBeacon.distance}</span>
                        <span className="text-[#8b91a0]">•</span>
                        <span className="text-[#e5e2e1] font-semibold">{selectedBeacon.walkTime}</span>
                      </div>
                    </div>

                    {/* Threat Level Indicator Pill */}
                    <div className={`px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shrink-0 ${
                      selectedBeacon.type === 'critical'
                        ? 'bg-[#93000a] text-[#ffdad6]'
                        : selectedBeacon.type === 'amber'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                        : 'bg-[#002957] text-[#aac7ff]'
                    }`}>
                      <span className="material-symbols-outlined text-[13px]">
                        {selectedBeacon.type === 'critical' ? 'e911_emergency' : 'warning'}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {selectedBeacon.threatLevel}
                      </span>
                    </div>
                  </div>

                  {/* Live Mesh Responder Status Bar */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#201f1f] mb-3 border border-[#2a2a2a]/60">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {selectedBeacon.responders.initials.map((init, idx) => (
                          <div
                            key={idx}
                            className={`inline-flex h-5 w-5 rounded-full text-[10px] items-center justify-center font-bold border border-[#131313] ${
                              idx === 0
                                ? 'bg-[#3e90ff] text-[#002957]'
                                : idx === 1
                                ? 'bg-[#00a73e] text-[#00320d]'
                                : 'bg-[#3a3939] text-[#e5e2e1]'
                            }`}
                          >
                            {init}
                          </div>
                        ))}
                      </div>
                      <span className="text-[12px] text-[#e5e2e1] font-medium truncate">
                        {selectedBeacon.responders.countText}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[#47e266] text-[11px] font-medium shrink-0">
                      <span className="material-symbols-outlined text-[15px]">signal_cellular_alt</span>
                      <span>Mesh Sync</span>
                    </div>
                  </div>

                  {/* Actionable Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Main Navigation Button */}
                    <button
                      onClick={handleToggleNav}
                      className={`flex-1 h-11 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer ${
                        isNavigating
                          ? 'bg-[#00531a] text-[#6cff82] shadow-[#47e266]/20'
                          : 'bg-[#3e90ff] text-[#002957] shadow-[#3e90ff]/20'
                      }`}
                      id="start-nav-btn"
                      type="button"
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] transition-transform ${isNavigating ? 'rotate-45' : ''}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        near_me
                      </span>
                      <span>{isNavigating ? 'Navigating (Active)' : 'Start Offline Navigation'}</span>
                    </button>

                    {/* Ping / Dispatch Quick Action Button */}
                    <button
                      aria-label="Ping Responders"
                      onClick={handlePingResponders}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0 ${
                        pingActive
                          ? 'bg-[#47e266] text-[#003910]'
                          : 'bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#3a3939]'
                      }`}
                      id="ping-responders-btn"
                      type="button"
                      title="Ping Responders"
                    >
                      <span className="material-symbols-outlined text-[20px]">contactless</span>
                    </button>

                    {/* Context Share / Info Button */}
                    <button
                      aria-label="More details"
                      onClick={() => setShowInfoModal(true)}
                      className="w-11 h-11 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center hover:bg-[#3a3939] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                      type="button"
                      title="Beacon Details"
                    >
                      <span className="material-symbols-outlined text-[20px]">info</span>
                    </button>

                    {/* Quick Collapse Button */}
                    <button
                      aria-label="Collapse panel"
                      onClick={() => setIsSheetCollapsed(true)}
                      className="w-11 h-11 rounded-xl bg-[#201f1f] text-[#8b91a0] hover:text-[#e5e2e1] flex items-center justify-center hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                      type="button"
                      title="Minimize Panel"
                    >
                      <span className="material-symbols-outlined text-[20px]">expand_more</span>
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Standby Card when no active incidents */
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#201f1f] flex items-center justify-center text-[#47e266]">
                  <span className="material-symbols-outlined text-[18px]">explore</span>
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-[#e5e2e1]">Tactical Grid Active</h4>
                  <p className="text-[11px] text-[#8b91a0]">
                    {userLocation
                      ? `GPS: ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`
                      : 'GPS Ready · Standby for mesh beacons'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleRecenter}
                className="px-3 py-1.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#aac7ff] text-xs font-semibold flex items-center gap-1 cursor-pointer border border-[#3e90ff]/30"
              >
                <span className="material-symbols-outlined text-[15px]">my_location</span>
                <span>Use My Location</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Details Modal */}
      {showInfoModal && selectedBeacon && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-xs p-5 shadow-2xl text-xs space-y-3 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-[#2a2a2a] pb-2">
              <span className="font-bold text-[15px] text-[#e5e2e1]">{selectedBeacon.title}</span>
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#c0c6d6] hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <div className="space-y-2 text-[#c0c6d6]">
              <div className="flex justify-between">
                <span className="text-[#8b91a0]">Sector:</span>
                <span className="font-medium text-[#e5e2e1]">{selectedBeacon.sector}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8b91a0]">Classification:</span>
                <span className="font-medium text-[#e5e2e1]">{selectedBeacon.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8b91a0]">Distance &amp; ETA:</span>
                <span className="font-medium text-[#e5e2e1]">{selectedBeacon.distance} ({selectedBeacon.walkTime})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8b91a0]">Threat Rating:</span>
                <span className="font-semibold text-[#ffb4ab]">{selectedBeacon.threatLevel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8b91a0]">Encryption:</span>
                <span className="font-mono text-[#aac7ff]">AES-256 Mesh Local</span>
              </div>
            </div>
            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  setShowInfoModal(false);
                  handleToggleNav();
                }}
                className="flex-1 py-2.5 bg-[#3e90ff] hover:bg-[#3e90ff]/90 text-[#002957] rounded-xl font-bold cursor-pointer"
              >
                {isNavigating ? 'Stop Navigation' : 'Start Navigation'}
              </button>
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2.5 bg-[#2a2a2a] hover:bg-[#3a3939] text-[#e5e2e1] rounded-xl font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
