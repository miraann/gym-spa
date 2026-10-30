-- The offline edition's server screen (spec §8, step OF-d): pairing codes and the paired PCs on the
-- gym's server PC. The Owner has it like every permission, and the built-in Admin role gets it in
-- every gym because Admin holds the whole catalog (like billing.view and support.grant). The
-- schema is one for both editions, so online gyms have it too; they have no server PC to use it on.
insert into public.permissions (key, module, sort_order) values ('server.manage', 'settings', 107);
insert into app.role_template_permissions (role_key, permission_key) values ('admin', 'server.manage');
insert into public.role_permissions (gym_id, role_id, permission_key)
select r.gym_id, r.id, 'server.manage'
  from public.roles r
 where r.key = 'admin' and r.is_system;
