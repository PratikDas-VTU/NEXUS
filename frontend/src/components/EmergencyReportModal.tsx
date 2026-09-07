import React, { useState, useEffect } from 'react';
import { X, MapPin, AlertTriangle, CheckCircle2, RefreshCw, User, ShieldAlert, Edit3, Sparkles } from 'lucide-react';
import type { DraftIncident, IncidentType, IncidentPriority } from '../../../shared/types';
import { GeolocationCoordinates, LocationState, formatCoordinates, getCurrentPosition, isInsecureLanOrigin } from '../services/api/geolocation';
import { parseEmergencyWithGemini, CAMPUS_LANDMARKS, isOnlineForGemini } from '../services/api/geminiService';

interface EmergencyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: DraftIncident) => Promise<void>;
  isInternetConnected?: boolean;
  currentLocation?: GeolocationCoordinates | null;
  locationState?: LocationState;
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
  currentLocation = null,
  locationState = 'IDLE',
}) => {
  const [selectedNeed, setSelectedNeed] = useState<NeedCategory>('medical');
  const [urgency, setUrgency] = useState<IncidentPriority>('P0');
  const [peopleAffected, setPeopleAffected] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  
  // Location source priority: 1. Current LIVE GPS, 2. Last known CACHED GPS, 3. Manual
  const [locationSource, setLocationSource] = useState<'LIVE' | 'CACHED' | 'MANUAL'>('MANUAL');
  const [latInput, setLatInput] = useState<string>('13.2384');
  const [lngInput, setLngInput] = useState<string>('80.0094');
  const [accuracy, setAccuracy] = useState<number | undefined>(undefined);
  const [isRefreshingGps, setIsRefreshingGps] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [isAiParsing, setIsAiParsing] = useState<boolean>(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const handleAiAssist = async () => {
    if (!description.trim()) {
      setAiNotice('Type details below first (e.g. "Water leak at Block 1, 2 people need help")');
      return;
    }
    setIsAiParsing(true);
    setAiNotice(null);
    try {
      const result = await parseEmergencyWithGemini(description);
      if (result) {
        if (result.type) {
          const matched = (Object.keys(NEED_CONFIG) as NeedCategory[]).find(
            (k) => NEED_CONFIG[k].defaultType === result.type
          );
          if (matched) setSelectedNeed(matched);
        }
        if (result.priority) setUrgency(result.priority);
        if (result.latitude && result.longitude) {
          setLatInput(result.latitude.toFixed(5));
          setLngInput(result.longitude.toFixed(5));
          setLocationSource('MANUAL');
        }
        if (result.peopleAffected) setPeopleAffected(result.peopleAffected);
        setAiNotice(`Gemini AI: Classified as ${result.type.toUpperCase()} (${result.priority}) at ${result.landmarkName}`);
      } else {
        setAiNotice(
          isOnlineForGemini()
            ? 'AI analysis completed without changes.'
            : 'Device is offline. Using local emergency defaults.'
        );
      }
    } catch {
      setAiNotice('Gemini AI analysis currently unavailable.');
    } finally {
      setIsAiParsing(false);
    }
  };

  // Synchronize initial location upon opening
  useEffect(() => {
    if (!isOpen) return;

    if (currentLocation) {
      setLatInput(currentLocation.latitude.toFixed(5));
      setLngInput(currentLocation.longitude.toFixed(5));
      setAccuracy(currentLocation.accuracy);
      if (currentLocation.source === 'LIVE') {
        setLocationSource('LIVE');
      } else if (currentLocation.source === 'CACHED') {
        setLocationSource('CACHED');
      } else {
        setLocationSource('MANUAL');
      }
    } else {
      setLocationSource('MANUAL');
      setLatInput('13.2384');
      setLngInput('80.0094');
      setAccuracy(undefined);
    }
    setLocationError('');
    setFormError('');
  }, [isOpen, currentLocation]);

  if (!isOpen) return null;

  const handleSelectNeed = (need: NeedCategory) => {
    setSelectedNeed(need);
    setUrgency(NEED_CONFIG[need].defaultPriority);
  };

  const handleRefreshGps = async () => {
    setIsRefreshingGps(true);
    setLocationError('');
    try {
      const res = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      if (res.success && res.coords) {
        setLatInput(res.coords.latitude.toFixed(5));
        setLngInput(res.coords.longitude.toFixed(5));
        setAccuracy(res.coords.accuracy);
        setLocationSource('LIVE');
      } else {
        setLocationError(res.error || 'Failed to acquire GPS fix. You can edit coordinates manually.');
      }
    } catch {
      setLocationError('GPS request interrupted. Manual coordinates active.');
    } finally {
      setIsRefreshingGps(false);
    }
  };

  const handleManualEditLat = (val: string) => {
    setLatInput(val);
    setLocationSource('MANUAL');
  };

  const handleManualEditLng = (val: string) => {
    setLngInput(val);
    setLocationSource('MANUAL');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setFormError('Please enter a valid latitude (-90 to +90).');
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setFormError('Please enter a valid longitude (-180 to +180).');
      return;
    }

    const needInfo = NEED_CONFIG[selectedNeed];
    const draft: DraftIncident = {
      type: needInfo.defaultType,
      priority: urgency,
      latitude: lat,
      longitude: lng,
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
            className="w-7 h-7 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex items-center justify-center text-[#c0c6d6] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
          {/* 1. Need Category Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff]">
              1. What is the Emergency?
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(NEED_CONFIG) as NeedCategory[]).map((need) => {
                const item = NEED_CONFIG[need];
                const isSelected = selectedNeed === need;
                return (
                  <button
                    key={need}
                    type="button"
                    onClick={() => handleSelectNeed(need)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#3e90ff]/20 border-[#3e90ff] text-[#e5e2e1] shadow-[0_0_12px_rgba(62,144,255,0.2)]'
                        : 'bg-[#131313] border-[#2a2a2a] text-[#8b91a0] hover:border-[#3a3a3a] hover:text-[#c0c6d6]'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${isSelected ? 'text-[#3e90ff]' : 'text-[#8b91a0]'}`}>
                      {item.icon}
                    </span>
                    <span className="text-[10px] font-semibold mt-1 truncate max-w-full">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Urgency Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff] flex items-center justify-between">
              <span>2. Priority Level</span>
              <span className="text-[10px] text-[#8b91a0] font-normal normal-case">
                {urgency === 'P0' ? 'Immediate danger to life' : urgency === 'P1' ? 'High risk if unattended' : 'Stable situation'}
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setUrgency('P0')}
                className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  urgency === 'P0'
                    ? 'bg-[#93000a] text-[#ffb4ab] border-[#ffb4ab]'
                    : 'bg-[#131313] border-[#2a2a2a] text-[#8b91a0]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#ffb4ab] animate-ping" />
                <span>P0 Critical</span>
              </button>

              <button
                type="button"
                onClick={() => setUrgency('P1')}
                className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  urgency === 'P1'
                    ? 'bg-[#5c3e00] text-[#ffb84e] border-[#ffb84e]'
                    : 'bg-[#131313] border-[#2a2a2a] text-[#8b91a0]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#ffb84e]" />
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

          {/* 4. Real Location with Auto-Population & Source Tracking */}
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[#131313] border border-[#2a2a2a]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#3e90ff]" />
                <span>Incident Coordinates</span>
              </label>

              {/* Source Tag */}
              {locationSource === 'LIVE' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#152a1b] text-[#47e266] border border-[#2f6f3a]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#47e266] animate-pulse" />
                  📍 LIVE GPS {accuracy ? `(±${accuracy}m)` : ''}
                </span>
              )}
              {locationSource === 'CACHED' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#262118] text-[#ffb84e] border border-[#634e26]">
                  📦 LAST KNOWN LOCATION
                </span>
              )}
              {locationSource === 'MANUAL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1f232d] text-[#aac7ff] border border-[#2f3952]">
                  ✎ MANUAL LOCATION
                </span>
              )}
            </div>

            {/* Latitude & Longitude Inputs (Editable) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#8b91a0] block mb-0.5">Latitude</label>
                <input
                  type="text"
                  value={latInput}
                  onChange={(e) => handleManualEditLat(e.target.value)}
                  placeholder="12.9716"
                  className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-2.5 py-1.5 text-xs text-[#e5e2e1] font-mono focus:border-[#3e90ff] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#8b91a0] block mb-0.5">Longitude</label>
                <input
                  type="text"
                  value={lngInput}
                  onChange={(e) => handleManualEditLng(e.target.value)}
                  placeholder="80.0094"
                  className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-2.5 py-1.5 text-xs text-[#e5e2e1] font-mono focus:border-[#3e90ff] focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Campus Landmark Presets */}
            <div className="flex flex-col gap-1 pt-0.5">
              <span className="text-[9.5px] text-[#8b91a0]">Quick Campus Presets:</span>
              <div className="flex flex-wrap gap-1">
                {Object.entries(CAMPUS_LANDMARKS).map(([key, lm]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setLatInput(lm.lat.toFixed(5));
                      setLngInput(lm.lng.toFixed(5));
                      setLocationSource('MANUAL');
                    }}
                    className="text-[9.5px] px-2 py-0.5 rounded-lg bg-[#1f1f1f] hover:bg-[#282828] text-[#aac7ff] border border-[#2d2d38] cursor-pointer active:scale-95"
                  >
                    {lm.label.split(' ')[0]} {lm.label.split(' ')[1] || ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Location Tools: Refresh GPS button */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-[#8b91a0]">
                {locationSource === 'MANUAL'
                  ? 'Manual input active · Always editable'
                  : 'Coordinates auto-populated from sensor'}
              </span>
              <button
                type="button"
                onClick={handleRefreshGps}
                disabled={isRefreshingGps}
                className="text-[11px] text-[#3e90ff] hover:underline flex items-center gap-1 cursor-pointer font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingGps ? 'animate-spin' : ''}`} />
                <span>{isRefreshingGps ? 'Acquiring...' : 'Refresh GPS'}</span>
              </button>
            </div>

            {/* Insecure Origin Satellite GPS Guide */}
            {isInsecureLanOrigin() && locationSource === 'MANUAL' && (
              <div className="p-2 rounded-xl bg-[#1f1d14] border border-[#524419] text-[#ffd67a] text-[10px] leading-relaxed">
                <div className="font-semibold flex items-center gap-1 mb-0.5">
                  <span>🛰️ Mobile Offline Hardware GPS:</span>
                </div>
                <span>
                  Chrome blocks satellite GPS on plain HTTP. In mobile Chrome, open <code className="font-mono bg-black/40 px-1 py-0.2 rounded text-white">chrome://flags</code>, enable <code className="font-mono bg-black/40 px-1 py-0.2 rounded text-white">unsafely-treat-insecure-origin-as-secure</code> for <span className="font-mono font-semibold text-white">{window.location.origin}</span>, and tap Relaunch.
                </span>
              </div>
            )}

            {locationError && (
              <div className="p-2 rounded-xl bg-[#2c1515] border border-[#662020] text-[#ffb4ab] text-[10.5px] flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{locationError}</span>
              </div>
            )}
          </div>

          {/* 5. Additional Details with Gemini AI Assist */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#aac7ff]">
                5. Details / Situation (Optional)
              </label>
              <button
                type="button"
                onClick={handleAiAssist}
                disabled={isAiParsing}
                className="text-[10px] px-2 py-0.5 rounded-lg bg-[#3e90ff]/15 hover:bg-[#3e90ff]/25 text-[#aac7ff] border border-[#3e90ff]/30 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all active:scale-95"
                title="Use Gemini 3.5 AI to auto-classify category, urgency, and campus coordinates"
              >
                <Sparkles className={`w-3 h-3 ${isAiParsing ? 'animate-spin text-[#ffb84e]' : 'text-[#3e90ff]'}`} />
                <span>{isAiParsing ? 'Analyzing...' : 'AI Auto-Triage (Gemini)'}</span>
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 2nd floor balcony at Block 1, elderly person trapped, water level rising fast..."
              rows={2}
              className="w-full bg-[#131313] border border-[#2a2a2a] rounded-xl p-2.5 text-xs text-[#e5e2e1] focus:border-[#3e90ff] focus:outline-none resize-none"
            />
            {aiNotice && (
              <div className="p-2 rounded-xl bg-[#0f2438] border border-[#1b4369] text-[#aac7ff] text-[10.5px] flex items-center gap-1.5 animate-in fade-in duration-150">
                <Sparkles className="w-3.5 h-3.5 text-[#ffb84e] shrink-0" />
                <span>{aiNotice}</span>
              </div>
            )}
          </div>

          {formError && (
            <div className="p-2.5 rounded-xl bg-[#93000a]/20 border border-[#93000a] text-[#ffb4ab] text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#8b91a0] font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 py-3 rounded-xl bg-[#ba1a1a] hover:bg-[#93000a] text-[#ffffff] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(186,26,26,0.3)] disabled:opacity-50"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{isSubmitting ? 'Relaying to Vault...' : 'Broadcast Distress'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
