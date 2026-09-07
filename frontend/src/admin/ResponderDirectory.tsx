import React, { useState } from 'react';
import { ResponderTeam, AdminAuditLog } from './types';
import { INITIAL_RESPONDER_TEAMS, INITIAL_AUDIT_LOGS } from './mockAdminData';

interface ResponderDirectoryProps {
  onShowToast: (msg: string) => void;
}

export const ResponderDirectory: React.FC<ResponderDirectoryProps> = ({ onShowToast }) => {
  const [teams, setTeams] = useState<ResponderTeam[]>(INITIAL_RESPONDER_TEAMS);
  const [logs] = useState<AdminAuditLog[]>(INITIAL_AUDIT_LOGS);

  const handleHailUnit = (team: ResponderTeam) => {
    onShowToast(`Radio hail transmitted to "${team.callsign}" on ${team.radioFrequency}`);
  };

  const handleToggleStatus = (teamId: string) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const nextStatus = t.status === 'On Scene' ? 'Standby' : t.status === 'Standby' ? 'En Route' : 'On Scene';
        return { ...t, status: nextStatus };
      })
    );
    onShowToast('Unit operational status updated');
  };

  return (
    <div className="space-y-4">
      {/* Responders Grid */}
      <div className="bg-[#181818] rounded-2xl border border-[#282828] p-4">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#282828]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
              group_work
            </span>
            <div>
              <h3 className="text-sm font-bold text-[#e5e2e1]">
                Field Responder Deployment Roster
              </h3>
              <p className="text-[10px] text-[#8b91a0]">Offline Operational Directory · Amrita Campus Units</p>
            </div>
          </div>
          <span className="text-[11px] text-[#47e266] font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
            18 Personnel Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="p-3.5 rounded-xl bg-[#141414] border border-[#242424] space-y-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-[#e5e2e1]">{team.callsign}</h4>
                    <span className="text-[10px] text-[#8b91a0]">({team.unitType})</span>
                  </div>
                  <p className="text-[11px] text-[#c0c6d6] mt-0.5">Lead: {team.leadName}</p>
                </div>

                <button
                  onClick={() => handleToggleStatus(team.id)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                    team.status === 'On Scene'
                      ? 'bg-[#003910] text-[#6cff82] border border-[#47e266]/40'
                      : team.status === 'En Route'
                      ? 'bg-[#002957] text-[#aac7ff] border border-[#3e90ff]/40'
                      : 'bg-[#222] text-[#8b91a0]'
                  }`}
                  title="Click to toggle status"
                >
                  {team.status}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#8b91a0] pt-1 border-t border-[#202020]">
                <div className="flex items-center gap-1 text-[#aac7ff]">
                  <span className="material-symbols-outlined text-[14px]">place</span>
                  <span>{team.currentSector}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{team.personnelCount} Responders</span>
                  <button
                    onClick={() => handleHailUnit(team)}
                    className="p-1 rounded bg-[#202020] hover:bg-[#282828] text-[#c0c6d6] hover:text-[#e5e2e1] cursor-pointer"
                    title="Hail on radio"
                  >
                    <span className="material-symbols-outlined text-[15px]">settings_voice</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security & Audit Logs */}
      <div className="bg-[#181818] rounded-2xl border border-[#282828] p-4">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[#282828]">
          <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
            security_update_good
          </span>
          <h3 className="text-sm font-bold text-[#e5e2e1]">
            Incident Command Audit Log
          </h3>
        </div>

        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-2.5 rounded-xl bg-[#141414] border border-[#222] flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    log.severity === 'critical'
                      ? 'bg-[#ffb4ab]'
                      : log.severity === 'warn'
                      ? 'bg-amber-400'
                      : 'bg-[#3e90ff]'
                  }`}
                />
                <div className="flex flex-col">
                  <span className="text-[#e5e2e1] font-medium">{log.action}</span>
                  <span className="text-[10px] text-[#8b91a0]">Actor: {log.actor}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-[#8b91a0] shrink-0 pl-2">
                {log.timestamp}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
