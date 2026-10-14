def test_health_ok(client):
    body = client.get("/health").json()
    assert body == {
        "status": "ok",
        "ollama_reachable": True,
        "model": "fake-qwen",
        "model_available": True,
    }


def test_health_degraded_when_ollama_down(client, provider):
    provider.reachable = False
    provider.model_available = False
    assert client.get("/health").json()["status"] == "degraded"


def test_taxonomy_lists_fixed_values(client):
    body = client.get("/taxonomy").json()
    assert body["categories"] == ["billing", "technical", "account", "shipping", "general"]
    assert body["urgencies"] == ["low", "medium", "high", "critical"]
    assert body["queues"][-1] == "Needs Manual Triage"
    assert "Needs Manual Triage" not in body["routable_queues"]
    assert body["allowed_queues"]["billing"] == ["Billing Team", "Customer Care"]
    assert body["confidence_threshold"] == 0.6


def test_lists_seeded_tickets(client):
    tickets = client.get("/tickets").json()
    assert len(tickets) == 10
    assert tickets[0]["id"] == "NG-1001"
    assert {t["status"] for t in tickets} == {"new"}


def test_filter_by_status(client):
    assert client.get("/tickets", params={"status": "approved"}).json() == []


def test_get_ticket_and_404(client):
    assert client.get("/tickets/NG-1002").json()["subject"].startswith("Someone logged in")
    response = client.get("/tickets/NG-9999")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_create_ticket(client):
    response = client.post(
        "/tickets",
        json={"customer_name": "Ali", "subject": "Order late", "body": "My order has not arrived."},
    )
    assert response.status_code == 201
    assert response.json()["id"] == "NG-1011"
    assert response.json()["status"] == "new"


def test_create_rejects_empty_body(client):
    response = client.post(
        "/tickets", json={"customer_name": "Ali", "subject": "Hello", "body": ""}
    )
    assert response.status_code == 422


def test_create_rejects_too_long_body(client):
    response = client.post(
        "/tickets", json={"customer_name": "Ali", "subject": "Hello", "body": "x" * 4001}
    )
    assert response.status_code == 422


def test_stats_initial(client):
    body = client.get("/stats").json()
    assert body["by_status"]["new"] == 10
    assert body["avg_confidence"] is None
