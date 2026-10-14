from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.db import TicketRepository
from app.domain.taxonomy import Category, Queue, Urgency
from app.schemas import TicketCreate

SEED_SPACING = timedelta(minutes=7)


@dataclass(frozen=True)
class SeedTicket:
    id: str
    customer_name: str
    subject: str
    body: str
    expected_category: Category | None
    expected_urgency: Urgency | None
    expected_queue: Queue


SEED_TICKETS: tuple[SeedTicket, ...] = (
    SeedTicket(
        "NG-1001",
        "Sara Ahmed",
        "Charged twice for order #4521",
        "Hi, I placed order #4521 for the Pulse X earbuds yesterday and my card was charged "
        "twice for $129.00. I can see both charges on my bank statement. Please refund the "
        "duplicate charge.",
        Category.BILLING,
        Urgency.HIGH,
        Queue.BILLING_TEAM,
    ),
    SeedTicket(
        "NG-1002",
        "Daniel Brooks",
        "Someone logged into my account from another country",
        "I just got an email saying my NovaGear account was accessed from Romania. I have never "
        "been there. My saved card is on that account and I can't change the password because "
        "it says the email address was changed. Please lock it now.",
        Category.ACCOUNT,
        Urgency.CRITICAL,
        Queue.ACCOUNT_SECURITY,
    ),
    SeedTicket(
        "NG-1003",
        "Ayesha Khan",
        "Tracking stuck for 6 days",
        "My order #4388 (Nova Watch 2) has shown 'In transit - Chicago hub' for six days. The "
        "estimated delivery date has passed. Can you check where it is?",
        Category.SHIPPING,
        Urgency.MEDIUM,
        Queue.LOGISTICS,
    ),
    SeedTicket(
        "NG-1004",
        "Marco Rossi",
        "App crashes when pairing my earbuds",
        "Every time I try to pair my Pulse X earbuds in the NovaGear app (Android 15, Pixel 9) "
        "the app closes. I reinstalled it twice. The earbuds work fine with other apps.",
        Category.TECHNICAL,
        Urgency.MEDIUM,
        Queue.TECH_SUPPORT,
    ),
    SeedTicket(
        "NG-1005",
        "Lena Fischer",
        "Change billing address on my invoice",
        "Could you update the billing address on invoice INV-20931 to my new office address? "
        "My company needs it for expenses. No rush.",
        Category.BILLING,
        Urgency.LOW,
        Queue.BILLING_TEAM,
    ),
    SeedTicket(
        "NG-1006",
        "Omar Farouk",
        "Password reset email never arrives",
        "I've requested a password reset five times today and the email never shows up, not "
        "even in spam. I can't log in to track my order.",
        Category.ACCOUNT,
        Urgency.HIGH,
        Queue.ACCOUNT_SECURITY,
    ),
    SeedTicket(
        "NG-1007",
        "Priya Nair",
        "Firmware update bricked my smartwatch",
        "I installed firmware 3.2 on my Nova Watch 2 last night and now it is stuck on the logo "
        "screen. It won't turn off or respond to buttons. I rely on it for medication reminders.",
        Category.TECHNICAL,
        Urgency.HIGH,
        Queue.TECH_SUPPORT,
    ),
    SeedTicket(
        "NG-1008",
        "Jón Einarsson",
        "Do you ship to Iceland?",
        "Hi! I'd like to order the Nova Home Hub. Do you ship to Reykjavik, and roughly how long "
        "does delivery take?",
        Category.SHIPPING,
        Urgency.LOW,
        Queue.CUSTOMER_CARE,
    ),
    SeedTicket(
        "NG-1009",
        "Chris P.",
        "it's not working",
        "it's not working again. please fix",
        None,
        None,
        Queue.MANUAL_TRIAGE,
    ),
    SeedTicket(
        "NG-1010",
        "Sam Lee",
        "Question about my thing from last week",
        "Hey, about the thing I got last week, it's doing that thing again. Can someone look "
        "at it?",
        None,
        None,
        Queue.MANUAL_TRIAGE,
    ),
)


def seed_if_empty(repo: TicketRepository) -> int:
    if repo.count() > 0:
        return 0
    start = datetime.now(UTC) - SEED_SPACING * len(SEED_TICKETS)
    for index, seed in enumerate(SEED_TICKETS):
        created_at = (start + SEED_SPACING * index).isoformat(timespec="seconds")
        repo.insert(
            seed.id,
            TicketCreate(customer_name=seed.customer_name, subject=seed.subject, body=seed.body),
            created_at,
        )
    return len(SEED_TICKETS)
