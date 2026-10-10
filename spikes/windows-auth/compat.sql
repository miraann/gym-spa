-- Auth spike (throwaway). The roles, schemas and privileges our migrations and Supabase Auth expect,
-- copied from the supabase/postgres image (17.11.0.002) that the local Supabase CLI runs.
-- Run once on a new database as the superuser supabase_admin, before Auth's and our migrations.
-- spike.mjs passes the passwords as psql variables.
\set ON_ERROR_STOP on

-- API roles. PostgREST logs in as authenticator and switches to anon / authenticated / service_role.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit password :'authenticator_password';
grant anon, authenticated, service_role to authenticator;
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';

-- postgres runs our migrations. Not a superuser, like on Supabase, but it owns the database.
create role postgres login createrole createdb replication bypassrls password :'postgres_password';
grant anon, authenticated, service_role, authenticator to postgres;
grant pg_read_all_data, pg_signal_backend, pg_monitor to postgres;
alter role postgres set search_path = "$user", public, extensions;
alter database postgres owner to postgres;

-- Supabase Auth logs in as supabase_auth_admin; it creates its tables and functions in auth.
create role supabase_auth_admin login createrole noinherit password :'auth_admin_password';
alter role supabase_auth_admin set search_path = auth;
alter role supabase_auth_admin set idle_in_transaction_session_timeout = 60000;
create schema auth authorization supabase_admin;
grant usage, create on schema auth to supabase_auth_admin;
grant usage on schema auth to postgres, anon, authenticated, service_role;
-- Whatever Auth creates there, postgres may use (our trigger on auth.users, admin functions).
alter default privileges for role supabase_auth_admin in schema auth grant all on tables to postgres;
alter default privileges for role supabase_auth_admin in schema auth grant all on sequences to postgres;
alter default privileges for role supabase_auth_admin in schema auth grant execute on functions to postgres;

-- Extensions live in their own schema, as on Supabase.
create schema extensions authorization postgres;
grant usage on schema extensions to anon, authenticated, service_role;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
alter default privileges in schema extensions grant all on tables to postgres with grant option;
alter default privileges in schema extensions grant all on sequences to postgres with grant option;
alter default privileges in schema extensions grant execute on functions to postgres with grant option;

-- public: the defaults of a new Supabase project, which no longer exposes new tables to the
-- Data API (anon gets no select/insert/update/delete unless a migration grants it).
grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant truncate, references, trigger, maintain on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant update on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public;
