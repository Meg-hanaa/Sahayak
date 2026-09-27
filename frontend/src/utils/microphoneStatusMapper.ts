import type { MicrophoneStatus } from '../controllers/MicrophoneCheckController.ts';
import type { BackendMicrophoneStatus } from '../types/consultation.ts';

/**
 * Maps the frontend client microphone check status to the backend's accepted MicrophoneStatus enum:
 * 'unknown' | 'granted' | 'blocked' | 'muted'
 *
 * - Successful check (sound detected) -> 'granted'
 * - Clear permission denial -> 'blocked'
 * - Incomplete, idle, or uncertain -> 'unknown'
 */
export function mapToBackendMicrophoneStatus(
  status: MicrophoneStatus
): BackendMicrophoneStatus {
  if (status === 'sound_detected') {
    return 'granted';
  }
  if (status === 'denied') {
    return 'blocked';
  }
  return 'unknown';
}
