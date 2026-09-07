/**
 * NEXUS — Offline-First Emergency & Community Network
 * Networking & Local Signaling Types
 */

import type { DeviceId } from '../shared/types.ts';

export type SignalingMessageType =
  | 'SIGNAL_JOIN'
  | 'SIGNAL_PEERS'
  | 'SIGNAL_PEER_JOINED'
  | 'SIGNAL_PEER_LEFT'
  | 'SIGNAL_OFFER'
  | 'SIGNAL_ANSWER'
  | 'SIGNAL_CANDIDATE'
  | 'SIGNAL_RELAY'
  | 'SIGNAL_ERROR';

export interface SignalBaseMessage {
  type: SignalingMessageType;
  timestamp: number;
}

export interface SignalJoinMessage extends SignalBaseMessage {
  type: 'SIGNAL_JOIN';
  peerId: string;
  deviceId: DeviceId;
}

export interface PeerDescriptor {
  peerId: string;
  deviceId: DeviceId;
}

export interface SignalPeersMessage extends SignalBaseMessage {
  type: 'SIGNAL_PEERS';
  peers: PeerDescriptor[];
}

export interface SignalPeerJoinedMessage extends SignalBaseMessage {
  type: 'SIGNAL_PEER_JOINED';
  peer: PeerDescriptor;
}

export interface SignalPeerLeftMessage extends SignalBaseMessage {
  type: 'SIGNAL_PEER_LEFT';
  peerId: string;
}

export interface SignalOfferMessage extends SignalBaseMessage {
  type: 'SIGNAL_OFFER';
  fromPeerId: string;
  toPeerId: string;
  sdp: unknown; // RTCSessionDescriptionInit
}

export interface SignalAnswerMessage extends SignalBaseMessage {
  type: 'SIGNAL_ANSWER';
  fromPeerId: string;
  toPeerId: string;
  sdp: unknown; // RTCSessionDescriptionInit
}

export interface SignalCandidateMessage extends SignalBaseMessage {
  type: 'SIGNAL_CANDIDATE';
  fromPeerId: string;
  toPeerId: string;
  candidate: unknown; // RTCIceCandidateInit
}

export interface SignalRelayMessage extends SignalBaseMessage {
  type: 'SIGNAL_RELAY';
  fromPeerId: string;
  toPeerId: string;
  relayMessage: unknown;
}

export interface SignalErrorMessage extends SignalBaseMessage {
  type: 'SIGNAL_ERROR';
  error: string;
}

export interface SignalPurgeAllMessage extends SignalBaseMessage {
  type: 'SIGNAL_PURGE_ALL';
  fromPeerId?: string;
  reason?: string;
}

export type SignalingMessage =
  | SignalJoinMessage
  | SignalPeersMessage
  | SignalPeerJoinedMessage
  | SignalPeerLeftMessage
  | SignalOfferMessage
  | SignalAnswerMessage
  | SignalCandidateMessage
  | SignalRelayMessage
  | SignalErrorMessage
  | SignalPurgeAllMessage;
