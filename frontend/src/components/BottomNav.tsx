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
      className="sticky bottom-0 w-full z-40 shrink-0 bg-[#121417]/95 backdrop-blur-xl border-t border-[#22262b] pb-safe-bottom"
    >
      <div className="flex justify-around items-center h-14 px-2 max-w-md md:max-w-xl mx-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              id={`nexus-tab-${item.id}`}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center min-w-[60px] min-h-[46px] py-1 px-2 rounded-xl transition-colors cursor-pointer relative ${
                isActive
                  ? 'text-[#3e90ff]'
                  : 'text-[#9da4b0] hover:text-[#e6e8eb]'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 w-6 h-0.5 bg-[#3e90ff] rounded-full" />
              )}
              <span
                className="material-symbols-outlined text-[22px]"
                style={{
                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {item.icon}
              </span>
              <span className={`text-[11px] leading-tight tracking-tight mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
