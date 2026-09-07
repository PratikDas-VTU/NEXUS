import { useState } from 'react';
import { NavTab, IncidentItem } from './types';
import { initialIncidents } from './data/mockData';
import { MobileFrame } from './components/MobileFrame';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { FeedTab } from './components/FeedTab';
import { MapTab } from './components/MapTab';
import { NetworkTab } from './components/NetworkTab';
import { DeviceTab } from './components/DeviceTab';
import { StitchDataModal } from './components/StitchDataModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('feed');
  const [incidents, setIncidents] = useState<IncidentItem[]>(initialIncidents);
  const [isStitchModalOpen, setIsStitchModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isInternetConnected, setIsInternetConnected] = useState<boolean>(false);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  const handleToggleInternet = () => {
    const nextVal = !isInternetConnected;
    setIsInternetConnected(nextVal);
    if (nextVal) {
      triggerToast('🌐 Internet connection ON: Cloud Central Gateway connected');
    } else {
      triggerToast('⚡ Internet connection OFF: Zero-Internet Offline Mesh Active');
    }
  };

  const handleSelectIncidentOnMap = (incidentId: string) => {
    setActiveTab('map');
    triggerToast(`Viewing perimeter location on offline tactical map`);
  };

  const handleInjectCustomIncident = (data: {
    title: string;
    description: string;
    location: string;
    category: string;
  }) => {
    const newInc: IncidentItem = {
      id: `inc-${Date.now()}`,
      category: data.category,
      typeLabel: 'Critical · Responder Report',
      badgeColor: 'error',
      timeAgo: 'Just now',
      title: data.title,
      description: data.description,
      distance: '350 m away',
      location: data.location,
      hasResponded: false,
    };

    setIncidents(prev => [newInc, ...prev]);
    setActiveTab('feed');
    triggerToast('New incident broadcasted across local mesh nodes!');
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
          />
        )}

        {activeTab === 'map' && (
          <MapTab onShowToast={triggerToast} />
        )}

        {activeTab === 'network' && (
          <NetworkTab
            onShowToast={triggerToast}
            isInternetConnected={isInternetConnected}
            onToggleInternet={handleToggleInternet}
          />
        )}

        {activeTab === 'device' && (
          <DeviceTab
            onShowToast={triggerToast}
            isInternetConnected={isInternetConnected}
            onToggleInternet={handleToggleInternet}
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
