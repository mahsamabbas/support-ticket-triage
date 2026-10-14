"""Code-level prompt-injection heuristics (OWASP LLM01), checked on ticket text before routing.

A match only sends the ticket to manual triage; paraphrased attacks can still get past it.
"""

import re

from app.schemas import TicketText

_FLAGS = re.IGNORECASE | re.MULTILINE

_QUALIFIER = r"(?:all|any|the|your|previous|prior|above|earlier)"
_RULES = r"(?:instructions?|rules?|prompts?|guidelines?|directions?|classification)"
_FIELD = r"(?:category|urgency|priority|queue|confidence|team)"
_TAXONOMY = (
    r"(?:billing|technical|account|shipping|general|low|medium|high|critical"
    r"|tech\s+support|account\s+security|logistics|customer\s+care|manual\s+triage)"
)
_FIELD_VALUE = rf"(?:an?\s+|the\s+)?(?:{_TAXONOMY}|[01](?:\.\d+)?|\.\d+|\d{{1,3}}\s*%)"
_ROLE_CUE = r"(?:ignore|classify|route|respond|reply|output|instructions?)"

_PATTERNS = tuple(
    re.compile(pattern, _FLAGS)
    for pattern in (
        # 1. Override phrases: "ignore all of the previous instructions", "forget your rules".
        rf"\b(?:ignore|disregard|forget|override|bypass)\s+(?:{_QUALIFIER}\s+(?:of\s+)?){{1,3}}"
        rf"{_RULES}\b",
        r"\b(?:ignore|disregard|forget)\s+everything\s+(?:above|before)\b",
        # 2. Fake role turns at line start. A bare "System: iOS 18. Your app crashes" is common in
        #    bug reports, so the line must also give the model an order.
        rf"^[ \t]*(?:system|assistant|developer)[ \t]*:[^\n]*\b{_ROLE_CUE}\b",
        # 2. Bracketed or tagged pseudo-system blocks and chat-template tokens.
        r"\[\s*(?:system|admin|developer|inst)\b[^\]\n]{0,300}\]",
        r"<\s*/?\s*(?:system|instructions?|admin|developer)\s*>",
        r"<\|\s*(?:im_start|im_end|system|endoftext)\s*\|>",
        # 2. Fake system notices. "a system message saying the update failed" is a normal bug
        #    report, so "system message" only counts as a label.
        r"\bsystem\s+(?:note|override|instructions?)\b",
        r"\bsystem\s+message\s*:",
        # 2. Talking about the model's own setup or persona.
        r"\bsystem\s+prompt\b",
        r"\byou\s+are\s+now\s+(?:in\s+|an?\s+|the\s+)?(?:\w+\s+){0,3}?"
        r"(?:assistant|ai|bot|model|mode|classifier)\b",
        r"\bas\s+an?\s+(?:ai\s+(?:language\s+)?(?:model|assistant|system|bot)"
        r"|(?:large\s+)?language\s+model|llm)\b",
        # 2. Addressing the model directly. Plain "the model" is left out: it usually means a
        #    product.
        r"\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:the\s+)?"
        r"(?:ai|model|classifier|bot|assistant|llm)\b",
        r"\b(?:hey|hi|hello|dear|attention)\s*,?\s+(?:the\s+)?(?:ai|model|classifier|bot|llm)\b",
        r"\b(?:the|this|dear)\s+(?:classifier|triage\s+(?:bot|model|ai|system|assistant)"
        r"|language\s+model|llm)\b",
        # 3. Commands that set a triage field to a taxonomy value or number: "set the urgency to
        #    critical". "change the priority to urgent" stays allowed as ordinary customer wording.
        rf"\b(?:classify|categori[sz]e|route|mark|tag|label|assign|escalate|set|change|move)\s+"
        rf"(?:(?:the|this|its|ticket'?s)\s+)?{_FIELD}\s*(?:to|as|=|:)\s*{_FIELD_VALUE}\b",
        # 3. Unquoted field assignments: "category=billing".
        r"\b(?:category|urgency|queue|priority)\s*=\s*\w",
        # 3. Commands that file the ticket under a taxonomy value. An explicit noun is required:
        #    customers say "route this to logistics" or "mark it as low priority" themselves.
        rf"\b(?:classify|categori[sz]e|route|mark|tag|label|assign|file)\s+"
        rf"(?:this|the)\s+(?:ticket|request|message|case)\s+"
        rf"(?:as|to|under|into)\s+(?:an?\s+|the\s+)?{_TAXONOMY}\b",
        # 3. "classify this as ..." is not customer wording, so the bare form is kept for that verb.
        r"\b(?:classify|categori[sz]e)\s+(?:this|it)\s+as\b",
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
