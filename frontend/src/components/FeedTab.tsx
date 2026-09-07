import React, { useState } from 'react';
import { IncidentItem, IncidentCategory } from '../types';
import type { DraftIncident } from '../../../shared/types';
import { EmergencyReportModal } from './EmergencyReportModal';
import { useNexusServices } from '../context/ServiceContext';
import { formatCoordinates } from '../services/api/geolocation';

interface FeedTabProps {
  incidents: IncidentItem[];
  onSelectIncidentOnMap: (incidentId: string) => void;
  onShowToast: (msg: string) => void;
  onNavigateToTab: (tab: 'map' | 'network' | 'device') => void;
  isInternetConnected?: boolean;
  onToggleInternet?: () => void;
  onBroadcastEmergency?: () => Promise<void>;
  onCreateIncident?: (draft: DraftIncident) => Promise<any>;
  onToggleRespond?: (id: string, title: string) => Promise<void>;
}

export const FeedTab: React.FC<FeedTabProps> = ({
  incidents,
  onSelectIncidentOnMap,
  onShowToast,
  onNavigateToTab,
  isInternetConnected = false,
  onToggleInternet,
  onBroadcastEmergency,
  onCreateIncident,
  onToggleRespond,
}) => {
  const { currentLocation, locationState, requestLocation } = useNexusServices();
  const [activeFilter, setActiveFilter] = useState<IncidentCategory>('all');
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [detailsIncident, setDetailsIncident] = useState<IncidentItem | null>(null);

  // Filter chips definition
  const filters: { id: IncidentCategory; label: string; hasDot?: boolean; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'critical', label: 'Critical', hasDot: true },
    { id: 'medical', label: 'Medical' },
    { id: 'wildfire', label: 'Wildfire' },
    { id: 'supplies', label: 'Supplies' },
  ];

  const filteredIncidents = incidents.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.category.toLowerCase().includes(activeFilter.toLowerCase());
  });

  const handleBroadcastClick = () => {
    setIsReportModalOpen(true);
  };

  const handleFormSubmit = async (draft: DraftIncident) => {
    if (onCreateIncident) {
      await onCreateIncident(draft);
      onShowToast(`Priority ${draft.priority} ${draft.type} emergency broadcasted via mesh!`);
    } else if (onBroadcastEmergency) {
      await onBroadcastEmergency();
    }
  };

  const handleToggleRespond = async (id: string, title: string) => {
    const isResponding = respondedIds.has(id);
    setRespondedIds((prev) => {
      const next = new Set(prev);
      if (isResponding) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    if (onToggleRespond) {
      try {
        await onToggleRespond(id, title);
      } catch (err) {
        console.error('Toggle respond error:', err);
      }
    }

    if (isResponding) {
      onShowToast(`Response withdrawn for ${title}`);
    } else {
      onShowToast(`En route: Responding to ${title}`);
    }
  };

  const handleShare = (title: string) => {
    onShowToast(`Incident relay package generated for "${title}"`);
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col px-3 pt-2 pb-24 gap-2.5 overflow-y-auto no-scrollbar">
      {/* Real Hardware Location Context Indicator */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#1c1b1b] border border-[#2a2a2a] text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">
            {locationState === 'LIVE' ? '📍' : locationState === 'CACHED' ? '📦' : locationState === 'MANUAL' ? '✎' : '⚠️'}
          </span>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#e5e2e1] text-[11px] leading-none">
                {locationState === 'LIVE'
                  ? 'LIVE GPS POSITION'
                  : locationState === 'CACHED'
                  ? 'LAST KNOWN CACHED LOCATION'
                  : locationState === 'MANUAL'
                  ? 'MANUAL COORDINATES'
                  : 'LOCATION UNAVAILABLE'}
              </span>
              {locationState === 'LIVE' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#47e266] animate-pulse" />
              )}
            </div>
            <span className="text-[10px] text-[#8b91a0] font-mono mt-0.5 leading-none">
              {currentLocation
                ? `${formatCoordinates(currentLocation.latitude, currentLocation.longitude, 4)} ${currentLocation.accuracy ? `(±${currentLocation.accuracy}m)` : ''}`
                : 'Tap to acquire device GPS'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => requestLocation(true)}
          className="text-[11px] text-[#3e90ff] font-semibold hover:underline cursor-pointer"
        >
          {locationState === 'LIVE' ? 'Update' : 'Acquire GPS'}
        </button>
      </div>

      {/* Primary Emergency Broadcast Card */}
      <section className="rounded-xl bg-[#1c1b1b] border border-[#ffb4ab]/35 p-3.5 shadow-lg shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 text-[#ffb4ab]">
            <span className="material-symbols-outlined text-[18px] text-[#ffb4ab]">e911_emergency</span>
            <span className="text-[11px] font-bold uppercase tracking-wider">Need Immediate Help?</span>
          </div>
          <span className="text-[10px] text-[#8b91a0] font-medium">
            {isInternetConnected ? 'Dual Relay (Cloud+Mesh)' : 'Local Mesh P2P'}
          </span>
        </div>

        <p className="text-[12px] text-[#c0c6d6] mb-2.5 leading-snug">
          Broadcast an emergency through the local mesh.
        </p>

        {/* Broadcast button */}
        <button
          id="broadcastTrigger"
          onClick={handleBroadcastClick}
          className="w-full h-11 rounded-lg flex items-center justify-center gap-2 px-4 font-bold text-[14px] cursor-pointer shadow-md transition-all active:scale-[0.99] bg-[#ffb4ab] hover:bg-[#ffc2ba] text-[#690005]"
        >
          <span className="material-symbols-outlined text-[18px]">podcasts</span>
          <span>BROADCAST EMERGENCY</span>
        </button>
      </section>

      {/* Horizontal Filter Chip Carousel */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 -mx-3 px-3 scrollbar-none shrink-0">
        {filters.map((chip) => {
          const isActive = activeFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setActiveFilter(chip.id)}
              className={`filter-chip whitespace-nowrap px-3 h-7.5 rounded-full text-[12px] transition-all flex items-center gap-1 cursor-pointer select-none ${
                isActive
                  ? 'bg-[#aac7ff] text-[#003064] font-bold shadow-sm'
                  : 'bg-[#1c1b1b] border border-[#2a2a2a] text-[#8b91a0] hover:text-[#e5e2e1]'
              }`}
            >
              {chip.hasDot && <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]" />}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between px-0.5 shrink-0">
        <h2 className="text-[14px] font-semibold text-[#e5e2e1] tracking-tight">
          Active Incidents ({filteredIncidents.length})
        </h2>
        <span className="text-[11px] text-[#8b91a0]">
          Dexie Vault Synchronized
        </span>
      </div>

      {/* Empty State: Zero mock seeding */}
      {filteredIncidents.length === 0 && (
        <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-[#1c1b1b]/50 border border-[#2a2a2a]/60 text-center gap-3 my-4">
          <div className="w-12 h-12 rounded-full bg-[#201f1f] flex items-center justify-center text-[#8b91a0]">
            <span className="material-symbols-outlined text-[24px]">shield</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold text-[#e5e2e1]">No Active Emergencies</span>
            <p className="text-[12px] text-[#8b91a0] max-w-xs leading-relaxed">
              No emergency incidents have been recorded or relayed to this node yet. Use the broadcast button above to log a distress report.
            </p>
          </div>
        </div>
      )}

      {/* Incident Cards List */}
      <div className="flex flex-col gap-2.5">
        {filteredIncidents.map((incident) => {
          const isResponding = respondedIds.has(incident.id) || incident.hasResponded;
          return (
            <div
              key={incident.id}
              className="rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] p-3.5 flex flex-col gap-3 shadow-md hover:border-[#353534] transition-all cursor-pointer"
              onClick={() => setDetailsIncident(incident)}
            >
              {/* Top row: Priority badge + Title + Time */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      incident.urgency === 'High'
                        ? 'bg-[#93000a] text-[#ffb4ab]'
                        : incident.urgency === 'Medium'
                        ? 'bg-[#5c3e00] text-[#ffb84e]'
                        : 'bg-[#002957] text-[#aac7ff]'
                    }`}
                  >
                    {incident.urgency === 'High' ? 'P0 Critical' : incident.urgency === 'Medium' ? 'P1 Urgent' : 'P2 Normal'}
                  </span>
                  <span className="text-[11px] text-[#8b91a0] font-mono">
                    {incident.timeAgo}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#131313] border border-[#2a2a2a] text-[#8b91a0]">
                  {incident.hopsRemaining !== undefined ? `${incident.hopsRemaining} hops` : 'Direct'}
                </span>
              </div>

              {/* Title & Description */}
              <div className="flex flex-col gap-1">
                <h3 className="font-bold text-[14px] text-[#e5e2e1] leading-snug">
                  {incident.title}
                </h3>
                <p className="text-[12px] text-[#c0c6d6] leading-relaxed line-clamp-2">
                  {incident.description}
                </p>
              </div>

              {/* Meta: Location, People Affected, Distance */}
              <div className="flex items-center justify-between text-[11px] text-[#8b91a0] pt-1 border-t border-[#2a2a2a]/60">
                <div className="flex items-center gap-1 truncate max-w-[65%]">
                  <span className="material-symbols-outlined text-[13px] text-[#aac7ff]">location_on</span>
                  <span className="truncate">{incident.location}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {incident.peopleAffected !== undefined && (
                    <span className="text-[#ffb4ab] font-medium">
                      {incident.peopleAffected} affected
                    </span>
                  )}
                  <span>{incident.distance}</span>
                </div>
              </div>

              {/* Card Action Buttons */}
              <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleToggleRespond(incident.id, incident.title)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isResponding
                      ? 'bg-[#152a1b] border border-[#2f6f3a] text-[#47e266]'
                      : 'bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {isResponding ? 'check_circle' : 'person_add'}
                  </span>
                  <span>{isResponding ? 'Assigned (En Route)' : 'Respond'}</span>
                </button>

                <button
                  onClick={() => onSelectIncidentOnMap(incident.id)}
                  className="px-3 py-2 rounded-xl bg-[#201f1f] hover:bg-[#2a2a2a] text-[#aac7ff] text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                  title="View on Tactical Map"
                >
                  <span className="material-symbols-outlined text-[15px]">explore</span>
                  <span>Map</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Incident Inspection Modal */}
      {detailsIncident && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-2.5">
              <span className="text-xs font-bold text-[#ffb4ab] uppercase tracking-wider">
                Distress Detail · {detailsIncident.category.toUpperCase()}
              </span>
              <button
                onClick={() => setDetailsIncident(null)}
                className="w-7 h-7 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex items-center justify-center text-[#c0c6d6] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-[16px] text-[#e5e2e1]">
                {detailsIncident.title}
              </h3>
              <p className="text-xs text-[#c0c6d6] leading-relaxed">
                {detailsIncident.description}
              </p>

              <div className="p-3 rounded-xl bg-[#131313] border border-[#2a2a2a] flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8b91a0]">Perimeter:</span>
                  <span className="text-[#e5e2e1] font-mono">{detailsIncident.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8b91a0]">Estimated Affected:</span>
                  <span className="text-[#ffb4ab] font-bold">{detailsIncident.peopleAffected || 1} people</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8b91a0]">Hop Distance:</span>
                  <span className="text-[#aac7ff] font-mono">{detailsIncident.hopsRemaining || 0} hops</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const id = detailsIncident.id;
                  setDetailsIncident(null);
                  onSelectIncidentOnMap(id);
                }}
                className="flex-1 py-2.5 rounded-full bg-[#3e90ff] text-[#002957] font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">map</span>
                <span>View on Map</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Report Form Modal */}
      <EmergencyReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmit={handleFormSubmit}
        isInternetConnected={isInternetConnected}
        currentLocation={currentLocation}
        locationState={locationState}
      />
    </div>
  );
};
