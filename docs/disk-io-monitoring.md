# Disk IO Monitoring

Use this checklist after deploying the dashboard query optimizations. PostgreSQL
statistics are cumulative, so compare a fixed observation window rather than raw
lifetime totals.

## Baseline captured before optimization

| Query group | Calls | Total execution time | Average execution time | Shared blocks read | Shared blocks hit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Global installation-booking commission audit | 4,301 | 324,236 ms | 75.39 ms | 0 | 2,073,337 |
| Latest attendance status | 8,528 | 116,387 ms | 13.65 ms | 6 | 796,702 |
| Shared product metadata | 8,023 | 58,904 ms | 7.34 ms | 17 | 106,025 |
| Broad inventory transaction query | 2,130 | 34,995 ms | 16.43 ms | 1 | 178,195 |

## Post-deployment measurement

Allow a normal business cycle after deployment, then run:

```sql
select
  queryid,
  calls,
  rows,
  round(total_exec_time::numeric, 2) as total_ms,
  round(mean_exec_time::numeric, 2) as average_ms,
  shared_blks_read,
  shared_blks_hit,
  temp_blks_read,
  temp_blks_written,
  regexp_replace(query, '\s+', ' ', 'g') as query
from pg_stat_statements
where query ilike any (array[
  '%attendance_logs%',
  '%products%',
  '%inventory_transactions%',
  '%installation_bookings%'
])
order by total_exec_time desc
limit 30;
```

Run this table-level report for the same observation window:

```sql
select
  s.schemaname,
  s.relname as table_name,
  s.seq_scan,
  s.seq_tup_read,
  s.idx_scan,
  coalesce(io.heap_blks_read, 0) +
  coalesce(io.idx_blks_read, 0) +
  coalesce(io.toast_blks_read, 0) +
  coalesce(io.tidx_blks_read, 0) as total_blocks_read
from pg_stat_user_tables s
join pg_statio_user_tables io on io.relid = s.relid
order by total_blocks_read desc
limit 30;
```

## Success criteria

- The commission-audit query does not run on non-commission dashboard routes.
- Attendance status uses `idx_attendance_logs_employee_created_at`.
- Warehouse history requests return no more than 1,000 recent transactions.
- Product, booking, inventory, transfer, delivery, and review reads are scoped to
  the active company.
- No ordinary dashboard query writes temporary blocks.
- Query calls and shared-block activity grow materially slower than the baseline.

## Capacity decision

Review Supabase Database Health after at least one representative business cycle.
Upgrade compute only if the optimized workload still consumes the daily Disk IO
Budget or experiences sustained IO wait. A short increase while indexes warm
their cache is expected; continuous budget depletion is not.

Also review autovacuum progress, database size growth, memory pressure, cache hit
ratio, and write volume before attributing remaining disk activity to reads.
