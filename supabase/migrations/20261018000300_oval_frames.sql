-- Aurora time slider (#43): keep the full OVATION grid with each snapshot for the last day.
-- grid: probability 0–100 as base64 bytes, 181 rows (lat −90..90) × 360 columns (lon 0..359 east),
-- the same layout as /api/oval. Older snapshots keep their summary; the grid is cleared after 26 hours.
alter table public.ovation_snapshots add column grid text;

select cron.schedule(
  'prune-oval-grids',
  '41 * * * *',
  $$ update public.ovation_snapshots set grid = null where grid is not null and forecast_time < now() - interval '26 hours'; $$
);
