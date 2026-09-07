import { useState } from 'react';
import { NavTab } from './types';
import { MobileFrame } from './components/MobileFrame';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { FeedTab } from './components/FeedTab';
import { MapTab } from './components/MapTab';
import { NetworkTab } from './components/NetworkTab';
import { DeviceTab } from './components/DeviceTab';
import { StitchDataModal } from './components/StitchDataModal';
import { ServiceProvider, useNexusServices } from './context/ServiceContext';
import type { IncidentType, IncidentPriority } from '../../shared/types';

function AppContent() {
  const [activeTab, setActiveTab] = useState<NavTab>('feed');
  const [isStitchModalOpen, setIsStitchModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isInternetConnected, setIsInternetConnected] = useState<boolean>(false);

  const {
    incidents,
    createIncident,
    updateIncidentStatus,
    outboxCount,
    deviceId,
    networkStatus,
    toggleInternet,
  } = useNexusServices();

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  const handleToggleInternet = async () => {
    const nextVal = !isInternetConnected;
    setIsInternetConnected(nextVal);
    await toggleInternet(nextVal);
    if (nextVal) {
      triggerToast('🌐 Internet connection ON: Cloud Central Gateway connected');
    } else {
      triggerToast('⚡ Internet connection OFF: Zero-Internet Offline Mesh Active');
    }
  };

  const handleSelectIncidentOnMap = (_incidentId: string) => {
    setActiveTab('map');
    triggerToast(`Viewing perimeter location on offline tactical map`);
  };

  const handleBroadcastEmergency = async () => {
    try {
      await createIncident({
        type: 'medical',
        priority: 'P0',
        latitude: 12.9716,
        longitude: 77.5946,
        peopleAffected: 1,
        description: 'Priority Distress Beacon\nCritical emergency assistance requested via NEXUS broadcast channel.',
      });
      triggerToast('Priority emergency broadcasted and stored in local offline vault!');
    } catch (err: any) {
      triggerToast(`Broadcast error: ${err?.message || 'Failed to save'}`);
    }
  };

  const handleToggleRespond = async (id: string, _title: string) => {
    try {
      const inc = incidents.find((i) => i.id === id);
      const nextStatus = inc?.hasResponded ? 'reported' : 'assigned';
      await updateIncidentStatus(id, nextStatus);
    } catch (err) {
      console.error('Failed to update incident status:', err);
    }
  };

  const handleInjectCustomIncident = async (data: {
    title: string;
    description: string;
    location: string;
    category: string;
  }) => {
    try {
      let type: IncidentType = 'medical';
      let priority: IncidentPriority = 'P0';

      if (data.category === 'wildfire') {
        type = 'safety';
        priority = 'P1';
      } else if (data.category === 'supplies') {
        type = 'resource';
        priority = 'P2';
      }

      await createIncident({
        type,
        priority,
        latitude: 12.972 + (Math.random() - 0.5) * 0.01,
        longitude: 77.595 + (Math.random() - 0.5) * 0.01,
        peopleAffected: 2,
        description: `${data.title}\n${data.description}`,
      });

      setActiveTab('feed');
      triggerToast('New incident persisted to Dexie and queued in outbox!');
    } catch (err: any) {
      triggerToast(`Failed to inject incident: ${err?.message || 'Validation error'}`);
    }
  };

  return (
    <MobileFrame
      onOpenStitchModal={() => setIsStitchModalOpen(true)}
      isInternetConnected={isInternetConnected}
      onToggleInternet={handleToggleInternet}
    >
      {/* Top Header */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isInternetConnected={isInternetConnected}
        onToggleInternet={handleToggleInternet}
        peerCount={networkStatus.activePeers.length}
      />

      {/* Main Tab Viewport */}
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative bg-[#131313]">
        {activeTab === 'feed' && (
          <FeedTab
            incidents={incidents}
            onSelectIncidentOnMap={handleSelectIncidentOnMap}
            onShowToast={triggerToast}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            isInternetConnected={isInternetConnected}
            onToggleInternet={handleToggleInternet}
            onBroadcastEmergency={handleBroadcastEmergency}
            onCreateIncident={createIncident}
            onToggleRespond={handleToggleRespond}
          />
        )}

        {activeTab === 'map' && (
          <MapTab
            onShowToast={triggerToast}
            incidents={incidents}
          />
        )}

        {activeTab === 'network' && (
          <NetworkTab
            onShowToast={triggerToast}
            isInternetConnected={isInternetConnected}
            onToggleInternet={handleToggleInternet}
            networkStatus={networkStatus}
          />
        )}

        {activeTab === 'device' && (
          <DeviceTab
            onShowToast={triggerToast}
            isInternetConnected={isInternetConnected}
            onToggleInternet={handleToggleInternet}
            deviceId={deviceId}
            outboxCount={outboxCount}
            localCacheCount={incidents.length}
          />
        )}
      </div>

      {/* Bottom Navigation (Feed, Map, Network, Device) */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Stitch Design System & Assets Modal */}
      <StitchDataModal
        isOpen={isStitchModalOpen}
        onClose={() => setIsStitchModalOpen(false)}
        onInjectIncident={handleInjectCustomIncident}
      />

      {/* Tactile Toast Notification */}
      {toastMessage && (
        <div
          id="nexus-toast"
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#1c1b1b]/95 border border-[#3e90ff]/50 text-[#e5e2e1] text-xs font-medium px-4 py-2 rounded-full shadow-2xl backdrop-blur-md transition-all flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-[#47e266] animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}
    </MobileFrame>
  );
}

export default function App() {
  return (
    <ServiceProvider>
      <AppContent />
    </ServiceProvider>
  );
}
