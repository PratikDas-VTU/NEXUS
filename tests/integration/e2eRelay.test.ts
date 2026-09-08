import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NexusDatabase } from '../../backend/data/db';
import { OfflineStorageAdapter } from '../../backend/data/adapter';
import { FrontendIncidentService } from '../../backend/data/incidentService';
import { RelayEngine } from '../../networking/relayEngine';
import type { ITransport } from '../../shared/interfaces';
import type { RelayMessage } from '../../shared/protocol';
import type { Incident, DraftIncident } from '../../shared/types';
import { audioAlertService } from '../../frontend/src/services/audioAlertService';

/**
 * Direct in-memory simulated paired transport for headless testing
 */
class PairedMockTransport implements ITransport {
  public readonly transportType = 'webrtc' as const;
  public readonly remotePeerId: string;
  private peerTransport: PairedMockTransport | null = null;
  private messageHandlers: Array<(msg: RelayMessage) => void> = [];
  private closeHandlers: Array<(reason?: string) => void> = [];
  private open = true;

  constructor(remotePeerId: string) {
    this.remotePeerId = remotePeerId;
  }

  public pairWith(other: PairedMockTransport): void {
    this.peerTransport = other;
  }

  public isOpen(): boolean {
    return this.open;
  }

  public async send(message: RelayMessage): Promise<void> {
    if (!this.open || !this.peerTransport) {
      throw new Error('Transport closed');
    }
    // Asynchronous microtask delivery
    queueMicrotask(() => {
      if (this.peerTransport?.open) {
        for (const handler of this.peerTransport.messageHandlers) {
          handler(message);
        }
      }
    });
  }

  public onMessage(handler: (message: RelayMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  public onClose(handler: (reason?: string) => void): void {
    this.closeHandlers.push(handler);
  }

  public close(): void {
    if (!this.open) return;
    this.open = false;
    for (const handler of this.closeHandlers) {
      handler('Closed');
    }
    if (this.peerTransport && this.peerTransport.open) {
      this.peerTransport.close();
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('STAGE 7: End-to-End Multi-Node Peer Relay & Reactive Data Core', () => {
  let dbA: NexusDatabase;
  let dbB: NexusDatabase;
  let serviceA: FrontendIncidentService;
  let serviceB: FrontendIncidentService;
  let engineA: RelayEngine;
  let engineB: RelayEngine;
  let transportA: PairedMockTransport;
  let transportB: PairedMockTransport;

  beforeEach(() => {
    const idA = 'test_node_a_' + Math.random().toString(36).slice(2);
    const idB = 'test_node_b_' + Math.random().toString(36).slice(2);

    dbA = new NexusDatabase(idA);
    dbB = new NexusDatabase(idB);

    const adapterA = new OfflineStorageAdapter(dbA);
    const adapterB = new OfflineStorageAdapter(dbB);

    serviceA = new FrontendIncidentService(dbA);
    serviceB = new FrontendIncidentService(dbB);

    engineA = new RelayEngine('DEV-NODE-A', adapterA);
    engineB = new RelayEngine('DEV-NODE-B', adapterB);

    transportA = new PairedMockTransport('DEV-NODE-B');
    transportB = new PairedMockTransport('DEV-NODE-A');
    transportA.pairWith(transportB);
    transportB.pairWith(transportA);
  });

  afterEach(async () => {
    transportA.close();
    transportB.close();
    await engineA.stop();
    await engineB.stop();
    await dbA.delete();
    await dbB.delete();
  });

  it('relays newly created incident from Node A to Node B via P2P handshake and notifies reactive subscription', async () => {
    // 1. Setup reactive subscription on Node B
    const receivedAtNodeB: Incident[] = [];
    const unsubB = serviceB.subscribeToIncidents((incidents) => {
      receivedAtNodeB.length = 0;
      receivedAtNodeB.push(...incidents);
    });

    // Wait for initial subscription emission
    await delay(30);
    expect(receivedAtNodeB.length).toBe(0);

    // 2. Node A creates a new emergency draft
    const draft: DraftIncident = {
      type: 'medical',
      priority: 'P0',
      latitude: 12.9716,
      longitude: 77.5946,
      peopleAffected: 2,
      description: 'Medical Emergency at Sector 4 Gate A',
    };

    const incidentA = await serviceA.createIncident(draft);
    expect(incidentA.incidentId).toBeDefined();
    expect(incidentA.version).toBe(1);
    expect(incidentA.hopCount).toBe(0);
    expect(incidentA.status).toBe('queued');

    // Verify Node A outbox has 1 pending item
    const outboxCountA = await serviceA.getOutboxCount();
    expect(outboxCountA).toBe(1);

    // 3. Register transports (simulating WebRTC DataChannel connection open)
    engineA.registerTransport(transportA);
    engineB.registerTransport(transportB);

    // Allow protocol state machine exchange:
    // HELLO -> MANIFEST -> REQUEST -> PAYLOAD -> ACK
    await delay(100);

    // 4. Assert Node B persisted the relayed incident into Dexie
    const storedAtB = await serviceB.getIncident(incidentA.incidentId);
    expect(storedAtB).toBeDefined();
    expect(storedAtB?.incidentId).toBe(incidentA.incidentId);
    expect(storedAtB?.priority).toBe('P0');
    expect(storedAtB?.type).toBe('medical');
    expect(storedAtB?.hopCount).toBe(1); // Hop count incremented by 1

    // 5. Assert Node B reactive subscription fired with the relayed incident
    expect(receivedAtNodeB.length).toBe(1);
    expect(receivedAtNodeB[0].incidentId).toBe(incidentA.incidentId);

    // 6. Assert Node A received ACK and advanced incident status to 'relayed'
    const updatedAtA = await serviceA.getIncident(incidentA.incidentId);
    expect(updatedAtA?.status).toBe('relayed');

    unsubB();
  });

  it('verifies 3-node Store-Carry-Forward multi-hop (Node A -> Node B -> Node C)', async () => {
    // Setup Node C
    const idC = 'test_node_c_' + Math.random().toString(36).slice(2);
    const dbC = new NexusDatabase(idC);
    const adapterC = new OfflineStorageAdapter(dbC);
    const serviceC = new FrontendIncidentService(dbC);
    const engineC = new RelayEngine('DEV-NODE-C', adapterC);

    try {
      // 1. Node A creates an emergency incident
      const incident = await serviceA.createIncident({
        type: 'trapped',
        priority: 'P0',
        latitude: 13.0827,
        longitude: 80.2707,
        peopleAffected: 4,
        description: 'Collapsed structure at Ground Station',
      });
      expect(incident.hopCount).toBe(0);

      // 2. Hop 1: Node A connects to Node B
      engineA.registerTransport(transportA);
      engineB.registerTransport(transportB);
      await delay(100);

      const storedB = await serviceB.getIncident(incident.incidentId);
      expect(storedB).toBeDefined();
      expect(storedB?.hopCount).toBe(1);

      // 3. Node A disconnects (Store-Carry-Forward in progress)
      transportA.close();
      transportB.close();
      await delay(30);

      // 4. Hop 2: Node B moves and connects to Node C
      const transportB2 = new PairedMockTransport('DEV-NODE-C');
      const transportC = new PairedMockTransport('DEV-NODE-B');
      transportB2.pairWith(transportC);
      transportC.pairWith(transportB2);

      engineB.registerTransport(transportB2);
      engineC.registerTransport(transportC);
      await delay(100);

      // 5. Verify Node C received the incident with hopCount = 2
      const storedC = await serviceC.getIncident(incident.incidentId);
      expect(storedC).toBeDefined();
      expect(storedC?.incidentId).toBe(incident.incidentId);
      expect(storedC?.hopCount).toBe(2);
      expect(storedC?.peopleAffected).toBe(4);

      transportB2.close();
      transportC.close();
    } finally {
      await engineC.stop();
      await dbC.delete();
    }
  });

  it('verifies 1-click network-wide PURGE wipes data across all connected mesh nodes', async () => {
    // 1. Create incidents on Node A and Node B
    const incA = await serviceA.createIncident({
      type: 'medical',
      priority: 'P1',
      latitude: 12.9716,
      longitude: 77.5946,
      peopleAffected: 2,
      description: 'Demo medical emergency on Node A',
    });

    const incB = await serviceB.createIncident({
      type: 'safety',
      priority: 'P0',
      latitude: 12.9717,
      longitude: 77.5947,
      peopleAffected: 5,
      description: 'Demo safety hazard on Node B',
    });

    // 2. Connect and sync between Node A and Node B
    engineA.registerTransport(transportA);
    engineB.registerTransport(transportB);
    await delay(100);

    // Verify both nodes have synced all incidents
    const listA = await serviceA.listIncidents();
    const listB = await serviceB.listIncidents();
    expect(listA.length).toBe(2);
    expect(listB.length).toBe(2);

    // 3. Setup remote purge handler on Node B
    let nodeBPurgeReceived = false;
    engineB.onPurge = async (fromPeerId, reason) => {
      nodeBPurgeReceived = true;
      await dbB.incidents.clear();
      await dbB.outbox.clear();
    };

    // 4. Node A initiates 1-click network-wide purge
    await dbA.incidents.clear();
    await dbA.outbox.clear();
    await engineA.broadcastPurge('Admin demo reset');
    await delay(50);

    // 5. Verify Node B received the PURGE and wiped its data
    expect(nodeBPurgeReceived).toBe(true);
    const purgedA = await serviceA.listIncidents();
    const purgedB = await serviceB.listIncidents();
    expect(purgedA.length).toBe(0);
    expect(purgedB.length).toBe(0);

    // 6. Verify Store-Carry-Forward does NOT re-relays phantom data
    await engineA.triggerPeerSync();
    await delay(50);
    expect((await serviceA.listIncidents()).length).toBe(0);
    expect((await serviceB.listIncidents()).length).toBe(0);
  });

  it('verifies incoming real P0 emergency triggers reactive storage update and audio chime on Node B', async () => {
    // Spies on audioAlertService chime
    const chimeSpy = vi.spyOn(audioAlertService, 'playEmergencyChime');

    // 1. Setup subscription on Node B (mimicking ServiceContext / Admin Hub)
    const nodeBIncidents: Incident[] = [];
    const unsubB = serviceB.subscribeToIncidents((incidents) => {
      nodeBIncidents.length = 0;
      nodeBIncidents.push(...incidents);
      // ServiceContext live incoming monitoring
      for (const inc of incidents) {
        audioAlertService.handleIncomingIncident(inc);
      }
    });

    await delay(30);

    // 2. Field Phone (Node A) broadcasts P0 Emergency
    const phoneEmergency: DraftIncident = {
      type: 'medical',
      priority: 'P0',
      latitude: 13.2384,
      longitude: 80.0094,
      peopleAffected: 3,
      description: 'Critical distress beacon from field phone',
    };

    const createdOnPhone = await serviceA.createIncident(phoneEmergency);
    expect(createdOnPhone.incidentId).toBeDefined();

    // 3. Connect Phone (Node A) to Laptop (Node B)
    engineA.registerTransport(transportA);
    engineB.registerTransport(transportB);

    // Allow protocol state machine exchange
    await delay(120);

    // 4. Verify Node B (Laptop) has the emergency in Dexie
    const laptopStored = await serviceB.getIncident(createdOnPhone.incidentId);
    expect(laptopStored).toBeDefined();
    expect(laptopStored?.incidentId).toBe(createdOnPhone.incidentId);
    expect(laptopStored?.priority).toBe('P0');
    expect(laptopStored?.hopCount).toBe(1);

    // 5. Verify Node B reactive subscription received it
    expect(nodeBIncidents.length).toBe(1);
    expect(nodeBIncidents[0].incidentId).toBe(createdOnPhone.incidentId);

    // 6. Verify Audio Alert Service fired for P0
    expect(chimeSpy).toHaveBeenCalledWith('P0');

    // 7. Verify subsequent sync does NOT duplicate chime (persistent deduplication)
    chimeSpy.mockClear();
    await engineB.triggerPeerSync();
    await delay(50);
    expect(chimeSpy).not.toHaveBeenCalled();

    chimeSpy.mockRestore();
    unsubB();
  });
});
