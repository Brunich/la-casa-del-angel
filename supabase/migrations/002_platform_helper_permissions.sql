-- The dashboard auto-RLS event trigger creates this platform helper.
-- It runs through PostgreSQL event triggers, never through the client API.
begin;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
commit;
