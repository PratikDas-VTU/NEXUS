import React, { useState } from 'react';
import { IncidentItem } from '../types';

interface IncidentManagerProps {
  incidents: IncidentItem[];
  onAddIncident: (data: {
    title: string;
    description: string;
    location: string;
    category: string;
    badgeColor?: 'error' | 'amber' | 'primary';
  }) => void;
  onResolveIncident: (id: string) => void;
  onShowToast: (msg: string) => void;
}

export const IncidentManager: React.FC<IncidentManagerProps> = ({
  incidents,
  onAddIncident,
  onResolveIncident,
  onShowToast,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('Amrita Main Academic Block');
  const [newCategory, setNewCategory] = useState('critical medical');
  const [newDescription, setNewDescription] = useState('');
  const [severityLevel, setSeverityLevel] = useState<'critical' | 'urgent' | 'info'>('critical');

  const handleCreateBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) {
      onShowToast('Please provide an incident title and description');
      return;
    }

    const badgeColor =
      severityLevel === 'critical' ? 'error' : severityLevel === 'urgent' ? 'amber' : 'primary';

    onAddIncident({
      title: newTitle.trim(),
      description: newDescription.trim(),
      location: newLocation.trim(),
      category: newCategory,
      badgeColor,
    });

    onShowToast(`🚨 Priority Broadcast Pushed: "${newTitle}"`);
    setNewTitle('');
    setNewDescription('');
    setShowAddModal(false);
  };

  const filtered = incidents.filter((inc) => {
    if (filterCategory === 'all') return true;
    return inc.category.toLowerCase().includes(filterCategory.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#181818] p-4 rounded-2xl border border-[#282828]">
        <div>
          <h2 className="text-sm font-bold text-[#e5e2e1] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#3e90ff] text-[18px]">
              crisis_alert
            </span>
            <span>Incident Command &amp; Mesh Dispatch</span>
          </h2>
          <p className="text-[11px] text-[#8b91a0] mt-0.5">
            Manage active perimeter emergencies and push cryptographically signed broadcasts across Amrita nodes.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-xl bg-[#3e90ff] hover:bg-[#327ce0] text-[#002957] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#3e90ff]/20 cursor-pointer transition-all active:scale-95 shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">campaign</span>
          <span>Broadcast New Emergency</span>
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'all', label: `All (${incidents.length})` },
          { id: 'critical', label: 'Critical High Priority' },
          { id: 'medical', label: 'Medical Emergencies' },
          { id: 'hazard', label: 'Grid & Hazards' },
          { id: 'supplies', label: 'Relief Resources' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilterCategory(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all border whitespace-nowrap ${
              filterCategory === f.id
                ? 'bg-[#3e90ff]/20 text-[#aac7ff] border-[#3e90ff]/50'
                : 'bg-[#181818] text-[#8b91a0] border-[#282828] hover:bg-[#202020]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Incidents Table / List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-[#181818] border border-[#282828] rounded-2xl p-8 text-center text-[#8b91a0]">
            <span className="material-symbols-outlined text-[36px] mb-2 opacity-60">check_circle</span>
            <p className="text-xs">No incidents matching the selected filter</p>
          </div>
        ) : (
          filtered.map((inc) => (
            <div
              key={inc.id}
              className="bg-[#181818] hover:bg-[#1c1c1c] border border-[#282828] rounded-2xl p-4 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      inc.badgeColor === 'error'
                        ? 'bg-[#93000a] text-[#ffdad6]'
                        : inc.badgeColor === 'amber'
                        ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                        : 'bg-[#002957] text-[#aac7ff]'
                    }`}
                  >
                    {inc.typeLabel || inc.category}
                  </span>
                  <span className="text-[11px] text-[#8b91a0]">{inc.timeAgo}</span>
                  <span className="text-[11px] text-[#47e266] flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
                    <span>Mesh Active</span>
                  </span>
                </div>

                <h3 className="text-sm font-bold text-[#e5e2e1] truncate">{inc.title}</h3>
                <p className="text-xs text-[#c0c6d6] line-clamp-2 leading-relaxed">
                  {inc.description}
                </p>

                <div className="flex items-center gap-3 text-[11px] text-[#8b91a0] pt-1">
                  <span className="flex items-center gap-1 text-[#aac7ff]">
                    <span className="material-symbols-outlined text-[14px]">place</span>
                    <span>{inc.location}</span>
                  </span>
                  <span>·</span>
                  <span>{inc.distance}</span>
                </div>
              </div>

              {/* Admin Actions for this Incident */}
              <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                <button
                  onClick={() => {
                    onResolveIncident(inc.id);
                    onShowToast(`✓ Incident marked resolved: "${inc.title}"`);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#202020] hover:bg-[#282828] border border-[#333] text-xs font-semibold text-[#47e266] flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Mark incident resolved"
                >
                  <span className="material-symbols-outlined text-[16px]">task_alt</span>
                  <span>Resolve</span>
                </button>

                <button
                  onClick={() => {
                    onShowToast(`Dispatched backup responders to ${inc.location}`);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#3e90ff]/10 hover:bg-[#3e90ff]/20 border border-[#3e90ff]/30 text-xs font-semibold text-[#aac7ff] flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Dispatch Amrita emergency units"
                >
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  <span>Dispatch Unit</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Broadcast Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-[#2e2e2e] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-[#282828] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#3e90ff]">broadcast_on_personal</span>
                <h3 className="font-bold text-sm text-[#e5e2e1]">
                  Broadcast Priority Mesh Emergency
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-[#242424] flex items-center justify-center text-[#8b91a0] hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateBroadcast} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#c0c6d6] uppercase tracking-wider mb-1">
                  Incident Title / Alert Name
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Flash Flood Alert at Vengal Bridge / Medical Code Blue"
                  className="w-full bg-[#121212] border border-[#303030] focus:border-[#3e90ff] rounded-xl p-2.5 text-xs text-[#e5e2e1] outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#c0c6d6] uppercase tracking-wider mb-1">
                    Severity Level
                  </label>
                  <select
                    value={severityLevel}
                    onChange={(e) => setSeverityLevel(e.target.value as any)}
                    className="w-full bg-[#121212] border border-[#303030] focus:border-[#3e90ff] rounded-xl p-2.5 text-xs text-[#e5e2e1] outline-none cursor-pointer"
                  >
                    <option value="critical">Critical Level 1 (Immediate Danger)</option>
                    <option value="urgent">Urgent Hazard (Caution/Detour)</option>
                    <option value="info">Resource / Advisory</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#c0c6d6] uppercase tracking-wider mb-1">
                    Campus Zone / Sector
                  </label>
                  <select
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full bg-[#121212] border border-[#303030] focus:border-[#3e90ff] rounded-xl p-2.5 text-xs text-[#e5e2e1] outline-none cursor-pointer"
                  >
                    <option value="Amrita Main Academic Block A">Amrita Academic Block A (Ramanujan)</option>
                    <option value="Amrita Central Quad & Library">Amrita Central Quad &amp; Library</option>
                    <option value="North Gate · SH-50 Junction">North Gate · SH-50 Junction</option>
                    <option value="Agastya Student Dining & Hostel">Agastya Dining &amp; Amenities</option>
                    <option value="Vengal Primary Health Centre">Vengal Primary Health Centre</option>
                    <option value="Vengal Lake / East Perimeter">Vengal Lake / East Perimeter</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#c0c6d6] uppercase tracking-wider mb-1">
                  Alert Description &amp; First Responder Instructions
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  placeholder="Provide precise details, safety precautions, and rendezvous coordinates for nearby responders..."
                  className="w-full bg-[#121212] border border-[#303030] focus:border-[#3e90ff] rounded-xl p-2.5 text-xs text-[#e5e2e1] outline-none resize-none"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#252525] text-xs font-semibold text-[#c0c6d6] hover:bg-[#303030] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#3e90ff] hover:bg-[#327ce0] text-[#002957] font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <span className="material-symbols-outlined text-[16px]">sensors</span>
                  <span>Sign &amp; Dispatch Alert</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
