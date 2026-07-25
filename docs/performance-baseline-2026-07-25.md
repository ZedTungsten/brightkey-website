# Supabase performance baseline — 2026-07-25

This baseline was captured before the dashboard query remediation. Query
statistics are cumulative from the `pg_stat_statements` reset on 2026-05-18;
resource and error metrics are from the preceding 24 hours unless noted.

## Resource and reliability baseline

| Metric | Baseline |
| --- | ---: |
| Peak database connections | 31 / 60 |
| Database errors | 7.4% |
| Realtime errors | 4.5% |
| Slow query fingerprints | 279 |
| CPU | 8% |
| Memory | 43–44% |
| Disk IO | 37% |
| Database size | 0.04 GB |

The database is not compute-, memory-, or storage-bound. The primary risk is
request amplification from global components, repeated collection reads,
sequential scans, and per-row RLS evaluation.

## High-frequency application queries

| Query shape | Calls | Total time |
| --- | ---: | ---: |
| Authenticated PostgREST request initialization | 272,409 | 413.5 s |
| `global_settings` by company/key | 19,271 | 130.9 s |
| `companies` by `tenant_id` | 17,321 | 119.4 s |
| Delivery reference lookup by company | 14,186 | 149.1 s |
| Latest attendance by employee | 8,682 | 116.5 s |
| Installation bookings by company/status | 4,318 | 324.4 s |

## Sequential scan indicators

| Table | Sequential scans | Tuples read |
| --- | ---: | ---: |
| `general_journal` | 6,457 | 10,467,014 |
| `tenant_members` | 655,000 | 5,753,020 |
| `inventory_transactions` | 17,578 | 1,887,445 |
| `products` | 16,401 | 1,448,551 |
| `attendance_logs` | 13,769 | 1,422,546 |
| `delivery_bookings` | 19,741 | 1,084,298 |

## Phase acceptance checks

After deploying each phase, capture the same workload window and compare:

1. No operational collection query is initiated by `js/sidebar.js`.
2. One sidebar refresh produces at most one compact logistics RPC.
3. Database and Realtime error rates remain below 1%.
4. Normal collection requests are company-scoped and bounded to 100 rows unless
   a documented workflow requires a larger hard ceiling.
5. At 50 concurrent users, peak connections stay below 70% of the pool and
   common dashboard routes remain responsive at P95.

After the fixes have completed a representative business cycle, reset
`pg_stat_statements` and record a fresh baseline. The original cumulative
statistics must not be compared directly to a shorter post-deployment window.
