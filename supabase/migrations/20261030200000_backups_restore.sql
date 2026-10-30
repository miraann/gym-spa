-- The offline server's restore (spec §8, step OF-e): putting a backup back replaces every row of
-- the gym. The Owner has it like every permission, and the built-in Admin role gets it in every gym
-- because Admin holds the whole catalog; no other built-in role does. Online gyms have no server
-- backups to restore.
insert into public.permissions (key, module, sort_order) values ('backups.restore', 'settings', 108);
insert into app.role_template_permissions (role_key, permission_key) values ('admin', 'backups.restore');
insert into public.role_permissions (gym_id, role_id, permission_key)
select r.gym_id, r.id, 'backups.restore'
  from public.roles r
 where r.key = 'admin' and r.is_system;
