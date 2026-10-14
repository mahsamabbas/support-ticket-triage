from tests.fakes import classification_json


def triage(client, ticket_id="NG-1001"):
    assert client.post(f"/tickets/{ticket_id}/triage").status_code == 200


def approve(**overrides):
    body = {
        "action": "approve",
        "final_category": "billing",
        "final_urgency": "high",
        "final_queue": "Billing Team",
        "final_draft": "Hi Sara, our Billing Team is on it. NovaGear Support",
    }
    body.update(overrides)
    return body


def test_approve_records_final_values_and_locks(client):
    triage(client)
    response = client.post("/tickets/NG-1001/review", json=approve())
    assert response.status_code == 200
    ticket = response.json()
    assert ticket["status"] == "approved"
    assert ticket["triage"]["final_draft"].startswith("Hi Sara")
    assert ticket["triage"]["reviewed_at"]
    assert client.post("/tickets/NG-1001/triage").status_code == 409


def test_agent_override_is_stored_next_to_ai_values(client):
    triage(client)
    ticket = client.post(
        "/tickets/NG-1001/review",
        json=approve(final_urgency="critical", final_queue="Customer Care"),
    ).json()
    assert ticket["triage"]["ai_urgency"] == "high"
    assert ticket["triage"]["final_urgency"] == "critical"
    assert ticket["triage"]["ai_queue"] == "Billing Team"
    assert ticket["triage"]["final_queue"] == "Customer Care"


def test_reject_needs_no_final_fields(client):
    triage(client)
    response = client.post(
        "/tickets/NG-1001/review", json={"action": "reject", "review_note": "Wrong tone"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["triage"]["review_note"] == "Wrong tone"


def test_approve_twice_conflicts(client):
    triage(client)
    client.post("/tickets/NG-1001/review", json=approve())
    response = client.post("/tickets/NG-1001/review", json=approve())
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "invalid_state"


def test_reject_after_approve_conflicts(client):
    triage(client)
    client.post("/tickets/NG-1001/review", json=approve())
    response = client.post("/tickets/NG-1001/review", json={"action": "reject"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "invalid_state"


def test_review_that_loses_a_race_conflicts_and_writes_nothing(client, monkeypatch):
    triage(client)
    repo = client.app.state.repo
    stale = repo.get("NG-1001")
    approved = client.post("/tickets/NG-1001/review", json=approve()).json()
    monkeypatch.setattr(repo, "get", lambda _ticket_id: stale)

    response = client.post("/tickets/NG-1001/review", json={"action": "reject"})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "invalid_state"
    assert "changed while you were reviewing" in response.json()["detail"]["message"]
    monkeypatch.undo()
    assert client.get("/tickets/NG-1001").json() == approved


def test_review_of_untriaged_ticket_conflicts(client):
    response = client.post("/tickets/NG-1002/review", json=approve())
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "invalid_state"


def test_review_of_unknown_ticket_is_not_found(client):
    response = client.post("/tickets/NG-9999/review", json=approve())
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_approve_with_manual_queue_is_rejected(client, provider):
    provider.classify_responses = [classification_json(confidence=0.2)]
    triage(client)
    response = client.post(
        "/tickets/NG-1001/review", json=approve(final_queue="Needs Manual Triage")
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_route"


def test_approve_with_disallowed_route_is_rejected(client):
    triage(client)
    response = client.post("/tickets/NG-1001/review", json=approve(final_queue="Logistics"))
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_route"


def test_approve_missing_fields_is_validation_error(client):
    triage(client)
    response = client.post("/tickets/NG-1001/review", json={"action": "approve"})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
