from enum import StrEnum


class Category(StrEnum):
    BILLING = "billing"
    TECHNICAL = "technical"
    ACCOUNT = "account"
    SHIPPING = "shipping"
    GENERAL = "general"


class Urgency(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RoutableQueue(StrEnum):
    BILLING_TEAM = "Billing Team"
    TECH_SUPPORT = "Tech Support"
    ACCOUNT_SECURITY = "Account Security"
    LOGISTICS = "Logistics"
    CUSTOMER_CARE = "Customer Care"


class Queue(StrEnum):
    BILLING_TEAM = "Billing Team"
    TECH_SUPPORT = "Tech Support"
    ACCOUNT_SECURITY = "Account Security"
    LOGISTICS = "Logistics"
    CUSTOMER_CARE = "Customer Care"
    MANUAL_TRIAGE = "Needs Manual Triage"


class Flag(StrEnum):
    LOW_CONFIDENCE = "low_confidence"
    INCONSISTENT_ROUTE = "inconsistent_route"
    AI_OUTPUT_INVALID = "ai_output_invalid"
    POSSIBLE_INJECTION = "possible_injection"


class TicketStatus(StrEnum):
    NEW = "new"
    TRIAGED = "triaged"
    APPROVED = "approved"
    REJECTED = "rejected"


ALLOWED_QUEUES: dict[Category, tuple[Queue, ...]] = {
    Category.BILLING: (Queue.BILLING_TEAM, Queue.CUSTOMER_CARE),
    Category.TECHNICAL: (Queue.TECH_SUPPORT,),
    Category.ACCOUNT: (Queue.ACCOUNT_SECURITY, Queue.TECH_SUPPORT),
    Category.SHIPPING: (Queue.LOGISTICS, Queue.CUSTOMER_CARE),
    Category.GENERAL: (Queue.CUSTOMER_CARE,),
}

URGENCY_RANK: dict[Urgency, int] = {
    Urgency.CRITICAL: 0,
    Urgency.HIGH: 1,
    Urgency.MEDIUM: 2,
    Urgency.LOW: 3,
}


def is_route_allowed(category: Category, queue: Queue) -> bool:
    return queue in ALLOWED_QUEUES[category]
