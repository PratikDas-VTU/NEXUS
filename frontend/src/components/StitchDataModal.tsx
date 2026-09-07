import React, { useState } from 'react';
import { X, Code2, Image, Sparkles, Copy, Check } from 'lucide-react';
import { NEXUS_BRAND_LOGOS, mapBackgroundUrl } from '../data/mockData';

interface StitchDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectIncident: (data: { title: string; description: string; location: string; category: string }) => void;
}

export const StitchDataModal: React.FC<StitchDataModalProps> = ({
  isOpen,
  onClose,
  onInjectIncident,
}) => {
  const [copied, setCopied] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLocation, setNewLocation] = useState('Sector 3');

  if (!isOpen) return null;

  const hotlinkedAssets = [
    { label: 'Feed Logo', url: NEXUS_BRAND_LOGOS.feed },
    { label: 'Map Logo', url: NEXUS_BRAND_LOGOS.map },
    { label: 'Network Logo', url: NEXUS_BRAND_LOGOS.network },
    { label: 'Device Logo', url: NEXUS_BRAND_LOGOS.device },
    { label: 'Tactical Map Canvas', url: mapBackgroundUrl },
  ];

  const handleCopyTokens = () => {
    const tokens = {
      surface: '#131313',
      onSurface: '#e5e2e1',
      primary: '#aac7ff',
      primaryContainer: '#3e90ff',
      tertiary: '#47e266',
      error: '#ffb4ab',
      font: 'Plus Jakarta Sans',
      icons: 'Material Symbols Outlined',
    };
    navigator.clipboard.writeText(JSON.stringify(tokens, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateCustomIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onInjectIncident({
      title: newTitle.trim(),
      description: newDesc.trim() || 'Urgent situation reported via field responder manual broadcast.',
      location: newLocation,
      category: 'critical',
    });
    setNewTitle('');
    setNewDesc('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#2a2a2a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#201f1f] border border-[#3e90ff]/40 flex items-center justify-center">
              <Code2 className="w-4 h-4 text-[#aac7ff]" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#e5e2e1] flex items-center gap-1.5">
                Stitch Design System &amp; Assets
                <span className="px-1.5 py-0.5 rounded bg-[#002957] text-[#aac7ff] text-[10px] font-mono">
                  Offline Mesh
                </span>
              </h3>
              <p className="text-[11px] text-[#c0c6d6]">Google Stitch export components &amp; hotlinked media</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[#2a2a2a] text-[#c0c6d6] hover:text-[#e5e2e1] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 no-scrollbar text-xs">
          {/* Design Tokens Row */}
          <div className="p-3.5 rounded-2xl bg-[#131313] border border-[#2a2a2a] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-[#e5e2e1]">Nexus Stitch Theme Tokens</span>
              <span className="text-[11px] text-[#8b91a0]">Surface #131313 · Primary #aac7ff · Tertiary #47e266</span>
            </div>
            <button
              onClick={handleCopyTokens}
              className="px-3 py-1.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] flex items-center gap-1 font-mono text-[11px] cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#47e266]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Tokens'}</span>
            </button>
          </div>

          {/* Quick Create Incident Form */}
          <form onSubmit={handleCreateCustomIncident} className="p-3.5 rounded-2xl bg-[#131313] border border-[#2a2a2a] flex flex-col gap-2.5">
            <span className="font-semibold text-[#e5e2e1] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#3e90ff]" />
              Inject New Mesh Incident to Feed
            </span>
            <input
              type="text"
              placeholder="Incident Title (e.g., Power Outage at Station 3)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-3 py-2 text-[#e5e2e1] placeholder-[#8b91a0] focus:outline-none focus:border-[#3e90ff]"
              required
            />
            <textarea
              placeholder="Incident Description & immediate requests..."
              rows={2}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-3 py-2 text-[#e5e2e1] placeholder-[#8b91a0] focus:outline-none focus:border-[#3e90ff]"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Location (e.g. Sector 5)"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                className="flex-1 bg-[#1c1b1b] border border-[#2a2a2a] rounded-xl px-3 py-1.5 text-[#e5e2e1] placeholder-[#8b91a0] focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-[#3e90ff] hover:bg-[#aac7ff] text-[#002957] font-semibold transition-colors cursor-pointer"
              >
                Inject
              </button>
            </div>
          </form>

          {/* Hotlinked Stitch Images */}
          <div>
            <span className="font-mono text-[#8b91a0] text-[11px] block mb-2 uppercase font-semibold flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-[#aac7ff]" />
              Hotlinked Stitch Media Assets ({hotlinkedAssets.length}):
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {hotlinkedAssets.map((asset, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#131313] p-2 flex flex-col items-center gap-2">
                  <div className="w-full h-16 bg-[#201f1f] rounded-lg overflow-hidden flex items-center justify-center">
                    <img
                      src={asset.url}
                      alt={asset.label}
                      referrerPolicy="no-referrer"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <span className="text-[10px] text-[#c0c6d6] font-medium text-center truncate w-full">
                    {asset.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#2a2a2a] bg-[#131313] flex items-center justify-between">
          <span className="text-[11px] text-[#8b91a0]">
            100% Client-Side Pure Frontend
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-xs font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
