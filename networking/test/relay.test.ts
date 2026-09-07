/**
 * NEXUS — Offline-First Emergency & Community Network
 * Isolated Networking & Relay Protocol Verification Test Suite
 * 
 * Verifies:
 * 1. 6-stage handshake (HELLO -> MANIFEST -> REQUEST -> PAYLOAD -> ACK)
 * 2. Store-Carry-Forward multi-hop (Peer A -> Peer B -> Peer C)
 * 3. Deduplication & semantic versioning (incomingVersion > localVersion)
 * 4. Hop budget enforcement (halts when hopCount >= MAX_HOPS)
 * 5. TTL expiration rejection
 * 
 * Can be executed directly with Node:
 *   node networking/test/relay.test.ts
 */

import assert from 'node:assert';
import type { ITransport } from '../../shared/interfaces.ts';
import type { RelayMessage } from '../../shared/protocol.ts';
import type { Incident } from '../../shared/types.ts';
import { MockStorageAdapter } from '../mockStorageAdapter.ts';
import { RelayEngine } from '../relayEngine.ts';

declare const process: { exit(code?: number): void; execPath: string };

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
    // Simulate async microtask delivery
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

// ─── TEST SUITE ──────────────────────────────────────────────────────────────

async function runRelayTests() {
  console.log('====================================================');
  console.log('🧪 Starting NEXUS Core Architecture & Relay Test Suite');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Two-Peer Handshake & Incident Transfer (A -> B)
  // ---------------------------------------------------------------------------
  console.log('▶ Test 1: Peer A -> Peer B direct store-carry-forward transfer...');
  {
    const storageA = new MockStorageAdapter();
    const storageB = new MockStorageAdapter();

    const engineA = new RelayEngine('DEV-LAPTOP-A', storageA);
    const engineB = new RelayEngine('DEV-LAPTOP-B', storageB);

    // Seed Peer A with a critical P0 incident
    const testIncident: Incident = {
      incidentId: 'inc-p0-001',
      originDeviceId: 'DEV-LAPTOP-A',
      type: 'medical',
      priority: 'P0',
      latitude: 12.9716,
      longitude: 77.5946,
      timestamp: Date.now(),
      status: 'stored',
      peopleAffected: 3,
      version: 1,
      hopCount: 0,
      ttl: 86400000,
      description: 'Severe injury requiring immediate medical triage',
    };
    storageA.seedIncident(testIncident);

    // Verify Peer B is initially empty
    assert.strictEqual(storageB.size(), 0, 'Peer B should start empty');

    // Create paired transports
    const transportA = new PairedMockTransport('PEER_B');
    const transportB = new PairedMockTransport('PEER_A');
    transportA.pairWith(transportB);
    transportB.pairWith(transportA);

    // Register transports simultaneously (simulating WebRTC DataChannel open)
    engineA.registerTransport(transportA);
    engineB.registerTransport(transportB);

    // Wait for async message exchange (HELLO -> MANIFEST -> REQUEST -> PAYLOAD -> ACK)
    await delay(50);

    // Assert Peer B received and stored the incident
    const storedAtB = storageB.getLocalIncident('inc-p0-001');
    assert.ok(storedAtB, 'Peer B must have persisted the incident');
    assert.strictEqual(storedAtB!.incidentId, 'inc-p0-001');
    assert.strictEqual(storedAtB!.priority, 'P0');
    assert.strictEqual(storedAtB!.hopCount, 1, 'Hop count should be incremented to 1');

    // Assert Peer A received ACK and marked incident as relayed
    const updatedAtA = storageA.getLocalIncident('inc-p0-001');
    assert.strictEqual(updatedAtA?.status, 'relayed', 'Peer A should mark status as relayed after ACK');

    transportA.close();
    console.log('  ✔ Passed: A -> B relay handshake complete, persisted at B, and ACKed at A.');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Multi-Hop Store-Carry-Forward (A -> B -> C)
  // ---------------------------------------------------------------------------
  console.log('\n▶ Test 2: Multi-Hop Store-Carry-Forward (A -> B, A leaves, B -> C)...');
  {
    const storageA = new MockStorageAdapter();
    const storageB = new MockStorageAdapter();
    const storageC = new MockStorageAdapter();

    const engineA = new RelayEngine('DEV-LAPTOP-A', storageA);
    const engineB = new RelayEngine('DEV-LAPTOP-B', storageB);
    const engineC = new RelayEngine('DEV-LAPTOP-C', storageC);

    // Seed Peer A
    storageA.seedIncident({
      incidentId: 'inc-multi-hop-001',
      originDeviceId: 'DEV-LAPTOP-A',
      type: 'trapped',
      priority: 'P0',
      latitude: 13.0827,
      longitude: 80.2707,
      timestamp: Date.now(),
      status: 'stored',
      peopleAffected: 2,
      version: 1,
      hopCount: 0,
      ttl: 86400000,
      description: 'Trapped in building ground floor',
    });

    // 1. Peer A connects to Peer B
    const tA = new PairedMockTransport('PEER_B');
    const tB1 = new PairedMockTransport('PEER_A');
    tA.pairWith(tB1);
    tB1.pairWith(tA);

    engineA.registerTransport(tA);
    engineB.registerTransport(tB1);
    await delay(50);

    // Verify stored at B with hopCount = 1
    const atB = storageB.getLocalIncident('inc-multi-hop-001');
    assert.ok(atB, 'Incident must be stored at B');
    assert.strictEqual(atB!.hopCount, 1);

    // 2. Peer A disconnects (Store-Carry-Forward)
    tA.close();
    await delay(20);

    // 3. Peer B moves and connects to Peer C
    const tB2 = new PairedMockTransport('PEER_C');
    const tC = new PairedMockTransport('PEER_B');
    tB2.pairWith(tC);
    tC.pairWith(tB2);

    engineB.registerTransport(tB2);
    engineC.registerTransport(tC);
    await delay(50);

    // Verify stored at C with hopCount = 2
    const atC = storageC.getLocalIncident('inc-multi-hop-001');
    assert.ok(atC, 'Incident must be stored at C via multi-hop');
    assert.strictEqual(atC!.hopCount, 2, 'Hop count at C must be 2');

    tB2.close();
    console.log('  ✔ Passed: A -> B -> C multi-hop relay preserved data and incremented hopCount to 2.');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Deduplication & Semantic Versioning
  // ---------------------------------------------------------------------------
  console.log('\n▶ Test 3: Deduplication & Semantic Versioning...');
  {
    const storage = new MockStorageAdapter();
    storage.seedIncident({
      incidentId: 'inc-version-001',
      originDeviceId: 'DEV-A',
      type: 'shelter',
      priority: 'P2',
      latitude: 10.0,
      longitude: 20.0,
      timestamp: Date.now(),
      status: 'stored',
      peopleAffected: 5,
      version: 2,
      hopCount: 1,
      ttl: 86400000,
    });

    // Attempt to ingest same version (v2) -> Must reject
    const dupResult = await storage.ingestRelayedIncident({
      incidentId: 'inc-version-001',
      originDeviceId: 'DEV-A',
      type: 'shelter',
      priority: 'P2',
      latitude: 10.0,
      longitude: 20.0,
      timestamp: Date.now(),
      status: 'stored',
      peopleAffected: 5,
      version: 2,
      hopCount: 1,
      ttl: 86400000,
    });
    assert.strictEqual(dupResult.accepted, false, 'Same version must be ignored/rejected');
    assert.strictEqual(dupResult.code, 'STALE_VERSION');

    // Attempt to ingest lower version (v1) -> Must reject
    const staleResult = await storage.ingestRelayedIncident({
      incidentId: 'inc-version-001',
      originDeviceId: 'DEV-A',
      type: 'shelter',
      priority: 'P2',
      latitude: 10.0,
      longitude: 20.0,
      timestamp: Date.now(),
      status: 'stored',
      peopleAffected: 5,
      version: 1,
      hopCount: 1,
      ttl: 86400000,
    });
    assert.strictEqual(staleResult.accepted, false, 'Lower version must be rejected');
    assert.strictEqual(staleResult.code, 'STALE_VERSION');

    // Attempt to ingest higher version (v3) -> Must accept and update
    const higherResult = await storage.ingestRelayedIncident({
      incidentId: 'inc-version-001',
      originDeviceId: 'DEV-A',
      type: 'shelter',
      priority: 'P2',
      latitude: 10.0,
      longitude: 20.0,
      timestamp: Date.now(),
      status: 'stored',
      peopleAffected: 12, // Updated field
      version: 3,
      hopCount: 1,
      ttl: 86400000,
    });
    assert.strictEqual(higherResult.accepted, true, 'Higher version must be accepted');
    assert.strictEqual(storage.getLocalIncident('inc-version-001')?.peopleAffected, 12);

    console.log('  ✔ Passed: Stale versions rejected, higher versions accepted.');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Hop Budget Enforcement (Max Hops = 3)
  // ---------------------------------------------------------------------------
  console.log('\n▶ Test 4: Hop budget enforcement (Max hops = 3)...');
  {
    const storageA = new MockStorageAdapter();
    const storageB = new MockStorageAdapter();
    const engineA = new RelayEngine('DEV-A', storageA);
    const engineB = new RelayEngine('DEV-B', storageB);

    // Incident that has already traversed 3 hops
    storageA.seedIncident({
      incidentId: 'inc-exhausted-hops',
      originDeviceId: 'DEV-X',
      type: 'resource',
      priority: 'P2',
      latitude: 10.0,
      longitude: 20.0,
      timestamp: Date.now(),
      status: 'stored',
      peopleAffected: 1,
      version: 1,
      hopCount: 3, // Exhausted
      ttl: 86400000,
    });

    const tA = new PairedMockTransport('PEER_B');
    const tB = new PairedMockTransport('PEER_A');
    tA.pairWith(tB);
    tB.pairWith(tA);

    engineA.registerTransport(tA);
    engineB.registerTransport(tB);
    await delay(50);

    // Peer B should NOT receive the exhausted incident because Peer A halted forwarding
    assert.strictEqual(
      storageB.getLocalIncident('inc-exhausted-hops'),
      undefined,
      'Incident with hopCount >= MAX_HOPS must not be forwarded'
    );

    tA.close();
    console.log('  ✔ Passed: Forwarding halted when hop budget is exhausted.');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: TTL Expiration Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n▶ Test 5: TTL expiration rejection...');
  {
    const storage = new MockStorageAdapter();
    const expiredIncident: Incident = {
      incidentId: 'inc-expired-001',
      originDeviceId: 'DEV-OLD',
      type: 'safety',
      priority: 'P3',
      latitude: 10.0,
      longitude: 20.0,
      timestamp: Date.now() - 100000, // Created in the past
      ttl: 50000, // TTL already exceeded
      status: 'stored',
      peopleAffected: 0,
      version: 1,
      hopCount: 1,
    };

    const result = await storage.ingestRelayedIncident(expiredIncident);
    assert.strictEqual(result.accepted, false, 'Expired incident must be rejected');
    assert.strictEqual(result.code, 'TTL_EXPIRED');

    console.log('  ✔ Passed: Expired incidents safely rejected.');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 5 TEST SCENARIOS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runRelayTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
