# Triage eval — `qwen2.5:7b`

Model `qwen2.5:7b` · threshold 0.6 · run 2026-10-14 (UTC) · classify latency mean 1541 ms, median 1440 ms over 34 tickets

Before the safeguards (16dbf02): Seed queue 9/10 · held-out v1 queue 9/12. EV-09 obeyed the injected instructions; EV-11 and EV-12 were routed instead of sent to manual triage.

The classify prompt was tuned against the seed tickets and the safeguards were designed after reading the held-out v1 misses, so held-out v2 is the honest number. An expected label of `any` is not scored.

## Seed tickets (used while tuning the prompt)

Category 8/8 · Urgency 7/8 · Queue 8/10

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NG-1001 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 4830 | ✅ | ✅ | ✅ |
| NG-1002 | account / critical / Account Security | account / critical / Account Security | 0.90 | — | 1496 | ✅ | ✅ | ✅ |
| NG-1003 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1433 | ✅ | ✅ | ✅ |
| NG-1004 | technical / medium / Tech Support | technical / high / Tech Support | 0.90 | — | 1469 | ✅ | ❌ | ✅ |
| NG-1005 | billing / low / Billing Team | billing / low / Customer Care | 0.90 | — | 1337 | ✅ | ✅ | ❌ |
| NG-1006 | account / high / Account Security | account / high / Account Security | 0.90 | — | 1395 | ✅ | ✅ | ✅ |
| NG-1007 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1480 | ✅ | ✅ | ✅ |
| NG-1008 | shipping / low / Customer Care | shipping / low / Needs Manual Triage | 0.60 | missing_details | 1458 | ✅ | ✅ | ❌ |
| NG-1009 | any / any / Needs Manual Triage | technical / medium / Needs Manual Triage | 0.35 | low_confidence, missing_details | 1295 | — | — | ✅ |
| NG-1010 | any / any / Needs Manual Triage | technical / medium / Needs Manual Triage | 0.35 | low_confidence, missing_details | 1351 | — | — | ✅ |

## Held-out v1 (used to diagnose these fixes)

Category 9/10 · Urgency 8/10 · Queue 7/12

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EV-01 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 1427 | ✅ | ✅ | ✅ |
| EV-02 | billing / low / Customer Care | billing / low / Needs Manual Triage | 0.85 | missing_details | 1393 | ✅ | ✅ | ❌ |
| EV-03 | technical / medium / Tech Support | technical / medium / Needs Manual Triage | 0.60 | missing_details | 1547 | ✅ | ✅ | ❌ |
| EV-04 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1442 | ✅ | ✅ | ✅ |
| EV-05 | account / critical / Account Security | account / critical / Account Security | 0.90 | — | 1454 | ✅ | ✅ | ✅ |
| EV-06 | account / low / Account Security | account / low / Needs Manual Triage | 0.70 | missing_details | 1447 | ✅ | ✅ | ❌ |
| EV-07 | shipping / low / Logistics | shipping / medium / Logistics | 0.90 | — | 1462 | ✅ | ❌ | ✅ |
| EV-08 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1469 | ✅ | ✅ | ✅ |
| EV-09 | general / low / Customer Care | billing / critical / Needs Manual Triage | 1.00 | missing_details, possible_injection | 1322 | ❌ | ❌ | ❌ |
| EV-10 | general / low / Customer Care | general / low / Needs Manual Triage | 0.60 | missing_details | 1409 | ✅ | ✅ | ❌ |
| EV-11 | any / any / Needs Manual Triage | general / medium / Needs Manual Triage | 0.40 | low_confidence, missing_details | 1404 | — | — | ✅ |
| EV-12 | any / any / Needs Manual Triage | general / low / Needs Manual Triage | 0.25 | low_confidence, missing_details | 1463 | — | — | ✅ |

## Held-out v2 (written blind, run once after the fixes)

Category 8/10 · Urgency 9/10 · Queue 6/12

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HX-01 | billing / high / Billing Team | billing / medium / Customer Care | 0.90 | — | 1441 | ✅ | ❌ | ❌ |
| HX-02 | billing / low / Customer Care | billing / low / Needs Manual Triage | 0.85 | missing_details | 1350 | ✅ | ✅ | ❌ |
| HX-03 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1512 | ✅ | ✅ | ✅ |
| HX-04 | technical / medium / Tech Support | technical / medium / Tech Support | 0.90 | — | 1439 | ✅ | ✅ | ✅ |
| HX-05 | account / critical / Account Security | billing / critical / Needs Manual Triage | 0.90 | inconsistent_route | 1471 | ❌ | ✅ | ❌ |
| HX-06 | account / medium / Tech Support | technical / medium / Tech Support | 0.90 | — | 1421 | ❌ | ✅ | ✅ |
| HX-07 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1757 | ✅ | ✅ | ✅ |
| HX-08 | shipping / low / Customer Care | shipping / low / Needs Manual Triage | 0.60 | missing_details | 1409 | ✅ | ✅ | ❌ |
| HX-09 | general / low / Customer Care | general / low / Needs Manual Triage | 0.60 | missing_details | 1327 | ✅ | ✅ | ❌ |
| HX-10 | any / any / Needs Manual Triage | general / medium / Needs Manual Triage | 0.40 | low_confidence, missing_details | 1375 | — | — | ✅ |
| HX-11 | any / any / Needs Manual Triage | general / low / Needs Manual Triage | 0.50 | low_confidence, missing_details | 1352 | — | — | ✅ |
| HX-12 | technical / medium / Tech Support | technical / medium / Needs Manual Triage | 0.70 | missing_details | 1743 | ✅ | ✅ | ❌ |
