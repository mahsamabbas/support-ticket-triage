"""Code-level prompt-injection heuristics (OWASP LLM01), checked on ticket text before routing.

A match only sends the ticket to manual triage; paraphrased attacks can still get past it.
"""

import re

from app.schemas import TicketText

_FLAGS = re.IGNORECASE | re.MULTILINE

_QUALIFIER = r"(?:all|any|the|your|previous|prior|above|earlier)"
_RULES = r"(?:instructions?|rules?|prompts?|guidelines?|directions?)"
_FIELD = r"(?:category|urgency|priority|queue|confidence|team)"
_TAXONOMY = (
    r"(?:billing|technical|account|shipping|general|low|medium|high|critical"
    r"|tech\s+support|account\s+security|logistics|customer\s+care|manual\s+triage)"
)
_ROLE_CUE = (
    r"(?:you|your|ignore|classify|route|respond|reply|output|must|always|never|instructions?)"
)

_PATTERNS = tuple(
    re.compile(pattern, _FLAGS)
    for pattern in (
        # 1. Override phrases: "ignore all previous instructions", "forget your rules".
        rf"\b(?:ignore|disregard|forget|override|bypass)\s+(?:{_QUALIFIER}\s+){{1,3}}{_RULES}\b",
        # 2. Fake role turns at line start. A bare "System: Android 15" is common in bug reports,
        #    so the line must also address the model or give it an order.
        rf"^\s*(?:system|assistant|developer)\s*:[^\n]*\b{_ROLE_CUE}\b",
        # 2. Bracketed or tagged pseudo-system blocks and chat-template tokens.
        r"\[\s*(?:system|admin|developer|inst)(?:\s+(?:message|prompt|note|override|instructions?))?\s*\]",
        r"<\s*/?\s*(?:system|instructions?|admin|developer)\s*>",
        r"<\|\s*(?:im_start|im_end|system|endoftext)\s*\|>",
        # 2. Talking about the model's own setup or persona.
        r"\bsystem\s+prompt\b",
        r"\byou\s+are\s+now\s+(?:in\s+|an?\s+|the\s+)?(?:\w+\s+){0,3}?"
        r"(?:assistant|ai|bot|model|mode|classifier)\b",
        r"\bas\s+an?\s+(?:ai|artificial\s+intelligence|(?:large\s+)?language\s+model|llm)\b",
        # 2. Addressing the model directly. Plain "the model" is left out: it usually means a
        #    product.
        r"\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:the\s+)?"
        r"(?:ai|model|classifier|bot|assistant|llm)\b",
        r"\b(?:hey|hi|hello|dear|attention)\s*,?\s+(?:the\s+)?(?:ai|model|classifier|bot|llm)\b",
        r"\b(?:the|this|dear)\s+(?:classifier|triage\s+(?:bot|model|ai|system|assistant)"
        r"|language\s+model|llm)\b",
        # 3. Commands that set a triage field: "set the urgency to critical".
        rf"\b(?:classify|categori[sz]e|route|mark|tag|label|assign|escalate|set|change|move)\s+"
        rf"(?:(?:the|this|its|ticket'?s)\s+)?{_FIELD}\s*(?:to|as|=|:)",
        # 3. Commands that file the ticket under a taxonomy value: "route this ticket to Logistics".
        #    "set/change it to low" is left out because customers describe device settings that way.
        rf"\b(?:classify|categori[sz]e|route|mark|tag|label|assign|escalate|file)\s+"
        rf"(?:this|it|(?:this|the)\s+(?:ticket|request|message|case))\s+"
        rf"(?:as|to|under|into)\s+(?:an?\s+|the\s+)?{_TAXONOMY}\b",
        # 3. A confidence value written into the ticket.
        r"\bconfidence(?:\s+score)?\s*(?:=|:|to|of)\s*(?:[01](?:\.\d+)?|\.\d+|\d{1,3}\s*%)",
        # 4. Output-format hijacking.
        r"\b(?:respond|reply|answer|output|return)\s+(?:only\s+with|with\s+only)\b",
        r"\boutput\s+(?:the\s+following|exactly|only)\b",
        r"\b(?:output|print|respond\s+with|reply\s+with)\s+(?:the\s+following\s+|this\s+)?json\b",
        r'"\s*(?:category|urgency|queue|confidence|priority)\s*"\s*:',
    )
)


def looks_like_injection(text: str) -> bool:
    return any(pattern.search(text) for pattern in _PATTERNS)


def ticket_looks_like_injection(ticket: TicketText) -> bool:
    return looks_like_injection(f"{ticket.subject}\n{ticket.body}")
