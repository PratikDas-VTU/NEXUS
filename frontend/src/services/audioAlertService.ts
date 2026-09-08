/**
 * NEXUS Tactical Web Audio Emergency Alert Service
 * 
 * Generates offline synthesized alert tones using the Web Audio API.
 * 
 * STRICT INTEGRITY RULES:
 * 1. Persistent Incident Deduplication:
 *    Alerted incident IDs are stored in localStorage, preventing duplicate alert sounds
 *    across app reloads, multiple peer relay hops, and re-broadcasts.
 * 2. Peer Detection Deduplication:
 *    Peer detection chirps play ONCE when a peer is discovered or connected.
 *    Repeated scan cycles never repeat the chirp for the same active peer.
 *    When a peer disconnects, its state resets so genuine re-connections confirm properly.
 * 3. Event Separation:
 *    - Peer Detection: Short, subtle, professional, non-alarming chirp (880Hz -> 1318Hz, low volume).
 *    - Peer Connected: Gentle two-tone confirmation (587Hz -> 880Hz, low volume).
 *    - P1 Urgent: Noticeable two-tone alert (HIGH -> LOW, medium volume).
 *    - P0 Critical: Highly recognizable 4-pulse pattern (HIGH -> LOW -> pause -> HIGH -> LOW, high volume).
 *    - P2 / Routine: Completely silent.
 * 4. Zero External Dependencies:
 *    100% offline Web Audio API synthesis. Fast, reliable, zero CDN or asset dependencies.
 * 5. Visual + Audio Pairing:
 *    Incoming emergencies dispatch visual alert notifications even when audio is muted.
 */

const STORAGE_KEY_SEEN_INCIDENTS = 'nexus_alerted_incident_ids_v1';
const STORAGE_KEY_MUTED = 'nexus_alert_sound_muted';

export interface VisualAlertEvent {
  id: string;
  type: 'P0_CRITICAL' | 'P1_URGENT' | 'PEER_DETECTED' | 'PEER_CONNECTED';
  title: string;
  message: string;
  priority?: string;
  timestamp: number;
}

class AudioAlertService {
  private audioContext: AudioContext | null = null;
  private seenIncidentIds: Set<string> = new Set();
  private alertedPeerDetectedIds: Set<string> = new Set();
  private alertedPeerConnectedIds: Set<string> = new Set();
  private isAudioMuted: boolean = false;
  private isUnlocked: boolean = false;
  private muteListeners: Set<(muted: boolean) => void> = new Set();
  private visualAlertListeners: Set<(event: VisualAlertEvent) => void> = new Set();

  constructor() {
    this.loadPersistedState();
  }

  private loadPersistedState(): void {
    if (typeof window === 'undefined') return;

    // 1. Load seen incident IDs from persistent storage
    try {
      const storedSeen = localStorage.getItem(STORAGE_KEY_SEEN_INCIDENTS);
      if (storedSeen) {
        const parsed = JSON.parse(storedSeen);
        if (Array.isArray(parsed)) {
          this.seenIncidentIds = new Set(parsed);
        }
      }
    } catch (e) {
      console.warn('[AudioAlertService] Failed to load alerted incident IDs from localStorage:', e);
    }

    // 2. Load mute preference
    try {
      const storedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
      if (storedMuted !== null) {
        this.isAudioMuted = storedMuted === 'true';
      }
    } catch (e) {
      console.warn('[AudioAlertService] Failed to load mute preference:', e);
    }
  }

  private persistSeenIds(): void {
    if (typeof window === 'undefined') return;
    try {
      // Retain the last 500 alerted IDs to prevent unbounded storage growth
      const idsArray = Array.from(this.seenIncidentIds).slice(-500);
      localStorage.setItem(STORAGE_KEY_SEEN_INCIDENTS, JSON.stringify(idsArray));
    } catch (e) {
      console.warn('[AudioAlertService] Failed to persist alerted incident IDs:', e);
    }
  }

  /**
   * Seeds historical incident IDs loaded during app initialization.
   * Guarantees that reopening the application does NOT replay alerts for old incidents.
   */
  public seedSeenIncidents(incidentIds: string[]): void {
    let hasNew = false;
    for (const id of incidentIds) {
      if (id && !this.seenIncidentIds.has(id)) {
        this.seenIncidentIds.add(id);
        hasNew = true;
      }
    }
    if (hasNew) {
      this.persistSeenIds();
    }
  }

  /**
   * Checks if an incident ID has already triggered an alert sound.
   */
  public hasAlerted(incidentId: string): boolean {
    return this.seenIncidentIds.has(incidentId);
  }

  /**
   * Marks an incident ID as alerted and persists to storage.
   */
  public markAlerted(incidentId: string): void {
    if (!incidentId) return;
    this.seenIncidentIds.add(incidentId);
    this.persistSeenIds();
  }

  /**
   * Lazily initializes the AudioContext and unlocks on user gesture.
   */
  public unlockAudio(): boolean {
    if (typeof window === 'undefined') return false;

    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        this.isUnlocked = true;
      }).catch(() => {});
    } else if (this.audioContext && this.audioContext.state === 'running') {
      this.isUnlocked = true;
    }

    return this.isUnlocked;
  }

  public getIsUnlocked(): boolean {
    return this.isUnlocked;
  }

  public getIsMuted(): boolean {
    return this.isAudioMuted;
  }

  public setMuted(muted: boolean): void {
    this.isAudioMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_MUTED, String(muted));
    }
    this.muteListeners.forEach((cb) => cb(muted));
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.isAudioMuted);
    return this.isAudioMuted;
  }

  public subscribeMuteState(callback: (muted: boolean) => void): () => void {
    this.muteListeners.add(callback);
    return () => this.muteListeners.delete(callback);
  }

  public subscribeVisualAlert(callback: (event: VisualAlertEvent) => void): () => void {
    this.visualAlertListeners.add(callback);
    return () => this.visualAlertListeners.delete(callback);
  }

  private dispatchVisualAlert(event: VisualAlertEvent): void {
    this.visualAlertListeners.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.warn('[AudioAlertService] Error in visual alert listener:', err);
      }
    });
  }

  // ─── 1. PEER DETECTION & CONNECTION TONES (SUBTLE, NON-EMERGENCY) ────────

  /**
   * Plays a subtle, non-alarming confirmation chirp when a real Nearby peer is discovered.
   * Deduplicated per peer ID: repeated discovery events for the same peer are silent.
   */
  public playPeerDetectedChirp(peerId?: string): boolean {
    if (peerId) {
      if (this.alertedPeerDetectedIds.has(peerId)) {
        return false;
      }
      this.alertedPeerDetectedIds.add(peerId);
    }

    if (this.isAudioMuted) return false;
    this.unlockAudio();
    if (!this.audioContext || this.audioContext.state !== 'running') return false;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // Clean rising chirp: 880Hz (A5) -> 1318.5Hz (E6) over 85ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1318.5, now + 0.08);

      // Gentle, low volume envelope (~0.14) to avoid startle
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
      return true;
    } catch (e) {
      console.warn('[AudioAlertService] Failed to play peer detected chirp:', e);
      return false;
    }
  }

  /**
   * Plays a soft two-tone confirmation when a Nearby connection is successfully established.
   * Deduplicated per peer ID so it only sounds once per connection session.
   */
  public playPeerConnectedTone(peerId?: string): boolean {
    if (peerId) {
      if (this.alertedPeerConnectedIds.has(peerId)) {
        return false;
      }
      this.alertedPeerConnectedIds.add(peerId);
    }

    if (this.isAudioMuted) return false;
    this.unlockAudio();
    if (!this.audioContext || this.audioContext.state !== 'running') return false;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // Note 1: 587.33 Hz (D5) for 60ms
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.14, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.065);

      // Note 2: 880 Hz (A5) for 80ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.065);
      gain2.gain.setValueAtTime(0.001, now + 0.065);
      gain2.gain.linearRampToValueAtTime(0.16, now + 0.075);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.145);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.065);
      osc2.stop(now + 0.15);

      return true;
    } catch (e) {
      console.warn('[AudioAlertService] Failed to play peer connected tone:', e);
      return false;
    }
  }

  /**
   * Resets the peer alert state when a peer departs or disconnects.
   * Allows the chirp/tone to play again if the peer genuinely reconnects later.
   */
  public resetPeerAlert(peerId: string): void {
    if (!peerId) return;
    this.alertedPeerDetectedIds.delete(peerId);
    this.alertedPeerConnectedIds.delete(peerId);
  }

  /**
   * Clears all peer alert tracking (e.g. when scan is stopped or restarted).
   */
  public clearAllPeerAlerts(): void {
    this.alertedPeerDetectedIds.clear();
    this.alertedPeerConnectedIds.clear();
  }

  // ─── 2. EMERGENCY INCIDENT ALERT TONES (POLISHED, ATTENTION-GRABBING) ─────

  /**
   * Synthesizes and plays a tactical emergency alert tone.
   * 
   * @param priority 'P0' for critical emergency; 'P1' for urgent hazard
   * @returns true if tone played, false if muted or blocked
   */
  public playEmergencyChime(priority: 'P0' | 'P1' = 'P0'): boolean {
    if (this.isAudioMuted) {
      return false;
    }

    this.unlockAudio();

    if (!this.audioContext || this.audioContext.state !== 'running') {
      return false;
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;

      if (priority === 'P0') {
        // P0 (Critical Distress): High-intensity 4-pulse pattern (HIGH -> LOW -> pause -> HIGH -> LOW)
        // High: 987.77 Hz (B5), Low: 659.25 Hz (E5)
        // Volume: High (~0.55), controlled exponential envelopes to eliminate clicking.

        const pulses = [
          { freq: 987.77, start: now + 0.00, dur: 0.08, gain: 0.55 },
          { freq: 659.25, start: now + 0.11, dur: 0.09, gain: 0.50 },
          // 80ms pause
          { freq: 987.77, start: now + 0.28, dur: 0.08, gain: 0.58 },
          { freq: 659.25, start: now + 0.39, dur: 0.11, gain: 0.52 },
        ];

        for (const p of pulses) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle'; // Warm harmonics with punch, eliminating harsh square buzz
          osc.frequency.setValueAtTime(p.freq, p.start);

          gain.gain.setValueAtTime(0.001, p.start);
          gain.gain.linearRampToValueAtTime(p.gain, p.start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.001, p.start + p.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(p.start);
          osc.stop(p.start + p.dur + 0.01);
        }
      } else {
        // P1 (Urgent Hazard): Noticeable 2-pulse pattern (HIGH -> LOW)
        // High: 880 Hz (A5), Low: 587.33 Hz (D5)
        // Volume: Medium (~0.38), clear and distinct from P0.

        const pulses = [
          { freq: 880.00, start: now + 0.00, dur: 0.09, gain: 0.38 },
          { freq: 587.33, start: now + 0.13, dur: 0.12, gain: 0.34 },
        ];

        for (const p of pulses) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(p.freq, p.start);

          gain.gain.setValueAtTime(0.001, p.start);
          gain.gain.linearRampToValueAtTime(p.gain, p.start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.001, p.start + p.dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(p.start);
          osc.stop(p.start + p.dur + 0.01);
        }
      }

      return true;
    } catch (e) {
      console.warn('[AudioAlertService] Failed to play emergency tone:', e);
      return false;
    }
  }

  /**
   * Process a newly received or created incident.
   * If priority is P0 or P1, and not previously alerted:
   * 1. Dispatches a visual alert notification (regardless of mute state).
   * 2. Plays the emergency alert tone (if sound is not muted).
   * 3. Marks the incident ID as alerted and persists to storage.
   * 
   * P2 / Routine incidents are completely silent.
   */
  public handleIncomingIncident(incident: {
    id?: string;
    incidentId?: string;
    title?: string;
    type?: string;
    priority?: string;
    badgeColor?: string;
  }): boolean {
    if (!incident) return false;
    const alertId = incident.id || incident.incidentId;
    if (!alertId) return false;

    // Strict priority classification
    const isP0 = incident.priority === 'P0' || incident.badgeColor === 'error';
    const isP1 = incident.priority === 'P1' || incident.badgeColor === 'amber';

    if (!isP0 && !isP1) {
      // P2 / Routine does not trigger an emergency sound
      return false;
    }

    if (this.hasAlerted(alertId)) {
      // Already alerted, do not play duplicate sound or dispatch duplicate alert
      return false;
    }

    // Mark alerted persistently
    this.markAlerted(alertId);

    // 1. Dispatch Visual Alert (always fires, even if audio is muted)
    const priorityLabel = isP0 ? 'P0 Critical' : 'P1 Urgent';
    const titleText = incident.title || (isP0 ? 'Critical Emergency Incident' : 'Urgent Safety Alert');
    this.dispatchVisualAlert({
      id: alertId,
      type: isP0 ? 'P0_CRITICAL' : 'P1_URGENT',
      title: `🚨 ${priorityLabel}: ${titleText}`,
      message: `New ${priorityLabel} emergency received across offline mesh.`,
      priority: isP0 ? 'P0' : 'P1',
      timestamp: Date.now(),
    });

    // 2. Play Emergency Tone (honors mute setting)
    this.playEmergencyChime(isP0 ? 'P0' : 'P1');
    return true;
  }
}

// Export singleton instance
export const audioAlertService = new AudioAlertService();
