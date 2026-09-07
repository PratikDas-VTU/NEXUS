import React, { useState } from 'react';
import { IncidentItem, IncidentCategory } from '../types';
import type { DraftIncident } from '../../../shared/types';
import { EmergencyReportModal } from './EmergencyReportModal';

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
                  ? 'bg-[#e5e2e1] text-[#131313] font-semibold shadow-xs'
                  : 'bg-[#201f1f] text-[#c0c6d6] hover:text-[#e5e2e1] border border-[#2a2a2a]/60'
              }`}
            >
              {chip.hasDot && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]" />
              )}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Incident Stream Cards */}
      {filteredIncidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl bg-[#1c1b1b] border border-[#2a2a2a]">
          <div className="w-12 h-12 rounded-full bg-[#201f1f] flex items-center justify-center text-[#8b91a0] mb-3">
            <span className="material-symbols-outlined text-[28px]">shield</span>
          </div>
          <h3 className="text-[14px] font-bold text-[#e5e2e1] uppercase tracking-wider mb-1">
            NO ACTIVE EMERGENCIES
          </h3>
          <p className="text-[12px] text-[#8b91a0] max-w-[280px] leading-relaxed">
            Reports created on this device will appear here and can be relayed through the local mesh.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 shrink-0">
          {filteredIncidents.map((incident) => {
            const isResponded = respondedIds.has(incident.id) || !!incident.hasResponded;

            return (
              <article
                key={incident.id}
                className="feed-item rounded-xl bg-[#1c1b1b] p-3.5 shadow-md flex flex-col gap-2.5 border border-[#2a2a2a] hover:border-[#353534] transition-all shrink-0"
              >
                {/* Header: Priority badge on left, Distance & Time on right */}
                <div className="flex items-center justify-between gap-2">
                  {incident.badgeColor === 'error' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ffb4ab]/15 text-[#ffb4ab] text-[10.5px] font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-pulse" />
                      {incident.typeLabel}
                    </span>
                  )}
                  {incident.badgeColor === 'amber' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10.5px] font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {incident.typeLabel}
                    </span>
                  )}
                  {incident.badgeColor === 'primary' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#aac7ff]/15 text-[#aac7ff] text-[10.5px] font-bold uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#aac7ff]" />
                      {incident.typeLabel}
                    </span>
                  )}

                  <div className="flex items-center gap-1.5 text-[11px] text-[#8b91a0] font-medium">
                    <span className="text-[#c0c6d6]">{incident.distance}</span>
                    <span>·</span>
                    <span>{incident.timeAgo}</span>
                  </div>
                </div>

                {/* Title & Description */}
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-[15px] text-[#e5e2e1] font-bold tracking-tight leading-snug">
                    {incident.title}
                  </h2>
                  <p className="text-[12.5px] text-[#c0c6d6] leading-relaxed line-clamp-2">
                    {incident.description}
                  </p>
                </div>

                {/* Optional Visual Media Image (compact) */}
                {incident.mediaUrl && (
                  <div className="relative w-full h-32 rounded-lg overflow-hidden shadow-inner bg-[#2a2a2a] border border-[#353534]/50 my-0.5">
                    <img
                      className="w-full h-full object-cover"
                      src={incident.mediaUrl}
                      alt={incident.mediaAlt || incident.title}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e]/90 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[#e5e2e1]">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#0e0e0e]/80 text-[10px]">
                        <span className="material-symbols-outlined text-[12px] text-amber-400">
                          satellite_alt
                        </span>
                        <span>{incident.telemetryTag}</span>
                      </div>
                      <span className="text-[10px] text-[#c0c6d6]">Verified</span>
                    </div>
                  </div>
                )}

                {/* Optional Water Depot Telemetry Spark Box */}
                {incident.waterCapacity && (
                  <div className="p-2.5 rounded-lg bg-[#201f1f] border border-[#2a2a2a] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-[#aac7ff]">water_drop</span>
                      <div className="flex flex-col">
                        <span className="text-[12px] text-[#e5e2e1] font-semibold">
                          {incident.waterCapacity.availableGallons}
                        </span>
                        <span className="text-[10.5px] text-[#8b91a0]">
                          {incident.waterCapacity.flowRate}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#8b91a0]">Wait time</span>
                      <p className="text-[12px] text-[#e5e2e1] font-semibold">
                        {incident.waterCapacity.waitTime}
                      </p>
                    </div>
                  </div>
                )}

                {/* Location & Status Line */}
                <div className="flex items-center justify-between text-[11px] text-[#8b91a0]">
                  <div className="flex items-center gap-1 truncate">
                    <span className="material-symbols-outlined text-[14px] text-[#aac7ff]">location_on</span>
                    <span className="truncate text-[#c0c6d6]">{incident.location}</span>
                  </div>
                  {incident.statusText && (
                    <span className="text-[#47e266] font-medium flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
                      {incident.statusText}
                    </span>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 pt-0.5">
                  {incident.waterCapacity ? (
                    <button
                      onClick={() => onSelectIncidentOnMap(incident.id)}
                      className="w-full h-9 rounded-lg bg-[#2a2a2a] hover:bg-[#3a3939] active:scale-[0.98] transition-transform text-[#e5e2e1] text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer border border-[#353534]"
                    >
                      <span className="material-symbols-outlined text-[15px]">directions</span>
                      <span>Route to Depot</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleToggleRespond(incident.id, incident.title)}
                        className={`flex-1 h-9 rounded-lg active:scale-[0.98] transition-all font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer ${
                          isResponded
                            ? 'bg-[#00531a] text-[#6cff82] border border-[#47e266]/40'
                            : 'bg-[#aac7ff] hover:bg-[#aac7ff]/90 text-[#003064]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {isResponded ? 'check_circle' : 'emergency'}
                        </span>
                        <span>{isResponded ? 'Assigned (En Route)' : 'Respond'}</span>
                      </button>
                      <button
                        onClick={() => setDetailsIncident(incident)}
                        className="px-3.5 h-9 rounded-lg bg-[#2a2a2a] hover:bg-[#3a3939] active:scale-[0.98] transition-transform text-[#e5e2e1] text-[12px] font-medium flex items-center justify-center cursor-pointer border border-[#353534]/60"
                      >
                        Details
                      </button>
                      {incident.mediaUrl && (
                        <button
                          onClick={() => handleShare(incident.title)}
                          className="w-9 h-9 rounded-lg bg-[#2a2a2a] hover:bg-[#3a3939] active:scale-95 transition-transform flex items-center justify-center text-[#e5e2e1] cursor-pointer border border-[#353534]/60"
                          title="Share Relay"
                        >
                          <span className="material-symbols-outlined text-[16px]">share</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Subtle Ambient Mesh Footer Pulse */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-2 text-[#8b91a0]">
        <span className="material-symbols-outlined text-[14px] animate-spin" style={{ animationDuration: '6s' }}>
          sync
        </span>
        <span className="text-[11px]">Mesh syncing continuously over BLE &amp; LoRa</span>
      </div>

      {/* Details Modal */}
      {detailsIncident && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
              <span className="text-[11px] font-semibold text-[#ffb4ab] uppercase tracking-wider">
                {detailsIncident.typeLabel}
              </span>
              <button
                onClick={() => setDetailsIncident(null)}
                className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#e5e2e1] hover:bg-[#3a3939]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <h3 className="text-[18px] font-bold text-[#e5e2e1]">{detailsIncident.title}</h3>
            <p className="text-[13px] text-[#c0c6d6] leading-relaxed">{detailsIncident.description}</p>

            <div className="p-3 bg-[#201f1f] rounded-xl text-xs space-y-1 text-[#c0c6d6]">
              <div className="flex justify-between">
                <span>Location:</span>
                <span className="text-[#e5e2e1] font-medium">{detailsIncident.location}</span>
              </div>
              <div className="flex justify-between">
                <span>Distance:</span>
                <span className="text-[#e5e2e1] font-medium">{detailsIncident.distance}</span>
              </div>
              <div className="flex justify-between">
                <span>Reported:</span>
                <span className="text-[#e5e2e1] font-medium">{detailsIncident.timeAgo}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setDetailsIncident(null);
                  onSelectIncidentOnMap(detailsIncident.id);
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
      />
    </div>
  );
};
