import React, { useState } from 'react';
import { IncidentItem, IncidentCategory } from '../types';

interface FeedTabProps {
  incidents: IncidentItem[];
  onSelectIncidentOnMap: (incidentId: string) => void;
  onShowToast: (msg: string) => void;
  onNavigateToTab: (tab: 'map' | 'network' | 'device') => void;
  isInternetConnected?: boolean;
  onToggleInternet?: () => void;
}

export const FeedTab: React.FC<FeedTabProps> = ({
  incidents,
  onSelectIncidentOnMap,
  onShowToast,
  onNavigateToTab,
  isInternetConnected = false,
  onToggleInternet,
}) => {
  const [activeFilter, setActiveFilter] = useState<IncidentCategory>('all');
  const [broadcastingState, setBroadcastingState] = useState<'idle' | 'broadcasting' | 'sent'>('idle');
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [detailsIncident, setDetailsIncident] = useState<IncidentItem | null>(null);

  // Filter chips definition
  const filters: { id: IncidentCategory; label: string; hasDot?: boolean; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'critical', label: 'Critical (2)', hasDot: true },
    { id: 'medical', label: 'Medical' },
    { id: 'wildfire', label: 'Wildfire' },
    { id: 'supplies', label: 'Supplies' },
  ];

  const filteredIncidents = incidents.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.category.toLowerCase().includes(activeFilter.toLowerCase());
  });

  const handleBroadcast = () => {
    if (broadcastingState !== 'idle') return;
    setBroadcastingState('broadcasting');

    setTimeout(() => {
      setBroadcastingState('sent');
      onShowToast('Emergency beacon dispatched to 4 nearby relays');
      setTimeout(() => {
        setBroadcastingState('idle');
      }, 3500);
    }, 1400);
  };

  const handleToggleRespond = (id: string, title: string) => {
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
    <div className="flex-1 min-h-0 w-full flex flex-col px-4 pt-3 pb-8 gap-4 overflow-y-auto no-scrollbar">
      {/* Subtle Status Indicator Pill */}
      <div className="flex items-center justify-between pt-1 shrink-0">
        <button
          onClick={() => onNavigateToTab('network')}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1b1b]/90 shadow-sm border border-[#2a2a2a]/60 hover:bg-[#201f1f] transition-all cursor-pointer text-left"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#47e266] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#47e266]" />
          </span>
          <span className="text-[13px] text-[#e5e2e1] font-medium">Mesh active</span>
          <span className="text-[13px] text-[#8b91a0]">·</span>
          <span className="text-[13px] text-[#c0c6d6] font-normal">4 nearby peers</span>
        </button>

        {/* Quick Micro Signal / Internet Toggle Pill */}
        <button
          onClick={onToggleInternet}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-all cursor-pointer ${
            isInternetConnected
              ? 'bg-[#142e1d] border-[#2f6f3a] text-[#47e266] hover:bg-[#1b3d26]'
              : 'bg-[#1c1b1b] border-[#2a2a2a] text-[#c0c6d6] hover:bg-[#201f1f]'
          }`}
          title="Click to toggle Internet Connection ON / OFF"
        >
          <span className="material-symbols-outlined text-[15px]">
            {isInternetConnected ? 'wifi' : 'wifi_off'}
          </span>
          <span className="tracking-tight">
            {isInternetConnected ? 'Cloud Uplink' : 'Zero Internet'}
          </span>
        </button>
      </div>

      {/* Hero Emergency Broadcast Card */}
      <section className="relative overflow-hidden rounded-2xl bg-[#1c1b1b] shadow-xl p-5 border border-[#2a2a2a]/80 shrink-0">
        <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-[#ffb4ab]/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#ffb4ab]/15 flex items-center justify-center text-[#ffb4ab]">
                <span className="material-symbols-outlined text-[18px]">e911_emergency</span>
              </div>
              <span className="text-[11px] uppercase tracking-wider text-[#ffb4ab] font-semibold">
                Priority Channel
              </span>
            </div>
            <span className="text-[11px] text-[#c0c6d6]">
              {isInternetConnected ? 'Cloud & Mesh dual-beacon' : 'Offline P2P beacon'}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-[20px] font-semibold text-[#e5e2e1] tracking-tight leading-snug">
              Need immediate help?
            </h1>
            <p className="text-[13px] text-[#c0c6d6] leading-relaxed">
              {isInternetConnected
                ? 'Broadcast a high-priority distress signal to both decentralized local mesh relays and central cloud emergency servers.'
                : 'Broadcast a high-priority distress signal directly through decentralized offline peer-to-peer relays.'}
            </p>
          </div>

          {/* Broadcast button with interactive states */}
          <button
            id="broadcastTrigger"
            onClick={handleBroadcast}
            disabled={broadcastingState !== 'idle'}
            className={`relative group active:scale-[0.98] transition-all duration-200 w-full h-12 rounded-full flex items-center justify-center gap-2 px-5 font-semibold text-[15px] cursor-pointer shadow-lg ${
              broadcastingState === 'broadcasting'
                ? 'bg-[#93000a] text-[#ffdad6]'
                : broadcastingState === 'sent'
                ? 'bg-[#00531a] text-[#6cff82] shadow-[#47e266]/20'
                : 'bg-[#ffb4ab] hover:bg-[#ffb4ab]/90 text-[#690005] shadow-[#ffb4ab]/20'
            }`}
          >
            {broadcastingState === 'idle' && (
              <>
                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:rotate-12">
                  podcasts
                </span>
                <span>Broadcast Emergency</span>
              </>
            )}
            {broadcastingState === 'broadcasting' && (
              <>
                <span className="material-symbols-outlined text-[20px] animate-spin">
                  progress_activity
                </span>
                <span>Broadcasting Beacon...</span>
              </>
            )}
            {broadcastingState === 'sent' && (
              <>
                <span className="material-symbols-outlined text-[20px] text-[#47e266]">
                  check_circle
                </span>
                <span>Dispatched to 4 Relays</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-center">
            <span className="material-symbols-outlined text-[14px] text-[#8b91a0]">wifi_off</span>
            <span className="text-[11px] text-[#8b91a0]">
              Relays offline to nearby devices instantly
            </span>
          </div>
        </div>
      </section>

      {/* Horizontal Filter Chip Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 -mx-4 px-4 scrollbar-none shrink-0">
        {filters.map((chip) => {
          const isActive = activeFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setActiveFilter(chip.id)}
              className={`filter-chip whitespace-nowrap px-4 h-9 rounded-full text-[13px] transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                isActive
                  ? 'bg-[#e5e2e1] text-[#131313] font-semibold shadow-sm'
                  : 'bg-[#201f1f] text-[#c0c6d6] hover:text-[#e5e2e1] border border-[#2a2a2a]/60'
              }`}
            >
              {chip.hasDot && (
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#ffb4ab]' : 'bg-[#ffb4ab]'}`} />
              )}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Incident Stream Cards */}
      <div className="flex flex-col gap-4 shrink-0">
        {filteredIncidents.map((incident) => {
          const isResponded = respondedIds.has(incident.id);

          return (
            <article
              key={incident.id}
              className="feed-item rounded-2xl bg-[#1c1b1b] p-5 shadow-md flex flex-col gap-4 border border-[#2a2a2a]/60 hover:border-[#353534] transition-all shrink-0"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                {incident.badgeColor === 'error' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#ffb4ab]/15 text-[#ffb4ab] text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-pulse" />
                    {incident.typeLabel}
                  </span>
                )}
                {incident.badgeColor === 'amber' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {incident.typeLabel}
                  </span>
                )}
                {incident.badgeColor === 'primary' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#aac7ff]/15 text-[#aac7ff] text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#aac7ff]" />
                    {incident.typeLabel}
                  </span>
                )}

                <div className="flex items-center gap-1 text-[#c0c6d6]">
                  {incident.statusText ? (
                    <span className="text-[11px] text-[#47e266] flex items-center gap-1 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
                      {incident.statusText}
                    </span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <span className="text-[11px]">{incident.timeAgo}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Title & Description */}
              <div className="flex flex-col gap-1">
                <h2 className="text-[17px] text-[#e5e2e1] font-semibold tracking-tight">
                  {incident.title}
                </h2>
                <p className="text-[14px] text-[#c0c6d6] leading-relaxed">
                  {incident.description}
                </p>
              </div>

              {/* Optional Visual Media Image */}
              {incident.mediaUrl && (
                <div className="relative w-full h-44 rounded-xl overflow-hidden shadow-inner bg-[#2a2a2a] border border-[#353534]/50">
                  <img
                    className="w-full h-full object-cover"
                    src={incident.mediaUrl}
                    alt={incident.mediaAlt || incident.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e]/90 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[#e5e2e1]">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0e0e0e]/80 backdrop-blur-md">
                      <span className="material-symbols-outlined text-[14px] text-amber-400">
                        satellite_alt
                      </span>
                      <span className="text-[11px] text-[#e5e2e1]">{incident.telemetryTag}</span>
                    </div>
                    <span className="text-[11px] text-[#c0c6d6]">100% verified</span>
                  </div>
                </div>
              )}

              {/* Optional Water Depot Telemetry Spark Box */}
              {incident.waterCapacity && (
                <div className="p-3 rounded-xl bg-[#201f1f] border border-[#2a2a2a] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#3e90ff]/20 flex items-center justify-center text-[#aac7ff]">
                      <span className="material-symbols-outlined text-[18px]">water_drop</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] text-[#e5e2e1] font-medium">
                        {incident.waterCapacity.availableGallons}
                      </span>
                      <span className="text-[11px] text-[#c0c6d6]">
                        {incident.waterCapacity.flowRate}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-[#8b91a0]">Wait time</span>
                    <p className="text-[13px] text-[#e5e2e1] font-semibold">
                      {incident.waterCapacity.waitTime}
                    </p>
                  </div>
                </div>
              )}

              {/* Location & Metadata Line */}
              <div className="flex items-center justify-between pt-1 text-[#c0c6d6]">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      incident.badgeColor === 'amber'
                        ? 'text-amber-400'
                        : incident.badgeColor === 'primary'
                        ? 'text-[#47e266]'
                        : 'text-[#aac7ff]'
                    }`}
                  >
                    {incident.badgeColor === 'primary' ? 'location_on' : 'near_me'}
                  </span>
                  <span className="text-[13px] text-[#e5e2e1] font-medium">
                    {incident.distance}
                  </span>
                  <span className="text-[13px] text-[#8b91a0]">·</span>
                  <span className="text-[13px] text-[#c0c6d6]">{incident.location}</span>
                </div>

                {incident.mediaUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleShare(incident.title)}
                      className="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#3a3939] active:scale-95 transition-transform flex items-center justify-center text-[#e5e2e1] cursor-pointer"
                      title="Share Relay"
                    >
                      <span className="material-symbols-outlined text-[18px]">share</span>
                    </button>
                    <button
                      onClick={() => onSelectIncidentOnMap(incident.id)}
                      className="px-3.5 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#3a3939] active:scale-[0.98] transition-transform text-[#e5e2e1] text-[13px] font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <span>Perimeter</span>
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Actions row for cards without media (or with respond action) */}
              {!incident.mediaUrl && (
                <div className="flex items-center gap-3 pt-1">
                  {incident.waterCapacity ? (
                    <button
                      onClick={() => onSelectIncidentOnMap(incident.id)}
                      className="w-full h-11 rounded-full bg-[#2a2a2a] hover:bg-[#3a3939] active:scale-[0.98] transition-transform text-[#e5e2e1] text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer border border-[#353534]"
                    >
                      <span className="material-symbols-outlined text-[16px]">directions</span>
                      <span>Route to Depot</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleToggleRespond(incident.id, incident.title)}
                        className={`flex-1 h-11 rounded-full active:scale-[0.98] transition-all font-semibold text-[15px] flex items-center justify-center gap-2 shadow-md cursor-pointer ${
                          isResponded
                            ? 'bg-[#00531a] text-[#6cff82] border border-[#47e266]/40'
                            : 'bg-[#aac7ff] hover:bg-[#aac7ff]/90 text-[#003064]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isResponded ? 'check_circle' : 'emergency'}
                        </span>
                        <span>{isResponded ? 'Assigned (En Route)' : 'Respond'}</span>
                      </button>
                      <button
                        onClick={() => setDetailsIncident(incident)}
                        className="px-5 h-11 rounded-full bg-[#2a2a2a] hover:bg-[#3a3939] active:scale-[0.98] transition-transform text-[#e5e2e1] text-[13px] font-medium flex items-center justify-center cursor-pointer border border-[#353534]/60"
                      >
                        Details
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

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
    </div>
  );
};
