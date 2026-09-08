import React, { useState } from 'react';
import { MapPin, Navigation, ShieldCheck, AlertTriangle, Check, RefreshCw, ExternalLink } from 'lucide-react';
import { GeolocationCoordinates, LocationState, formatCoordinates, isInsecureLanOrigin, getCampusFallbackPosition } from '../services/api/geolocation';

interface LocationPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: GeolocationCoordinates | null;
  locationState: LocationState;
  locationError: string | null;
  onRequestLocation: () => Promise<any>;
  onSetManualLocation: (lat: number, lng: number) => void;
}

export const LocationPromptModal: React.FC<LocationPromptModalProps> = ({
  isOpen,
  onClose,
  location,
  locationState,
  locationError,
  onRequestLocation,
  onSetManualLocation,
}) => {
  const [isRequesting, setIsRequesting] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState('13.2384');
  const [manualLng, setManualLng] = useState('80.0094');

  if (!isOpen) return null;

  const isInsecure = isInsecureLanOrigin();

  const handleAllowGps = async () => {
    setIsRequesting(true);
    try {
      await onRequestLocation();
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSetCampusFix = () => {
    const campusPos = getCampusFallbackPosition();
    onSetManualLocation(campusPos.latitude, campusPos.longitude);
    onClose();
  };

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat) || 13.2384;
    const lng = parseFloat(manualLng) || 80.0094;
    onSetManualLocation(lat, lng);
    onClose();
  };

  const handleSwitchToHttps = () => {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.href.replace('http:', 'https:');
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#15171a] border border-[#22262b] rounded-2xl w-full max-w-sm p-4 sm:p-5 shadow-2xl flex flex-col gap-3.5 animate-in fade-in zoom-in duration-150">
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center gap-1.5 pt-0.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-zinc-100 tracking-tight">
              Enable Physical GPS Location
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Offline Emergency Distress Geotagging
            </p>
          </div>
        </div>

        {/* Clear Explanation */}
        <div className="p-3 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col gap-2 text-xs">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              NEXUS captures your physical coordinates via on-device GPS hardware so emergency beacons include precise rescue perimeters.
            </p>
          </div>
          <div className="flex items-start gap-2 border-t border-[#1f2328] pt-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-1.5" />
            <p className="text-zinc-400 text-[10px] leading-relaxed">
              <strong className="text-zinc-200">Offline Guarantee:</strong> No data is sent to external mapping clouds. All coordinates are stored locally on your device vault.
            </p>
          </div>
        </div>

        {/* Live GPS Feedback if already acquired */}
        {locationState === 'LIVE' && location && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold">
              <Check className="w-4 h-4" />
              <span>📍 LIVE GPS ACQUIRED</span>
            </div>
            <div className="font-mono text-sm font-bold text-zinc-100 mt-0.5">
              {formatCoordinates(location.latitude, location.longitude, 5)}
            </div>
            <div className="text-[10px] text-zinc-400">
              Accuracy: ±{location.accuracy ?? 10} m • Captured via Device Hardware
            </div>
          </div>
        )}

        {/* Cached Location Notice */}
        {locationState === 'CACHED' && location && (
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex flex-col gap-1">
            <div className="text-amber-300 text-xs font-bold flex items-center gap-1.5">
              <span>📦 LAST KNOWN / CACHED LOCATION</span>
            </div>
            <div className="font-mono text-sm font-bold text-zinc-100 mt-0.5">
              {formatCoordinates(location.latitude, location.longitude, 5)}
            </div>
            <div className="text-[10px] text-amber-200/80">
              Stored from previous offline session. Tap Refresh GPS to update.
            </div>
          </div>
        )}

        {/* Insecure Origin Notice if on http://<IP>:3000 */}
        {isInsecure && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex flex-col gap-1.5">
            <div className="flex items-start gap-1.5 text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[11px] font-bold">Insecure Origin Detected (`http://`)</div>
            </div>
            <p className="text-[10px] text-zinc-300 leading-tight">
              Chrome requires HTTPS to unlock hardware GPS on LAN IP addresses. You can switch to HTTPS or use manual coordinates.
            </p>
            <button
              type="button"
              onClick={handleSwitchToHttps}
              className="mt-1 py-1 px-2 rounded-lg bg-amber-400 text-zinc-950 font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              Switch to HTTPS (`https://${typeof window !== 'undefined' ? window.location.host : ''}`)
            </button>
          </div>
        )}

        {/* Error message */}
        {locationError && locationState !== 'LIVE' && !isInsecure && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{locationError}</span>
          </div>
        )}

        {/* Manual Fallback Input Form */}
        {manualMode && (
          <form onSubmit={handleSaveManual} className="p-3 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-zinc-200">Manual Fallback Coordinates</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="Latitude"
                className="bg-[#15171a] border border-[#22262b] rounded-lg px-2.5 py-1 text-xs text-zinc-100 font-mono focus:outline-none"
              />
              <input
                type="text"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="Longitude"
                className="bg-[#15171a] border border-[#22262b] rounded-lg px-2.5 py-1 text-xs text-zinc-100 font-mono focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
            >
              Save & Enter Console
            </button>
          </form>
        )}

        {/* Primary Action Buttons */}
        <div className="flex flex-col gap-2 pt-0.5">
          {locationState === 'LIVE' ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Enter NEXUS Console</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSetCampusFix}
                className="w-full py-2.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs"
              >
                <span>📍</span>
                <span>1-Tap Set Campus GPS Fix (Amrita Hub)</span>
              </button>

              <button
                type="button"
                onClick={handleAllowGps}
                disabled={isRequesting}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
              >
                {isRequesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Acquiring GPS Signal...</span>
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4" />
                    <span>Allow GPS Location</span>
                  </>
                )}
              </button>

              <div className="flex gap-2">
                {!manualMode ? (
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-[11px] cursor-pointer"
                  >
                    Enter Manually
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 rounded-xl bg-transparent border border-[#22262b] text-zinc-400 hover:text-zinc-200 font-medium text-[11px] cursor-pointer"
                >
                  Skip for Now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
