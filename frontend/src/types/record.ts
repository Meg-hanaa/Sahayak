/**
 * Types and data models for Phase 5 / Phase 7 bilingual consultation records.
 * Aligned with backend domain models in backend/sahayak/domain/models.py
 * and FastAPI schema in backend/sahayak/api/sessions.py.
 */

import type { LanguageCode, ParticipantRole } from './consultation.ts';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type SafetyState =
  | 'standard'
  | 'needs_confirmation'
  | 'needs_repetition'
  | 'verified'
  | 'unresolved'
  | 'escalate';

export interface ConversationTurnRecord {
  turn_id: string;
  speaker_role: ParticipantRole;
  source_language: LanguageCode;
  target_language: LanguageCode;
  source_text: string;
  translated_text: string | null;
  timestamp: string;
  processing_status: ProcessingStatus;
  confidence_data?: Record<string, number> | null;
  safety_state: SafetyState;
  speech_end_time?: string | null;
  output_start_time?: string | null;
  latency_ms?: number | null;
  retry_count: number;
  error_message?: string | null;
}

export interface VerifiedFactRecord {
  fact_id: string;
  turn_id: string;
  category: string;
  original_source_wording: string;
  translated_wording: string;
  confirmation_reference: string;
  verified_at: string;
}

export interface UnresolvedItemRecord {
  item_id: string;
  turn_id: string;
  source_wording: string;
  category?: string | null;
  reason: string;
  timestamp: string;
}

export interface LatencySummaryRecord {
  sample_count: number;
  min_seconds: number | null;
  max_seconds: number | null;
  median_seconds: number | null;
  p95_seconds: number | null;
  target_met: boolean;
}

export interface SessionRecordResponse {
  session_id: string;
  ordered_turn_ids: string[];
  verified_fact_ids: string[];
  unresolved_turn_ids: string[];
  generated_at: string;
  conversation: ConversationTurnRecord[];
  verified_facts: VerifiedFactRecord[];
  unresolved_items: UnresolvedItemRecord[];
  latency_metrics: LatencySummaryRecord | null;
}
