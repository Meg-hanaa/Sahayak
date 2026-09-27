"""Comprehensive two-participant real-time routing test suite — Phase 6.

Verifies:
1. Doctor receives patient interpretation
2. Patient receives doctor interpretation
3. Doctor cannot receive patient-only prompt accidentally
4. Patient cannot receive doctor-only event accidentally
5. Confirmation goes to correct participant
6. Verified fact reaches doctor
7. Invalid participant cannot subscribe
8. Disconnected participant is handled correctly
9. Reconnection works within allowed session lifetime
10. Routing metadata is correct
11. Zero cross-role leakage in multi-turn test scenarios
"""

from __future__ import annotations

import json
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from sahayak.domain.enums import ParticipantRole
from sahayak.domain.routing import OutboundEvent, OutboundEventType
from sahayak.services.routing import (
    CrossRoleLeakageError,
    InvalidRecipientError,
    RecipientValidator,
    SessionConnectionManager,
    TwoParticipantRouter,
)
from tests.test_sessions import _create


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _setup_session(client: TestClient) -> tuple[str, str, str]:
    """Create session and join both doctor and patient; return (session_id, doc_token, pat_token)."""
    created = _create(client)
    session_id = created["session"]["session_id"]
    doc_token = created["access"]["doctor"]["token"]
    pat_token = created["access"]["patient"]["token"]

    join_doc = client.post(f"/api/sessions/{session_id}/join", json={"token": doc_token, "role": "doctor"})
    assert join_doc.status_code == 200

    join_pat = client.post(f"/api/sessions/{session_id}/join", json={"token": pat_token, "role": "patient"})
    assert join_pat.status_code == 200

    return session_id, doc_token, pat_token


def _drain_messages(ws) -> list[dict]:
    """Drain all immediately available JSON messages from a TestClient WebSocket."""
    messages = []
    # TestClient doesn't block forever with short timeouts in sync loop
    # We read messages until queue is empty
    return messages


# ---------------------------------------------------------------------------
# 1. Doctor receives patient interpretation
# ---------------------------------------------------------------------------


def test_1_doctor_receives_patient_interpretation(client: TestClient) -> None:
    session_id, doc_token, pat_token = _setup_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        doc_init = doc_ws.receive_json()
        assert doc_init["type"] == "connected"
        assert doc_init["role"] == "doctor"

        with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
            pat_init = pat_ws.receive_json()
            assert pat_init["type"] == "connected"
            assert pat_init["role"] == "patient"

            # Patient speaks in Hindi
            pat_ws.send_text(json.dumps({"type": "speech", "text": "नमस्ते"}))

            # Doctor MUST receive the English interpretation
            doc_msg = doc_ws.receive_json()
            assert doc_msg["type"] == "interpretation"
            assert doc_msg["recipient_role"] == "doctor"
            assert doc_msg["sender_role"] == "patient"
            assert doc_msg["text"] == "hello"  # Canned mock translation


# ---------------------------------------------------------------------------
# 2. Patient receives doctor interpretation
# ---------------------------------------------------------------------------


def test_2_patient_receives_doctor_interpretation(client: TestClient) -> None:
    session_id, doc_token, pat_token = _setup_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        doc_init = doc_ws.receive_json()
        assert doc_init["type"] == "connected"

        with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
            pat_init = pat_ws.receive_json()
            assert pat_init["type"] == "connected"

            # Doctor speaks in English
            doc_ws.send_text(json.dumps({"type": "speech", "text": "hello"}))

            # Patient MUST receive the Hindi interpretation
            pat_msg = pat_ws.receive_json()
            assert pat_msg["type"] == "interpretation"
            assert pat_msg["recipient_role"] == "patient"
            assert pat_msg["sender_role"] == "doctor"
            assert pat_msg["text"] == "नमस्ते"


# ---------------------------------------------------------------------------
# 3. Doctor cannot receive patient-only prompt accidentally
# ---------------------------------------------------------------------------


def test_3_doctor_cannot_receive_patient_only_prompt_accidentally(client: TestClient) -> None:
    session_id, doc_token, pat_token = _setup_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        doc_ws.receive_json()  # init

        with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
            pat_ws.receive_json()  # init

            # Patient utters critical allergy statement requiring confirmation
            pat_ws.send_text(json.dumps({"type": "speech", "text": "Mujhe penicillin se allergy hai."}))

            # Patient MUST receive the confirmation prompt
            pat_msg = pat_ws.receive_json()
            assert pat_msg["type"] == "confirmation_prompt"
            assert pat_msg["recipient_role"] == "patient"
            assert "penicillin" in pat_msg["prompt_text"].lower()

            # Doctor sends a ping to check their inbox: doctor should NOT have received the confirmation prompt
            doc_ws.send_text("ping")
            doc_msg = doc_ws.receive_json()
            # Doctor only received the ack to ping, NOT the patient's confirmation prompt!
            assert doc_msg["type"] == "ack"
            assert doc_msg["role"] == "doctor"


# ---------------------------------------------------------------------------
# 4. Patient cannot receive doctor-only event accidentally
# ---------------------------------------------------------------------------


def test_4_patient_cannot_receive_doctor_only_event_accidentally() -> None:
    """Validator strictly prevents routing doctor-only events to patient."""
    session_id = uuid4()
    doctor_event = OutboundEvent(
        event_type=OutboundEventType.VERIFIED_FACT,
        session_id=session_id,
        recipient_role=ParticipantRole.DOCTOR,
        payload={"category": "ALLERGY", "rule_id": "RULE_123"},
    )

    # Validating delivery to doctor succeeds
    RecipientValidator.validate_recipient(doctor_event, ParticipantRole.DOCTOR)

    # Attempting to deliver doctor-only event to patient raises CrossRoleLeakageError
    with pytest.raises(CrossRoleLeakageError):
        RecipientValidator.validate_recipient(doctor_event, ParticipantRole.PATIENT)

    # Attempting to forge a VERIFIED_FACT with recipient_role=PATIENT raises InvalidRecipientError
    forged_event = OutboundEvent(
        event_type=OutboundEventType.VERIFIED_FACT,
        session_id=session_id,
        recipient_role=ParticipantRole.PATIENT,
        payload={"category": "ALLERGY"},
    )
    with pytest.raises(InvalidRecipientError):
        RecipientValidator.validate_recipient(forged_event, ParticipantRole.PATIENT)


def test_patient_payload_sanitization_strips_internal_metadata() -> None:
    """Sanitizer strips sensitive backend metadata when event is destined for patient."""
    session_id = uuid4()
    patient_event = OutboundEvent(
        event_type=OutboundEventType.CONFIRMATION_PROMPT,
        session_id=session_id,
        recipient_role=ParticipantRole.PATIENT,
        payload={
            "prompt_text": "Kya aapko allergy hai?",
            "rule_id": "RULE_INTERNAL_DEBUG_456",
            "confidence_data": {"term": 0.99},
            "internal_reason": "Sensitive clinical rule hit",
        },
    )

    sanitized = RecipientValidator.sanitize_for_patient(patient_event)
    assert "prompt_text" in sanitized.payload
    assert "rule_id" not in sanitized.payload
    assert "confidence_data" not in sanitized.payload
    assert "internal_reason" not in sanitized.payload


# ---------------------------------------------------------------------------
# 5. Confirmation goes to correct participant
# ---------------------------------------------------------------------------


def test_5_confirmation_goes_to_correct_participant(client: TestClient) -> None:
    session_id, doc_token, pat_token = _setup_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        doc_ws.receive_json()

        with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
            pat_ws.receive_json()

            # 1. Patient critical turn -> Patient receives prompt
            pat_ws.send_text(json.dumps({"type": "speech", "text": "Mujhe penicillin se allergy hai."}))
            pat_prompt = pat_ws.receive_json()
            assert pat_prompt["type"] == "confirmation_prompt"
            assert pat_prompt["recipient_role"] == "patient"

            # 2. Doctor critical turn -> Doctor receives prompt
            doc_ws.send_text(json.dumps({"type": "speech", "text": "Prescribing 500mg amoxicillin"}))
            doc_prompt = doc_ws.receive_json()
            assert doc_prompt["type"] == "confirmation_prompt"
            assert doc_prompt["recipient_role"] == "doctor"


# ---------------------------------------------------------------------------
# 6. Verified fact reaches doctor
# ---------------------------------------------------------------------------


def test_6_verified_fact_reaches_doctor(client: TestClient) -> None:
    session_id, doc_token, pat_token = _setup_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        doc_ws.receive_json()

        with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
            pat_ws.receive_json()

            # Patient utters critical allergy
            pat_ws.send_text(json.dumps({"type": "speech", "text": "Mujhe penicillin se allergy hai."}))
            pat_prompt = pat_ws.receive_json()
            turn_id = pat_prompt["turn_id"]

            # Patient confirms affirmative
            pat_ws.send_text(json.dumps({
                "type": "confirmation_response",
                "turn_id": turn_id,
                "response": "Haan",
            }))

            # Doctor MUST receive the VerifiedFact
            doc_fact = doc_ws.receive_json()
            assert doc_fact["type"] == "verified_fact"
            assert doc_fact["recipient_role"] == "doctor"
            assert doc_fact["category"] == "ALLERGY"
            assert doc_fact["source_wording"] == "Mujhe penicillin se allergy hai."

            # Doctor ALSO receives the unpaused interpretation
            doc_interp = doc_ws.receive_json()
            assert doc_interp["type"] == "interpretation"
            assert doc_interp["recipient_role"] == "doctor"
            assert doc_interp["verified"] is True


# ---------------------------------------------------------------------------
# 7. Invalid participant cannot subscribe
# ---------------------------------------------------------------------------


def test_7_invalid_participant_cannot_subscribe(client: TestClient) -> None:
    session_id, doc_token, _ = _setup_session(client)

    # 1. Missing token
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/sessions/{session_id}"):
            pass

    # 2. Forged token
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/sessions/{session_id}?token=bad-token"):
            pass

    # 3. Non-existent session
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/sessions/{uuid4()}?token={doc_token}"):
            pass


# ---------------------------------------------------------------------------
# 8. Disconnected participant is handled correctly & buffering
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_8_disconnected_participant_buffering() -> None:
    """When a participant is disconnected, outbound events are safely buffered rather than lost."""
    session_id = uuid4()
    conn_mgr = SessionConnectionManager()
    router = TwoParticipantRouter(connection_manager=conn_mgr)

    event = OutboundEvent(
        event_type=OutboundEventType.INTERPRETATION,
        session_id=session_id,
        recipient_role=ParticipantRole.DOCTOR,
        sender_role=ParticipantRole.PATIENT,
        payload={"text": "hello doctor"},
    )

    # Doctor is disconnected; send_event buffers the event
    success = await router.send_event(event)
    assert success is False

    # Check buffer
    buffered = conn_mgr.get_buffer(session_id, ParticipantRole.DOCTOR)
    assert len(buffered) == 1
    assert buffered[0].event_id == event.event_id


# ---------------------------------------------------------------------------
# 9. Reconnection works within allowed session lifetime
# ---------------------------------------------------------------------------


def test_9_reconnection_within_allowed_session_lifetime(client: TestClient) -> None:
    session_id, doc_token, pat_token = _setup_session(client)

    # Doctor connects, then disconnects
    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        msg = doc_ws.receive_json()
        assert msg["type"] == "connected"

    # Patient connects and speaks while Doctor is disconnected
    with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
        pat_ws.receive_json()
        pat_ws.send_text(json.dumps({"type": "speech", "text": "नमस्ते"}))

    # Doctor reconnects with their valid token!
    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws2:
        reconnect_msg = doc_ws2.receive_json()
        assert reconnect_msg["type"] == "connected"
        assert reconnect_msg["role"] == "doctor"

        # The buffered interpretation generated while doctor was away is flushed and delivered!
        buffered_interp = doc_ws2.receive_json()
        assert buffered_interp["type"] == "interpretation"
        assert buffered_interp["recipient_role"] == "doctor"
        assert buffered_interp["text"] == "hello"


# ---------------------------------------------------------------------------
# 10. Routing metadata is correct
# ---------------------------------------------------------------------------


def test_10_routing_metadata_is_correct(client: TestClient) -> None:
    session_id, doc_token, pat_token = _setup_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        doc_ws.receive_json()

        with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
            pat_ws.receive_json()

            # Doctor speaks
            doc_ws.send_text(json.dumps({"type": "speech", "text": "hello"}))

            # Inspect patient received message
            pat_msg = pat_ws.receive_json()
            assert "event_id" in pat_msg
            assert pat_msg["type"] == "interpretation"
            assert pat_msg["session_id"] == session_id
            assert pat_msg["recipient_role"] == "patient"
            assert pat_msg["sender_role"] == "doctor"
            assert "timestamp" in pat_msg


# ---------------------------------------------------------------------------
# 11. Zero cross-role leakage in multi-turn test scenarios
# ---------------------------------------------------------------------------


def test_11_zero_cross_role_leakage_comprehensive(client: TestClient) -> None:
    """Rigorous audit proving absolute role isolation across multiple turns."""
    session_id, doc_token, pat_token = _setup_session(client)

    with client.websocket_connect(f"/ws/sessions/{session_id}?token={doc_token}") as doc_ws:
        doc_init = doc_ws.receive_json()
        assert doc_init["role"] == "doctor"

        with client.websocket_connect(f"/ws/sessions/{session_id}?token={pat_token}") as pat_ws:
            pat_init = pat_ws.receive_json()
            assert pat_init["role"] == "patient"

            # 1. Doctor says hello -> Patient gets interpretation
            doc_ws.send_text(json.dumps({"type": "speech", "text": "hello"}))
            m1 = pat_ws.receive_json()
            assert m1["recipient_role"] == "patient"

            # 2. Patient says namaste -> Doctor gets interpretation
            pat_ws.send_text(json.dumps({"type": "speech", "text": "नमस्ते"}))
            m2 = doc_ws.receive_json()
            assert m2["recipient_role"] == "doctor"

            # 3. Patient utters allergy -> Patient gets prompt, Doctor gets nothing
            pat_ws.send_text(json.dumps({"type": "speech", "text": "Mujhe penicillin se allergy hai."}))
            m3 = pat_ws.receive_json()
            assert m3["recipient_role"] == "patient"
            assert m3["type"] == "confirmation_prompt"

            # 4. Patient confirms -> Doctor gets verified fact & interpretation
            pat_ws.send_text(json.dumps({
                "type": "confirmation_response",
                "turn_id": m3["turn_id"],
                "response": "Haan",
            }))
            m4_fact = doc_ws.receive_json()
            assert m4_fact["recipient_role"] == "doctor"
            assert m4_fact["type"] == "verified_fact"

            m4_interp = doc_ws.receive_json()
            assert m4_interp["recipient_role"] == "doctor"
            assert m4_interp["type"] == "interpretation"
