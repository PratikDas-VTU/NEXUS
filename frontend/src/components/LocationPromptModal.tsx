import React, { useState } from 'react';
import { MapPin, Navigation, ShieldCheck, AlertTriangle, Check, RefreshCw, ExternalLink } from 'lucide-react';
import { GeolocationCoordinates, LocationState, formatCoordinates, isInsecureLanOrigin } from '../services/api/geolocation';

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
  const [manualLat, setManualLat] = useState('12.9716');
  const [manualLng, setManualLng] = useState('77.5946');

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

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat) || 12.9716;
    const lng = parseFloat(manualLng) || 77.5946;
    onSetManualLocation(lat, lng);
    onClose();
  };

  const handleSwitchToHttps = () => {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.href.replace('http:', 'https:');
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center gap-2 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-[#3e90ff]/15 border border-[#3e90ff]/30 flex items-center justify-center text-[#3e90ff] shadow-inner">
            <Navigation className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#e5e2e1] tracking-tight">
              Enable Physical GPS Location
            </h2>
            <p className="text-[11px] text-[#8b91a0] mt-0.5">
              Offline Emergency Distress Geotagging
            </p>
          </div>
        </div>

        {/* Clear Explanation */}
        <div className="p-3.5 rounded-2xl bg-[#131313] border border-[#2a2a2a] flex flex-col gap-2 text-xs">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#47e266] shrink-0 mt-0.5" />
            <p className="text-[#c0c6d6] text-[11px] leading-relaxed">
              NEXUS captures your physical coordinates via on-device GPS hardware so emergency beacons include precise rescue perimeters.
            </p>
          </div>
          <div className="flex items-start gap-2 border-t border-[#201f1f] pt-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#3e90ff] shrink-0 mt-1.5" />
            <p className="text-[#8b91a0] text-[10px] leading-relaxed">
              <strong className="text-[#e5e2e1]">Offline Guarantee:</strong> No data is sent to external mapping clouds. All coordinates are stored locally on your device vault.
            </p>
          </div>
        </div>

        {/* Live GPS Feedback if already acquired */}
        {locationState === 'LIVE' && location && (
          <div className="p-3 rounded-2xl bg-[#152a1b] border border-[#2f6f3a] flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[#47e266] text-xs font-bold">
              <Check className="w-4 h-4" />
              <span>📍 LIVE GPS ACQUIRED</span>
            </div>
            <div className="font-mono text-sm font-bold text-[#e5e2e1] mt-0.5">
              {formatCoordinates(location.latitude, location.longitude, 5)}
            </div>
            <div className="text-[10px] text-[#8b91a0]">
              Accuracy: ±{location.accuracy ?? 10} m • Captured via Device Hardware
            </div>
          </div>
        )}

        {/* Cached Location Notice */}
        {locationState === 'CACHED' && location && (
          <div className="p-3 rounded-2xl bg-[#262118] border border-[#634e26] flex flex-col gap-1">
            <div className="text-[#ffb84e] text-xs font-bold flex items-center gap-1.5">
              <span>📦 LAST KNOWN / CACHED LOCATION</span>
            </div>
            <div className="font-mono text-sm font-bold text-[#e5e2e1] mt-0.5">
              {formatCoordinates(location.latitude, location.longitude, 5)}
            </div>
            <div className="text-[10px] text-[#dec2a5]">
              Stored from previous offline session. Tap Refresh GPS to update.
            </div>
          </div>
        )}

        {/* Insecure Origin Notice if on http://<IP>:3000 */}
        {isInsecure && (
          <div className="p-3 rounded-2xl bg-[#231b12] border border-[#5d3f1a] text-xs flex flex-col gap-1.5">
            <div className="flex items-start gap-1.5 text-[#ffb84e]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[11px] font-bold">Insecure Origin Detected (`http://`)</div>
            </div>
            <p className="text-[10px] text-[#dec2a5] leading-tight">
              Chrome requires HTTPS to unlock hardware GPS on LAN IP addresses. You can switch to HTTPS or use manual coordinates.
            </p>
            <button
              type="button"
              onClick={handleSwitchToHttps}
              className="mt-1 py-1 px-2 rounded-xl bg-[#ffb84e] text-[#2c1600] font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              Switch to HTTPS (`https://${typeof window !== 'undefined' ? window.location.host : ''}`)
            </button>
          </div>
        )}

        {/* Error message */}
        {locationError && locationState !== 'LIVE' && !isInsecure && (
          <div className="p-2.5 rounded-2xl bg-[#2c1515] border border-[#662020] text-[#ffb4ab] text-[11px] flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{locationError}</span>
          </div>
        )}

        {/* Manual Fallback Input Form */}
        {manualMode && (
          <form onSubmit={handleSaveManual} className="p-3 rounded-2xl bg-[#131313] border border-[#2a2a2a] flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-[#e5e2e1]">Manual Fallback Coordinates</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="Latitude"
                className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-2 py-1 text-xs text-[#e5e2e1] font-mono focus:outline-none"
              />
              <input
                type="text"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="Longitude"
                className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-2 py-1 text-xs text-[#e5e2e1] font-mono focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="py-1.5 rounded-xl bg-[#3e90ff] text-[#002957] font-bold text-xs cursor-pointer"
            >
              Save & Enter Console
            </button>
          </form>
        )}

        {/* Primary Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {locationState === 'LIVE' ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl bg-[#47e266] text-[#003912] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#3cd35a]"
            >
              <Check className="w-4 h-4" />
              <span>Enter NEXUS Console</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAllowGps}
                disabled={isRequesting}
                className="w-full py-2.5 rounded-2xl bg-[#3e90ff] text-[#002957] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#3e90ff]/90 disabled:opacity-50"
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
                    className="flex-1 py-2 rounded-xl bg-[#2a2a2a] text-[#c0c6d6] font-medium text-[11px] cursor-pointer hover:bg-[#353534]"
                  >
                    Enter Manually
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 rounded-xl bg-[#1c1b1b] border border-[#2a2a2a] text-[#8b91a0] hover:text-[#e5e2e1] font-medium text-[11px] cursor-pointer"
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
