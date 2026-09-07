import React, { useState } from 'react';
import { X, MapPin, AlertTriangle, CheckCircle2, RefreshCw, User, ShieldAlert } from 'lucide-react';
import type { DraftIncident, IncidentType, IncidentPriority } from '../../../shared/types';
import { getCurrentPosition, formatCoordinates } from '../services/api/geolocation';

interface EmergencyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: DraftIncident) => Promise<void>;
  isInternetConnected?: boolean;
}

type NeedCategory = 'medical' | 'food' | 'water' | 'shelter' | 'rescue' | 'safety' | 'other';

const NEED_CONFIG: Record<NeedCategory, { label: string; icon: string; defaultType: IncidentType; defaultPriority: IncidentPriority }> = {
  medical: { label: 'Medical', icon: 'medical_services', defaultType: 'medical', defaultPriority: 'P0' },
  rescue: { label: 'Rescue', icon: 'person_alert', defaultType: 'trapped', defaultPriority: 'P0' },
  water: { label: 'Water', icon: 'water_drop', defaultType: 'resource', defaultPriority: 'P2' },
  food: { label: 'Food', icon: 'lunch_dining', defaultType: 'resource', defaultPriority: 'P2' },
  shelter: { label: 'Shelter', icon: 'night_shelter', defaultType: 'shelter', defaultPriority: 'P2' },
  safety: { label: 'Safety', icon: 'security', defaultType: 'safety', defaultPriority: 'P1' },
  other: { label: 'Other', icon: 'help', defaultType: 'safety', defaultPriority: 'P1' },
};

export const EmergencyReportModal: React.FC<EmergencyReportModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isInternetConnected = false,
}) => {
  const [selectedNeed, setSelectedNeed] = useState<NeedCategory>('medical');
  const [urgency, setUrgency] = useState<IncidentPriority>('P0');
  const [peopleAffected, setPeopleAffected] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  
  // Location state
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'manual'>('idle');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [manualLat, setManualLat] = useState<string>('12.9716');
  const [manualLng, setManualLng] = useState<string>('77.5946');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  if (!isOpen) return null;

  const handleSelectNeed = (need: NeedCategory) => {
    setSelectedNeed(need);
    setUrgency(NEED_CONFIG[need].defaultPriority);
  };

  const handleGetLocation = async () => {
    setLocationStatus('loading');
    setLocationError('');
    setFormError('');

    const res = await getCurrentPosition();
    if (res.success && res.coords) {
      setCoords({
        latitude: res.coords.latitude,
        longitude: res.coords.longitude,
        accuracy: res.coords.accuracy,
      });
      setLocationStatus('success');
    } else {
      setLocationError(res.error || 'Failed to obtain GPS fix.');
      setLocationStatus('error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    let finalLat: number | undefined;
    let finalLng: number | undefined;

    if (locationStatus === 'success' && coords) {
      finalLat = coords.latitude;
      finalLng = coords.longitude;
    } else if (locationStatus === 'manual') {
      const lat = parseFloat(manualLat);
      const lng = parseFloat(manualLng);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        setFormError('Please enter a valid latitude (-90 to +90).');
        return;
      }
      if (isNaN(lng) || lng < -180 || lng > 180) {
        setFormError('Please enter a valid longitude (-180 to +180).');
        return;
      }
      finalLat = lat;
      finalLng = lng;
    } else {
      setFormError('Location is required. Tap "Use My Location" or "Enter Location Manually".');
      return;
    }

    const needInfo = NEED_CONFIG[selectedNeed];
    const draft: DraftIncident = {
      type: needInfo.defaultType,
      priority: urgency,
      latitude: finalLat,
      longitude: finalLng,
      peopleAffected: Math.max(1, peopleAffected),
      description: description.trim() || `${needInfo.label} Emergency assistance requested via NEXUS broadcast channel.`,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(draft);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to broadcast incident.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
      <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-2xl w-full max-w-sm sm:max-w-md my-auto shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between bg-[#131313]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#93000a]/40 border border-[#ffb4ab]/30 flex items-center justify-center text-[#ffb4ab]">
              <span className="material-symbols-outlined text-[18px]">podcasts</span>
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[#e5e2e1] leading-none">
                Broadcast Emergency Report
              </h2>
              <span className="text-[10.5px] text-[#8b91a0] font-medium">
                {isInternetConnected ? 'Dual Relay: Local Mesh + Cloud Uplink' : 'Offline Mode: Local P2P Mesh Relay'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] text-[#c0c6d6] hover:text-[#e5e2e1] flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5 text-xs">
          {formError && (
            <div className="p-2.5 rounded-lg bg-[#93000a]/30 border border-[#ffb4ab]/40 text-[#ffdad6] text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#ffb4ab] shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. What Do You Need? */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff]">
              What Do You Need?
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(NEED_CONFIG) as NeedCategory[]).map((key) => {
                const config = NEED_CONFIG[key];
                const isSelected = selectedNeed === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectNeed(key)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#3e90ff]/20 border-[#3e90ff] text-[#aac7ff] shadow-xs'
                        : 'bg-[#131313] border-[#2a2a2a] text-[#8b91a0] hover:text-[#e5e2e1] hover:border-[#353534]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] mb-0.5">
                      {config.icon}
                    </span>
                    <span>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Urgency Level */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff]">
              Urgency
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setUrgency('P0')}
                className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  urgency === 'P0'
                    ? 'bg-[#93000a] text-[#ffdad6] border-[#ffb4ab]'
                    : 'bg-[#131313] border-[#2a2a2a] text-[#8b91a0]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#ffb4ab] animate-pulse" />
                <span>P0 Critical</span>
              </button>

              <button
                type="button"
                onClick={() => setUrgency('P1')}
                className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  urgency === 'P1'
                    ? 'bg-amber-950 text-amber-200 border-amber-400'
                    : 'bg-[#131313] border-[#2a2a2a] text-[#8b91a0]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>P1 Urgent</span>
              </button>

              <button
                type="button"
                onClick={() => setUrgency('P2')}
                className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  urgency === 'P2'
                    ? 'bg-[#002957] text-[#aac7ff] border-[#3e90ff]'
                    : 'bg-[#131313] border-[#2a2a2a] text-[#8b91a0]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#3e90ff]" />
                <span>P2 Normal</span>
              </button>
            </div>
          </div>

          {/* 3. People Affected */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#131313] border border-[#2a2a2a]">
            <div className="flex flex-col">
              <span className="font-semibold text-[#e5e2e1] text-[12px]">People Affected</span>
              <span className="text-[10px] text-[#8b91a0]">Estimated number of individuals</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPeopleAffected((prev) => Math.max(1, prev - 1))}
                className="w-7 h-7 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-[#e5e2e1] font-bold flex items-center justify-center cursor-pointer active:scale-95"
              >
                -
              </button>
              <span className="w-8 text-center font-bold text-[14px] text-[#e5e2e1]">
                {peopleAffected}
              </span>
              <button
                type="button"
                onClick={() => setPeopleAffected((prev) => prev + 1)}
                className="w-7 h-7 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-[#e5e2e1] font-bold flex items-center justify-center cursor-pointer active:scale-95"
              >
                +
              </button>
            </div>
          </div>

          {/* 4. Real Location with GPS / Fallback */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff] flex items-center justify-between">
              <span>Location</span>
              {locationStatus === 'success' && coords && (
                <span className="text-[#47e266] font-normal normal-case text-[10px]">
                  ✓ GPS Locked (±{coords.accuracy}m)
                </span>
              )}
              {locationStatus === 'manual' && (
                <span className="text-amber-400 font-normal normal-case text-[10px]">
                  Manual Location
                </span>
              )}
            </label>

            {locationStatus === 'idle' && (
              <button
                type="button"
                onClick={handleGetLocation}
                className="w-full py-2.5 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#3e90ff]/40 text-[#aac7ff] font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <MapPin className="w-4 h-4 text-[#3e90ff]" />
                <span>Use My Location (GPS)</span>
              </button>
            )}

            {locationStatus === 'loading' && (
              <div className="w-full py-2.5 rounded-xl bg-[#201f1f] border border-[#2a2a2a] text-[#c0c6d6] flex items-center justify-center gap-2 font-medium">
                <RefreshCw className="w-4 h-4 animate-spin text-[#3e90ff]" />
                <span>Acquiring GPS coordinates...</span>
              </div>
            )}

            {locationStatus === 'success' && coords && (
              <div className="p-2.5 rounded-xl bg-[#122b1b] border border-[#2f6f3a] flex items-center justify-between text-[#47e266]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-bold text-[11px] text-[#e5e2e1]">GPS Location Captured</span>
                    <span className="text-[10px] text-[#c0c6d6] font-mono">
                      {formatCoordinates(coords.latitude, coords.longitude, 5)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGetLocation}
                  className="text-[10px] text-[#aac7ff] hover:underline cursor-pointer"
                >
                  Refresh
                </button>
              </div>
            )}

            {locationStatus === 'error' && (
              <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-[#291715] border border-[#5e2b24]">
                <div className="flex items-start gap-2 text-[#ffb4ab]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="font-bold text-[11px]">Location Unavailable</span>
                    <span className="text-[10px] text-[#c0c6d6]">{locationError}</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    className="flex-1 py-1.5 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] text-[#e5e2e1] text-[10.5px] font-semibold cursor-pointer"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationStatus('manual')}
                    className="flex-1 py-1.5 rounded-lg bg-[#3e90ff]/20 hover:bg-[#3e90ff]/30 text-[#aac7ff] text-[10.5px] font-semibold border border-[#3e90ff]/40 cursor-pointer"
                  >
                    Enter Manually
                  </button>
                </div>
              </div>
            )}

            {locationStatus === 'manual' && (
              <div className="p-2.5 rounded-xl bg-[#131313] border border-[#2a2a2a] flex flex-col gap-2">
                <span className="text-[10.5px] text-amber-400 font-medium">
                  Manual Coordinates (Enter Latitude &amp; Longitude)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9.5px] text-[#8b91a0] block mb-0.5">Latitude:</span>
                    <input
                      type="number"
                      step="any"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      placeholder="12.9716"
                      className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-2 py-1 text-[#e5e2e1] text-xs font-mono focus:border-[#3e90ff] focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[9.5px] text-[#8b91a0] block mb-0.5">Longitude:</span>
                    <input
                      type="number"
                      step="any"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                      placeholder="77.5946"
                      className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-lg px-2 py-1 text-[#e5e2e1] text-xs font-mono focus:border-[#3e90ff] focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGetLocation}
                  className="text-[10px] text-[#aac7ff] hover:underline self-end cursor-pointer"
                >
                  Switch to GPS
                </button>
              </div>
            )}
          </div>

          {/* 5. Optional Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff]">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Person collapsed near north gate, need AED"
              className="w-full bg-[#131313] border border-[#2a2a2a] rounded-xl px-3 py-2 text-[#e5e2e1] placeholder-[#8b91a0] focus:border-[#3e90ff] focus:outline-none"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 h-11 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-[0.99] ${
                isSubmitting
                  ? 'bg-[#93000a] text-[#ffdad6]'
                  : 'bg-[#ffb4ab] hover:bg-[#ffc2ba] text-[#690005]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Broadcasting Beacon...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">podcasts</span>
                  <span>BROADCAST EMERGENCY</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
