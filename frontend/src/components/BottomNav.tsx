import React from 'react';
import { NavTab } from '../types';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const navItems: { id: NavTab; label: string; icon: string }[] = [
    { id: 'feed', label: 'Feed', icon: 'emergency_home' },
    { id: 'map', label: 'Map', icon: 'map' },
    { id: 'network', label: 'Network', icon: 'hub' },
    { id: 'device', label: 'Device', icon: 'router' },
  ];

  return (
    <nav
      id="nexus-bottom-nav"
      className="sticky bottom-0 w-full z-40 shrink-0 bg-[#131313]/95 backdrop-blur-xl shadow-[0_-1px_12px_rgba(0,0,0,0.5)] border-t border-[#201f1f]/80"
    >
      <div className="flex justify-around items-center h-14 px-2 max-w-md md:max-w-xl mx-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              id={`nexus-tab-${item.id}`}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] py-1 px-2 rounded-xl transition-all cursor-pointer relative ${
                isActive
                  ? 'text-[#3e90ff] font-bold'
                  : 'text-[#8b91a0] hover:text-[#e5e2e1] active:scale-95'
              }`}
            >
              {isActive && (
                <span className="absolute -top-1 w-6 h-0.5 bg-[#3e90ff] rounded-full shadow-[0_0_6px_#3e90ff]" />
              )}
              <span
                className="material-symbols-outlined text-[22px] transition-transform"
                style={{
                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {item.icon}
              </span>
              <span className="text-[10.5px] leading-tight font-semibold tracking-tight mt-0.5">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
