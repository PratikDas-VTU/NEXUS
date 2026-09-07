import React, { useState } from 'react';
import { MapPin, RefreshCw, X, AlertTriangle, ShieldCheck, ExternalLink, Edit3, Check } from 'lucide-react';
import { GeolocationCoordinates, LocationState, formatCoordinates, isInsecureLanOrigin } from '../services/api/geolocation';

interface LocationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: GeolocationCoordinates | null;
  locationState: LocationState;
  locationError: string | null;
  onRefreshGps: () => Promise<any>;
  onSetManualLocation: (lat: number, lng: number) => void;
}

export const LocationDetailsModal: React.FC<LocationDetailsModalProps> = ({
  isOpen,
  onClose,
  location,
  locationState,
  locationError,
  onRefreshGps,
  onSetManualLocation,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditingManual, setIsEditingManual] = useState(false);
  const [manualLat, setManualLat] = useState(location ? location.latitude.toString() : '12.9716');
  const [manualLng, setManualLng] = useState(location ? location.longitude.toString() : '77.5946');
  const [inputError, setInputError] = useState('');

  if (!isOpen) return null;

  const isInsecure = isInsecureLanOrigin();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshGps();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError('');
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setInputError('Latitude must be between -90 and 90');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setInputError('Longitude must be between -180 and 180');
      return;
    }

    onSetManualLocation(lat, lng);
    setIsEditingManual(false);
  };

  const handleSwitchToHttps = () => {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.href.replace('http:', 'https:');
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#3e90ff]/20 flex items-center justify-center text-[#3e90ff]">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#e5e2e1]">Tactical Location Status</h3>
              <p className="text-[10px] text-[#8b91a0]">Zero-Cloud Hardware GPS Core</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex items-center justify-center text-[#c0c6d6] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* State Badge & Main Metric */}
        <div className="p-3.5 rounded-2xl bg-[#131313] border border-[#2a2a2a] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#8b91a0] font-medium">Capture Mode</span>
            {locationState === 'LIVE' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#152a1b] text-[#47e266] border border-[#2f6f3a]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#47e266] animate-pulse" />
                LIVE GPS
              </span>
            )}
            {locationState === 'ACQUIRING' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#2a2415] text-[#ffb84e] border border-[#6b4e1b]">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                ACQUIRING...
              </span>
            )}
            {locationState === 'CACHED' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#262118] text-[#ffb84e] border border-[#634e26]">
                📦 LAST KNOWN / CACHED
              </span>
            )}
            {locationState === 'MANUAL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1f232d] text-[#aac7ff] border border-[#2f3952]">
                ✎ MANUAL OVERRIDE
              </span>
            )}
            {(locationState === 'DENIED' || locationState === 'UNAVAILABLE' || locationState === 'IDLE') && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#2c1515] text-[#ffb4ab] border border-[#662020]">
                ⚠️ LOCATION UNAVAILABLE
              </span>
            )}
          </div>

          {location ? (
            <div className="mt-1">
              <div className="font-mono text-base font-bold text-[#e5e2e1] tracking-tight">
                {formatCoordinates(location.latitude, location.longitude, 5)}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-[#8b91a0]">
                {location.accuracy ? (
                  <span>Accuracy: ±{location.accuracy} m</span>
                ) : (
                  <span>Accuracy: N/A</span>
                )}
                <span>•</span>
                <span>
                  {new Date(location.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#8b91a0] italic py-1">
              No coordinates currently acquired. Tap Refresh GPS or enter manually below.
            </div>
          )}

          {locationError && (
            <div className="p-2 rounded-xl bg-[#2c1515]/60 border border-[#662020] text-[#ffb4ab] text-[11px] flex items-start gap-1.5 mt-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{locationError}</span>
            </div>
          )}
        </div>

        {/* Insecure Origin Notice if accessed via http://<IP>:3000 */}
        {isInsecure && (
          <div className="p-3 rounded-2xl bg-[#231b12] border border-[#5d3f1a] text-xs flex flex-col gap-2">
            <div className="flex items-start gap-2 text-[#ffb84e]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[11px]">Chrome Mobile LAN Security Notice</div>
                <p className="text-[10px] text-[#dec2a5] leading-tight mt-0.5">
                  Mobile Chrome blocks hardware GPS over plain HTTP for network IPs.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSwitchToHttps}
                className="flex-1 py-1.5 px-2 rounded-xl bg-[#ffb84e] text-[#2c1600] font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer hover:bg-[#ffb84e]/90"
              >
                <ExternalLink className="w-3 h-3" />
                Switch to HTTPS
              </button>
            </div>
          </div>
        )}

        {/* Manual Edit Form */}
        {isEditingManual ? (
          <form onSubmit={handleSaveManual} className="p-3 rounded-2xl bg-[#131313] border border-[#2a2a2a] flex flex-col gap-2.5">
            <div className="text-xs font-semibold text-[#e5e2e1]">Enter Coordinates Manually</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#8b91a0] block mb-1">Latitude</label>
                <input
                  type="text"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="12.9716"
                  className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-2.5 py-1.5 text-xs text-[#e5e2e1] font-mono focus:border-[#3e90ff] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#8b91a0] block mb-1">Longitude</label>
                <input
                  type="text"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="77.5946"
                  className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-2.5 py-1.5 text-xs text-[#e5e2e1] font-mono focus:border-[#3e90ff] focus:outline-none"
                />
              </div>
            </div>
            {inputError && <span className="text-[#ffb4ab] text-[10px]">{inputError}</span>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditingManual(false)}
                className="flex-1 py-1.5 rounded-xl bg-[#2a2a2a] text-[#c0c6d6] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-1.5 rounded-xl bg-[#3e90ff] text-[#002957] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Save Position
              </button>
            </div>
          </form>
        ) : null}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex-1 py-2 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh GPS</span>
          </button>
          {!isEditingManual && (
            <button
              type="button"
              onClick={() => setIsEditingManual(true)}
              className="flex-1 py-2 rounded-xl bg-[#1c1b1b] border border-[#2a2a2a] hover:border-[#3e90ff]/50 text-[#c0c6d6] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Enter Manually</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
