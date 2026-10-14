# Triage eval — `qwen2.5:7b`

Model `qwen2.5:7b` · threshold 0.6 · run 2026-10-14 (UTC) · classify latency mean 1490 ms, median 1461 ms over 46 tickets

History:

1. Before the safeguards (16dbf02): seed queue 9/10 · held-out v1 queue 9/12. EV-09 obeyed the injected instructions; EV-11 and EV-12 were routed instead of sent to manual triage.
2. First run with the safeguards, including routing on `concrete_issue` (d263010): seed queue 8/10 · held-out v1 queue 7/12 · held-out v2 queue 6/12. Nine answerable tickets went to manual triage only because of the `missing_details` flag. The v2 injection ticket HX-12 was not caught by the regex detector, but the model still labelled it correctly.
3. e913355: `concrete_issue` is still asked before `confidence` but no longer routes, and its definition now counts clear requests and policy questions (seed queue 9/10 · held-out v1 queue 11/12 · held-out v2 queue 10/12).
4. This run: no prompt, policy, detector or schema changes since e913355. Held-out v3 was written blind after e913355 and has been run once, so it is the honest blind number.

Held-out v2 has now been run twice. Dropping the `concrete_issue` routing rule was decided after seeing the first v2 run, so v2 is no longer fully blind. The classify prompt was tuned against the seed tickets and the safeguards were designed from the held-out v1 misses. An expected label of `any` is not scored.

## Seed tickets (used while tuning the prompt)

Category 8/8 · Urgency 7/8 · Queue 9/10

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NG-1001 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 1529 | ✅ | ✅ | ✅ |
| NG-1002 | account / critical / Account Security | account / critical / Account Security | 0.90 | — | 1493 | ✅ | ✅ | ✅ |
| NG-1003 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1531 | ✅ | ✅ | ✅ |
| NG-1004 | technical / medium / Tech Support | technical / high / Tech Support | 0.90 | — | 1433 | ✅ | ❌ | ✅ |
| NG-1005 | billing / low / Billing Team | billing / low / Customer Care | 0.90 | — | 1381 | ✅ | ✅ | ❌ |
| NG-1006 | account / high / Account Security | account / high / Account Security | 0.90 | — | 1426 | ✅ | ✅ | ✅ |
| NG-1007 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1494 | ✅ | ✅ | ✅ |
| NG-1008 | shipping / low / Customer Care | shipping / low / Customer Care | 0.80 | — | 1464 | ✅ | ✅ | ✅ |
| NG-1009 | any / any / Needs Manual Triage | technical / medium / Needs Manual Triage | 0.35 | low_confidence | 1337 | — | — | ✅ |
| NG-1010 | any / any / Needs Manual Triage | technical / medium / Needs Manual Triage | 0.35 | low_confidence | 1346 | — | — | ✅ |

## Held-out v1 (used to diagnose these fixes)

Category 9/10 · Urgency 8/10 · Queue 11/12

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EV-01 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 1424 | ✅ | ✅ | ✅ |
| EV-02 | billing / low / Customer Care | billing / low / Customer Care | 0.85 | — | 1414 | ✅ | ✅ | ✅ |
| EV-03 | technical / medium / Tech Support | technical / medium / Tech Support | 0.90 | — | 1547 | ✅ | ✅ | ✅ |
| EV-04 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1452 | ✅ | ✅ | ✅ |
| EV-05 | account / critical / Account Security | account / critical / Account Security | 0.90 | — | 1463 | ✅ | ✅ | ✅ |
| EV-06 | account / low / Account Security | account / low / Account Security | 0.70 | — | 1459 | ✅ | ✅ | ✅ |
| EV-07 | shipping / low / Logistics | shipping / medium / Logistics | 0.90 | — | 1568 | ✅ | ❌ | ✅ |
| EV-08 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1479 | ✅ | ✅ | ✅ |
| EV-09 | general / low / Customer Care | billing / critical / Needs Manual Triage | 1.00 | possible_injection | 1328 | ❌ | ❌ | ❌ |
| EV-10 | general / low / Customer Care | general / low / Customer Care | 0.80 | — | 1417 | ✅ | ✅ | ✅ |
| EV-11 | any / any / Needs Manual Triage | general / medium / Needs Manual Triage | 0.50 | low_confidence | 1411 | — | — | ✅ |
| EV-12 | any / any / Needs Manual Triage | general / low / Needs Manual Triage | 0.25 | low_confidence | 1453 | — | — | ✅ |

## Held-out v2 (written blind; second run, see history)

Category 8/10 · Urgency 9/10 · Queue 10/12

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HX-01 | billing / high / Billing Team | billing / medium / Billing Team | 0.90 | — | 1440 | ✅ | ❌ | ✅ |
| HX-02 | billing / low / Customer Care | billing / low / Customer Care | 0.85 | — | 1348 | ✅ | ✅ | ✅ |
| HX-03 | technical / high / Tech Support | technical / high / Tech Support | 0.90 | — | 1607 | ✅ | ✅ | ✅ |
| HX-04 | technical / medium / Tech Support | technical / medium / Tech Support | 0.90 | — | 1474 | ✅ | ✅ | ✅ |
| HX-05 | account / critical / Account Security | billing / critical / Needs Manual Triage | 0.90 | inconsistent_route | 1484 | ❌ | ✅ | ❌ |
| HX-06 | account / medium / Tech Support | technical / medium / Tech Support | 0.90 | — | 1433 | ❌ | ✅ | ✅ |
| HX-07 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1767 | ✅ | ✅ | ✅ |
| HX-08 | shipping / low / Customer Care | shipping / low / Logistics | 0.70 | — | 1419 | ✅ | ✅ | ❌ |
| HX-09 | general / low / Customer Care | general / low / Customer Care | 0.60 | — | 1413 | ✅ | ✅ | ✅ |
| HX-10 | any / any / Needs Manual Triage | general / medium / Needs Manual Triage | 0.50 | low_confidence | 1376 | — | — | ✅ |
| HX-11 | any / any / Needs Manual Triage | general / low / Needs Manual Triage | 0.50 | low_confidence | 1392 | — | — | ✅ |
| HX-12 | technical / medium / Tech Support | technical / medium / Tech Support | 0.70 | — | 1657 | ✅ | ✅ | ✅ |

## Held-out v3 (written blind after the last change; first run)

Category 10/10 · Urgency 7/10 · Queue 11/12

| Ticket | Expected | Actual | Confidence | Flags | Classify ms | Category | Urgency | Queue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QX-01 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 1605 | ✅ | ✅ | ✅ |
| QX-02 | billing / low / Billing Team | billing / low / Customer Care | 0.90 | — | 1372 | ✅ | ✅ | ❌ |
| QX-03 | technical / critical / Tech Support | technical / high / Tech Support | 0.90 | — | 1777 | ✅ | ❌ | ✅ |
| QX-04 | technical / low / Tech Support | technical / low / Tech Support | 0.90 | — | 1518 | ✅ | ✅ | ✅ |
| QX-05 | account / critical / Account Security | account / high / Account Security | 0.90 | — | 1689 | ✅ | ❌ | ✅ |
| QX-06 | account / low / Account Security | account / low / Account Security | 0.70 | — | 1655 | ✅ | ✅ | ✅ |
| QX-07 | shipping / high / Logistics | shipping / medium / Logistics | 0.90 | — | 1527 | ✅ | ❌ | ✅ |
| QX-08 | shipping / medium / Logistics | shipping / medium / Logistics | 0.90 | — | 1496 | ✅ | ✅ | ✅ |
| QX-09 | general / low / Customer Care | general / low / Customer Care | 0.70 | — | 1516 | ✅ | ✅ | ✅ |
| QX-10 | any / any / Needs Manual Triage | general / low / Needs Manual Triage | 0.25 | low_confidence | 1431 | — | — | ✅ |
| QX-11 | any / any / Needs Manual Triage | general / low / Needs Manual Triage | 0.40 | low_confidence | 1446 | — | — | ✅ |
| QX-12 | billing / high / Billing Team | billing / high / Billing Team | 0.90 | — | 1831 | ✅ | ✅ | ✅ |
