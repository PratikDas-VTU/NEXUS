import React, { useState } from 'react';
import { MapPin, RefreshCw, X, AlertTriangle, ShieldCheck, ExternalLink, Edit3, Check } from 'lucide-react';
import { GeolocationCoordinates, LocationState, formatCoordinates, isInsecureLanOrigin, getCampusFallbackPosition } from '../services/api/geolocation';
import { CAMPUS_LANDMARKS } from '../services/api/geminiService';

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
  const [manualLat, setManualLat] = useState(location ? location.latitude.toString() : '13.2384');
  const [manualLng, setManualLng] = useState(location ? location.longitude.toString() : '80.0094');
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

  const handleSetCampusFix = () => {
    const campusPos = getCampusFallbackPosition();
    onSetManualLocation(campusPos.latitude, campusPos.longitude);
    setIsEditingManual(false);
  };

  const handleSwitchToHttps = () => {
    if (typeof window !== 'undefined') {
      window.location.href = window.location.href.replace('http:', 'https:');
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#15171a] border border-[#22262b] rounded-2xl w-full max-w-sm p-4 sm:p-5 shadow-2xl flex flex-col gap-3.5 animate-in fade-in zoom-in duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#22262b] pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[13.5px] font-bold text-zinc-100">Tactical Location Status</h3>
              <p className="text-[10px] text-zinc-400">Zero-Cloud Hardware GPS Core</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* State Badge & Main Metric */}
        <div className="p-3 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] text-zinc-400 font-medium">Capture Mode</span>
            {locationState === 'LIVE' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE GPS
              </span>
            )}
            {locationState === 'ACQUIRING' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                ACQUIRING...
              </span>
            )}
            {locationState === 'CACHED' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                📦 CACHED FIX
              </span>
            )}
            {locationState === 'MANUAL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                ✎ MANUAL OVERRIDE
              </span>
            )}
            {(locationState === 'DENIED' || locationState === 'UNAVAILABLE' || locationState === 'IDLE') && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
                ⚠️ UNAVAILABLE
              </span>
            )}
          </div>

          {location ? (
            <div className="mt-0.5">
              <div className="font-mono text-sm font-bold text-zinc-100 tracking-tight">
                {formatCoordinates(location.latitude, location.longitude, 5)}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-zinc-400">
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
            <div className="text-xs text-zinc-400 italic py-1">
              No coordinates currently acquired. Tap Refresh GPS or enter manually below.
            </div>
          )}

          {locationError && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[10px] flex items-start gap-1.5 mt-0.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{locationError}</span>
            </div>
          )}
        </div>

        {/* Insecure Origin Notice if accessed via http://<IP>:3000 */}
        {isInsecure && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex flex-col gap-1.5">
            <div className="flex items-start gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[11px]">Chrome Mobile LAN Security Notice</div>
                <p className="text-[10px] text-zinc-300 leading-tight mt-0.5">
                  Mobile Chrome blocks hardware GPS over plain HTTP for network IPs.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSwitchToHttps}
                className="flex-1 py-1.5 px-2 rounded-lg bg-amber-400 text-zinc-950 font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer hover:bg-amber-300"
              >
                <ExternalLink className="w-3 h-3" />
                Switch to HTTPS
              </button>
            </div>
          </div>
        )}

        {/* Manual Edit Form */}
        {isEditingManual ? (
          <form onSubmit={handleSaveManual} className="p-3 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col gap-2">
            <div className="text-xs font-semibold text-zinc-200">Enter Coordinates Manually</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9.5px] text-zinc-400 block mb-0.5">Latitude</label>
                <input
                  type="text"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="12.9716"
                  className="w-full bg-[#15171a] border border-[#22262b] rounded-lg px-2.5 py-1 text-xs text-zinc-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9.5px] text-zinc-400 block mb-0.5">Longitude</label>
                <input
                  type="text"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="77.5946"
                  className="w-full bg-[#15171a] border border-[#22262b] rounded-lg px-2.5 py-1 text-xs text-zinc-100 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            {inputError && <span className="text-red-300 text-[10px]">{inputError}</span>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditingManual(false)}
                className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Save Position
              </button>
            </div>
          </form>
        ) : null}

        {/* 1-Tap Campus Base Fix */}
        <button
          type="button"
          onClick={handleSetCampusFix}
          className="w-full py-2.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs"
        >
          <span className="text-[13px]">📍</span>
          <span>1-Tap Calibrate Campus GPS Fix (Amrita Hub)</span>
        </button>

        {/* Quick Campus Landmark Presets */}
        <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-[#111316] border border-[#1f2328]">
          <span className="text-[9.5px] text-zinc-400 font-semibold">Campus Tactical Presets:</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(CAMPUS_LANDMARKS).map(([key, lm]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSetManualLocation(lm.lat, lm.lng);
                  setIsEditingManual(false);
                }}
                className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-blue-300 border border-zinc-700 cursor-pointer active:scale-95"
              >
                {lm.label.split(' ')[0]} {lm.label.split(' ')[1] || ''}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh GPS</span>
          </button>
          {!isEditingManual && (
            <button
              type="button"
              onClick={() => setIsEditingManual(true)}
              className="flex-1 py-2 rounded-xl bg-transparent border border-[#22262b] hover:border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
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
