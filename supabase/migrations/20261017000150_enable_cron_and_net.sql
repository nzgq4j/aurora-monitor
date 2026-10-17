-- Extensions the ingest schedule needs (applied on their own: creating them in the same
-- transaction as cron.schedule() timed out through the Supabase MCP connector).
create extension if not exists pg_cron;
create extension if not exists pg_net;
