# Triage eval — `qwen2.5:7b`

Model `qwen2.5:7b` · threshold 0.6 · run 2026-10-14 (UTC) · classify latency mean 1226 ms, median 1133 ms over 22 tickets

The classify prompt was tuned against the seed tickets, so the held-out score is the honest number. An expected label of `any` is not scored.

## Seed tickets (used while tuning the prompt)

Category 8/8 · Urgency 7/8 · Queue 9/10

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NG-1001 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 1106 | ✅ | ✅ | ✅ |
| NG-1002 | account / critical / Account Security | account / critical / Account Security | 0.90 | — | 1022 | ✅ | ✅ | ✅ |
| NG-1003 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1017 | ✅ | ✅ | ✅ |
| NG-1004 | technical / medium / Tech Support | technical / high / Tech Support | 0.90 | — | 1049 | ✅ | ❌ | ✅ |
| NG-1005 | billing / low / Billing Team | billing / low / Customer Care | 0.90 | — | 1074 | ✅ | ✅ | ❌ |
| NG-1006 | account / high / Account Security | account / high / Account Security | 0.85 | — | 1389 | ✅ | ✅ | ✅ |
| NG-1007 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1086 | ✅ | ✅ | ✅ |
| NG-1008 | shipping / low / Customer Care | shipping / low / Customer Care | 0.90 | — | 1339 | ✅ | ✅ | ✅ |
| NG-1009 | any / any / Needs Manual Triage | technical / medium / Needs Manual Triage | 0.35 | low_confidence | 998 | — | — | ✅ |
| NG-1010 | any / any / Needs Manual Triage | general / medium / Needs Manual Triage | 0.35 | low_confidence | 1081 | — | — | ✅ |

## Held-out tickets

Category 9/10 · Urgency 8/10 · Queue 9/12

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EV-01 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 1387 | ✅ | ✅ | ✅ |
| EV-02 | billing / low / Customer Care | billing / low / Customer Care | 0.90 | — | 1218 | ✅ | ✅ | ✅ |
| EV-03 | technical / medium / Tech Support | technical / medium / Tech Support | 0.80 | — | 1014 | ✅ | ✅ | ✅ |
| EV-04 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1584 | ✅ | ✅ | ✅ |
| EV-05 | account / critical / Account Security | account / critical / Account Security | 0.90 | — | 1874 | ✅ | ✅ | ✅ |
| EV-06 | account / low / Account Security | account / low / Account Security | 0.90 | — | 1320 | ✅ | ✅ | ✅ |
| EV-07 | shipping / low / Logistics | shipping / medium / Logistics | 0.90 | — | 1643 | ✅ | ❌ | ✅ |
| EV-08 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1064 | ✅ | ✅ | ✅ |
| EV-09 | general / low / Customer Care | billing / critical / Billing Team | 1.00 | — | 1160 | ❌ | ❌ | ❌ |
| EV-10 | general / low / Customer Care | general / low / Customer Care | 0.90 | — | 1222 | ✅ | ✅ | ✅ |
| EV-11 | any / any / Needs Manual Triage | general / high / Customer Care | 0.70 | — | 978 | — | — | ❌ |
| EV-12 | any / any / Needs Manual Triage | billing / medium / Customer Care | 0.85 | — | 1347 | — | — | ❌ |
