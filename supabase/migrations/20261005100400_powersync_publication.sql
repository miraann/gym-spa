-- PowerSync reads changes from Postgres through logical replication, using this publication. Each
-- module adds the tables it syncs. Never synced: staff_pins (secrets) and audit_logs (read online).
--
-- The database role PowerSync connects with has a password, so it is created during setup rather
-- than in a migration (README → PowerSync, step 1d).
create publication powersync for table
  public.branches,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.staff_users,
  public.staff_branches,
  public.devices,
  public.device_status,
  public.settings;
