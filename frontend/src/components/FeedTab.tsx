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
    <div className="flex-1 min-h-0 w-full flex flex-col px-3 pt-2.5 pb-24 gap-3 overflow-y-auto no-scrollbar max-w-5xl mx-auto">
      {/* Compact Location & Sync Status Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#16181b] border border-[#252830] text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[15px] text-[#3e90ff] shrink-0">
            {locationState === 'LIVE' ? 'location_on' : locationState === 'CACHED' ? 'inventory_2' : 'edit_location'}
          </span>
          <span className="text-[11px] text-[#9da4b0] font-mono truncate">
            {currentLocation
              ? `${formatCoordinates(currentLocation.latitude, currentLocation.longitude, 4)} ${currentLocation.accuracy ? `(±${currentLocation.accuracy}m)` : ''}`
              : 'Acquiring GPS fix...'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => requestLocation(true)}
          className="text-[11px] text-[#3e90ff] font-medium hover:underline shrink-0 cursor-pointer ml-2"
        >
          {locationState === 'LIVE' ? 'Update' : 'Refresh GPS'}
        </button>
      </div>

      {/* Primary Emergency Broadcast Card */}
      <section className="rounded-2xl bg-[#1b1516] border border-[#402023] p-3.5 shadow-sm shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 text-[#ffb4ab]">
            <span className="material-symbols-outlined text-[17px]">e911_emergency</span>
            <span className="text-xs font-bold uppercase tracking-wider">Emergency Broadcast</span>
          </div>
          <span className="text-[10.5px] text-[#9da4b0] font-medium">
            {isInternetConnected ? 'Dual Relay (Cloud+Mesh)' : 'Zero-Internet Mesh'}
          </span>
        </div>

        <p className="text-xs text-[#c4c7cc] mb-3 leading-snug">
          Instantly dispatch a high-priority distress beacon across nearby offline nodes.
        </p>

        {/* Broadcast button */}
        <button
          id="broadcastTrigger"
          onClick={handleBroadcastClick}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-2 px-4 font-bold text-sm cursor-pointer transition-colors active:scale-[0.99] bg-[#ffb4ab] hover:bg-[#ffc2ba] text-[#690005]"
        >
          <span className="material-symbols-outlined text-[18px]">podcasts</span>
          <span>BROADCAST EMERGENCY</span>
        </button>
      </section>

      {/* Horizontal Filter Chip Carousel */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 -mx-1 px-1 scrollbar-none shrink-0">
        {filters.map((chip) => {
          const isActive = activeFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setActiveFilter(chip.id)}
              className={`whitespace-nowrap px-3 h-7.5 rounded-full text-xs transition-colors flex items-center gap-1.5 cursor-pointer select-none border ${
                isActive
                  ? 'bg-[#aac7ff] text-[#002957] font-semibold border-transparent shadow-xs'
                  : 'bg-[#16181b] border-[#252830] text-[#9da4b0] hover:text-[#e6e8eb]'
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
        <h2 className="text-sm font-semibold text-[#e6e8eb] tracking-tight">
          Active Incidents ({filteredIncidents.length})
        </h2>
        <span className="text-[11px] text-[#9da4b0] font-mono">
          Dexie Vault Synced
        </span>
      </div>

      {/* Empty State: Zero mock seeding */}
      {filteredIncidents.length === 0 && (
        <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-[#16181b]/60 border border-[#252830] text-center gap-3 my-3">
          <div className="w-11 h-11 rounded-xl bg-[#1a1d21] flex items-center justify-center text-[#9da4b0] border border-[#26292e]">
            <span className="material-symbols-outlined text-[22px]">verified_user</span>
          </div>
          <div className="flex flex-col gap-1 max-w-xs">
            <span className="text-sm font-semibold text-[#e6e8eb]">Perimeter Clear</span>
            <p className="text-xs text-[#9da4b0] leading-relaxed">
              No emergency incidents reported in this zone. Reports created locally or relayed via peer nodes will populate here.
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
              className="rounded-2xl bg-[#16181b] border border-[#252830] p-3.5 flex flex-col gap-2.5 shadow-sm hover:border-[#323842] transition-colors cursor-pointer"
              onClick={() => setDetailsIncident(incident)}
            >
              {/* Top row: Priority badge + Time + Hop info */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      incident.urgency === 'High'
                        ? 'bg-[#331416] border-[#592328] text-[#ffb4ab]'
                        : incident.urgency === 'Medium'
                        ? 'bg-[#2e2110] border-[#5e411b] text-[#ffb84e]'
                        : 'bg-[#162030] border-[#293d5c] text-[#aac7ff]'
                    }`}
                  >
                    {incident.urgency === 'High' ? 'P0 Critical' : incident.urgency === 'Medium' ? 'P1 Urgent' : 'P2 Normal'}
                  </span>
                  <span className="text-[11px] text-[#9da4b0] font-mono">
                    {incident.timeAgo}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a1d21] border border-[#26292e] text-[#9da4b0] font-mono">
                  {incident.hopsRemaining !== undefined ? `${incident.hopsRemaining} hops` : 'Direct'}
                </span>
              </div>

              {/* Title & Description */}
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold text-sm text-[#e6e8eb] leading-snug">
                  {incident.title}
                </h3>
                <p className="text-xs text-[#9da4b0] leading-relaxed line-clamp-2">
                  {incident.description}
                </p>
              </div>

              {/* Meta: Location, People Affected, Distance */}
              <div className="flex items-center justify-between text-[11px] text-[#9da4b0] pt-1 border-t border-[#22262b]">
                <div className="flex items-center gap-1 truncate max-w-[65%]">
                  <span className="material-symbols-outlined text-[14px] text-[#3e90ff]">location_on</span>
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
              <div className="flex gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleToggleRespond(incident.id, incident.title)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border ${
                    isResponding
                      ? 'bg-[#122a1b] border-[#245831] text-[#47e266]'
                      : 'bg-[#20242a] hover:bg-[#282d36] border-[#2e333d] text-[#e6e8eb]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {isResponding ? 'check_circle' : 'person_add'}
                  </span>
                  <span>{isResponding ? 'Assigned (En Route)' : 'Respond'}</span>
                </button>

                <button
                  onClick={() => onSelectIncidentOnMap(incident.id)}
                  className="px-3.5 py-2 rounded-xl bg-[#20242a] hover:bg-[#282d36] border border-[#2e333d] text-[#aac7ff] text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
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
          <div className="bg-[#1a1d21] border border-[#2c3138] rounded-2xl w-full max-w-sm p-4 shadow-xl flex flex-col gap-3.5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#26292e] pb-2.5">
              <span className="text-xs font-bold text-[#ffb4ab] uppercase tracking-wider">
                Distress Detail · {detailsIncident.category.toUpperCase()}
              </span>
              <button
                onClick={() => setDetailsIncident(null)}
                className="w-6 h-6 rounded-lg bg-[#22262b] hover:bg-[#2c3138] flex items-center justify-center text-[#9da4b0] hover:text-[#e6e8eb] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-base text-[#e6e8eb]">
                {detailsIncident.title}
              </h3>
              <p className="text-xs text-[#9da4b0] leading-relaxed">
                {detailsIncident.description}
              </p>

              <div className="p-3 rounded-xl bg-[#15171a] border border-[#26292e] flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9da4b0]">Perimeter:</span>
                  <span className="text-[#e6e8eb] font-mono">{detailsIncident.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9da4b0]">Estimated Affected:</span>
                  <span className="text-[#ffb4ab] font-semibold">{detailsIncident.peopleAffected || 1} people</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9da4b0]">Hop Distance:</span>
                  <span className="text-[#aac7ff] font-mono">{detailsIncident.hopsRemaining || 0} hops</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  const id = detailsIncident.id;
                  setDetailsIncident(null);
                  onSelectIncidentOnMap(id);
                }}
                className="flex-1 py-2 rounded-xl bg-[#3e90ff] text-[#002957] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#559eff] cursor-pointer"
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
