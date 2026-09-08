import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// Provide global localStorage and AudioContext mock for Node test environment
beforeAll(() => {
  let store: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };

  class MockGainNode {
    gain = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    connect = vi.fn();
  }

  class MockOscillatorNode {
    type = 'sine';
    frequency = {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    connect = vi.fn();
    start = vi.fn();
    stop = vi.fn();
  }

  class MockAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    createGain() {
      return new MockGainNode();
    }
    createOscillator() {
      return new MockOscillatorNode();
    }
    resume = vi.fn().mockResolvedValue(undefined);
  }

  (globalThis as any).localStorage = mockStorage;
  (globalThis as any).AudioContext = MockAudioContext;
  (globalThis as any).window = globalThis;
});

import { audioAlertService, VisualAlertEvent } from '../audioAlertService';

describe('Audio Alert Service with Web Audio & Visual Alert Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    audioAlertService.setMuted(false);
    audioAlertService.clearAllPeerAlerts();
    audioAlertService.unlockAudio();
  });

  describe('Startup Seeding & Deduplication', () => {
    it('correctly seeds pre-existing historical incidents so they do not alert on startup', () => {
      const historicalIds = ['inc-history-1', 'inc-history-2', 'inc-history-3'];
      audioAlertService.seedSeenIncidents(historicalIds);

      expect(audioAlertService.hasAlerted('inc-history-1')).toBe(true);
      expect(audioAlertService.hasAlerted('inc-history-2')).toBe(true);
      expect(audioAlertService.hasAlerted('inc-history-3')).toBe(true);

      // Incoming check for historical incident should return false (no alert chime)
      const res = audioAlertService.handleIncomingIncident({ id: 'inc-history-1', priority: 'P0' });
      expect(res).toBe(false);
    });

    it('triggers alert chime and marks alerted for newly received P0 incident', () => {
      const newId = 'inc-new-critical-99';
      expect(audioAlertService.hasAlerted(newId)).toBe(false);

      const res = audioAlertService.handleIncomingIncident({ id: newId, priority: 'P0', title: 'Critical Bleed' });
      expect(res).toBe(true);
      expect(audioAlertService.hasAlerted(newId)).toBe(true);

      // Subsequent call with same ID (e.g. mesh re-relay across multiple hops) must NOT trigger alert sound
      const duplicateRes = audioAlertService.handleIncomingIncident({ id: newId, priority: 'P0' });
      expect(duplicateRes).toBe(false);
    });

    it('triggers alert chime for newly received P1 incident', () => {
      const p1Id = 'inc-new-hazard-42';
      const res = audioAlertService.handleIncomingIncident({ id: p1Id, priority: 'P1', title: 'Brushfire Flare' });
      expect(res).toBe(true);
      expect(audioAlertService.hasAlerted(p1Id)).toBe(true);
    });

    it('does NOT trigger audible alert for P2 standard/advisory incidents', () => {
      const p2Id = 'inc-resource-supplies-10';
      const res = audioAlertService.handleIncomingIncident({ id: p2Id, priority: 'P2', title: 'Water ration pickup' });
      expect(res).toBe(false);
    });
  });

  describe('Visual Alert Pairing & Mute Independence', () => {
    it('dispatches a visual alert event for P0 incident', () => {
      const receivedEvents: VisualAlertEvent[] = [];
      const unsub = audioAlertService.subscribeVisualAlert((evt) => {
        receivedEvents.push(evt);
      });

      const p0Id = 'inc-p0-visual-test';
      audioAlertService.handleIncomingIncident({
        id: p0Id,
        priority: 'P0',
        title: 'Building Collapse',
      });

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].id).toBe(p0Id);
      expect(receivedEvents[0].type).toBe('P0_CRITICAL');
      expect(receivedEvents[0].priority).toBe('P0');
      expect(receivedEvents[0].title).toContain('P0 Critical');

      unsub();
    });

    it('dispatches visual alert event EVEN WHEN audio is muted', () => {
      audioAlertService.setMuted(true);
      expect(audioAlertService.getIsMuted()).toBe(true);

      const receivedEvents: VisualAlertEvent[] = [];
      const unsub = audioAlertService.subscribeVisualAlert((evt) => {
        receivedEvents.push(evt);
      });

      const mutedP0Id = 'inc-p0-muted-test';
      const res = audioAlertService.handleIncomingIncident({
        id: mutedP0Id,
        priority: 'P0',
        title: 'Gas Leak',
      });

      // Returns true because the incident was handled and alerted
      expect(res).toBe(true);
      // Visual alert MUST still be delivered
      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].id).toBe(mutedP0Id);
      expect(receivedEvents[0].type).toBe('P0_CRITICAL');

      unsub();
    });

    it('respects mute state and persists preference', () => {
      audioAlertService.setMuted(true);
      expect(audioAlertService.getIsMuted()).toBe(true);
      expect(localStorage.getItem('nexus_alert_sound_muted')).toBe('true');

      // Direct chime play attempt when muted returns false
      const chimeRes = audioAlertService.playEmergencyChime('P0');
      expect(chimeRes).toBe(false);

      audioAlertService.setMuted(false);
      expect(audioAlertService.getIsMuted()).toBe(false);
      expect(localStorage.getItem('nexus_alert_sound_muted')).toBe('false');
    });
  });

  describe('Peer Detection & Connection Chirps', () => {
    it('plays peer detection chirp once per peer ID and deduplicates repeated discoveries', () => {
      const peerA = 'nexus-peer-alpha';

      // First discovery -> plays chirp
      const firstPlay = audioAlertService.playPeerDetectedChirp(peerA);
      expect(firstPlay).toBe(true);

      // Immediate repeated discovery in same scan cycle -> deduplicated
      const secondPlay = audioAlertService.playPeerDetectedChirp(peerA);
      expect(secondPlay).toBe(false);

      // Different peer -> plays chirp
      const peerB = 'nexus-peer-beta';
      const betaPlay = audioAlertService.playPeerDetectedChirp(peerB);
      expect(betaPlay).toBe(true);
    });

    it('plays peer connection tone once per peer and deduplicates', () => {
      const peerConn = 'nexus-peer-connected-1';

      // First connection -> plays tone
      const firstPlay = audioAlertService.playPeerConnectedTone(peerConn);
      expect(firstPlay).toBe(true);

      // Second attempt -> deduplicated
      const secondPlay = audioAlertService.playPeerConnectedTone(peerConn);
      expect(secondPlay).toBe(false);
    });

    it('allows chirp to replay after peer disconnects and resets', () => {
      const roamingPeer = 'nexus-peer-roamer';

      expect(audioAlertService.playPeerDetectedChirp(roamingPeer)).toBe(true);
      expect(audioAlertService.playPeerDetectedChirp(roamingPeer)).toBe(false);

      // Peer moves out of range and disconnects
      audioAlertService.resetPeerAlert(roamingPeer);

      // Peer returns into range and is detected again
      expect(audioAlertService.playPeerDetectedChirp(roamingPeer)).toBe(true);
    });

    it('clears all peer alert tracking when clearAllPeerAlerts is invoked', () => {
      audioAlertService.playPeerDetectedChirp('peer-1');
      audioAlertService.playPeerDetectedChirp('peer-2');
      audioAlertService.playPeerConnectedTone('peer-1');

      expect(audioAlertService.playPeerDetectedChirp('peer-1')).toBe(false);
      expect(audioAlertService.playPeerDetectedChirp('peer-2')).toBe(false);
      expect(audioAlertService.playPeerConnectedTone('peer-1')).toBe(false);

      audioAlertService.clearAllPeerAlerts();

      expect(audioAlertService.playPeerDetectedChirp('peer-1')).toBe(true);
      expect(audioAlertService.playPeerDetectedChirp('peer-2')).toBe(true);
      expect(audioAlertService.playPeerConnectedTone('peer-1')).toBe(true);
    });

    it('peer chirps are silent when muted', () => {
      audioAlertService.setMuted(true);
      const res = audioAlertService.playPeerDetectedChirp('peer-muted-test');
      expect(res).toBe(false);
      const resConn = audioAlertService.playPeerConnectedTone('peer-muted-test-2');
      expect(resConn).toBe(false);
    });
  });
});
