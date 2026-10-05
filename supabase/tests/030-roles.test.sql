-- roles, permissions, role_permissions: reading, custom roles, and the escalation guards.
begin;
select plan(24);
select tests.create_fixture();

-- Custom roles used below:
--   role_editor: may edit roles, has members.view only. Given to the staff member "editor".
--   front_desk: members.view only (role_editor covers it).
--   refunds: payments.refund (role_editor does not cover it).
select tests.create_staff('editor', tests.create_role('دەستکاریکەری ڕۆڵ', array['roles.manage', 'members.view'])::text,
  array['B901']);
select tests.create_role('پێشوازی', array['members.view']);
select tests.create_role('گەڕاندنەوەی پارە', array['payments.refund']);

select tests.authenticate_as_anon();
select throws_ok('select * from public.roles', '42501', 'permission denied for table roles',
  'anonymous visitors cannot read roles');

select tests.authenticate_as(tests.staff('reception_a'));
select is((select count(*)::integer from public.roles where is_system), 8, 'staff read the 8 built-in roles');
select is(
  (select count(*)::integer from public.permissions), tests.total_rows('public.permissions'),
  'staff read the whole permission catalog'
);
select is((select count(*)::integer from public.role_permissions), tests.total_rows('public.role_permissions'),
  'staff read every role''s permissions');
select throws_ok(
  $$ insert into public.roles (name_ckb) values ('ڕۆڵی نوێ') $$, '42501',
  'new row violates row-level security policy for table "roles"',
  'staff without roles.manage cannot add roles'
);
select is(
  tests.row_count($$ delete from public.role_permissions where permission_key = 'members.view' $$), 0,
  'staff without roles.manage cannot remove role permissions'
);

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select id from public.roles', 'deactivated staff read no roles');

select tests.authenticate_as(tests.staff('admin'));
select lives_ok($$ insert into public.roles (name_ckb, name_en) values ('ڕۆڵی نوێ', 'New role') $$,
  'roles.manage can add a custom role');
select throws_ok(
  $$ insert into public.roles (key, name_ckb, is_system) values ('boss', 'سەرۆک', true) $$, '42501',
  'system_role_read_only', 'built-in roles come only from migrations'
);
select throws_ok(
  $$ update public.roles set name_en = 'Front desk' where key = 'receptionist' $$, '42501',
  'system_role_read_only', 'Admin cannot edit built-in roles'
);
select throws_ok(
  $$ insert into public.role_permissions (role_id, permission_key) values (tests.role('receptionist'), 'payments.refund') $$,
  '42501', 'system_role_read_only', 'Admin cannot change the permissions of built-in roles'
);
select lives_ok(
  $$ insert into public.role_permissions (role_id, permission_key)
     select id, 'payments.view' from public.roles where name_ckb = 'پێشوازی' $$,
  'roles.manage can give a custom role a permission'
);
select is(
  tests.row_count($$ delete from public.role_permissions
                      where permission_key = 'payments.view'
                        and role_id = (select id from public.roles where name_ckb = 'پێشوازی') $$), 1,
  'roles.manage can take a permission away from a custom role'
);
select throws_ok(
  $$ update public.roles set deleted_at = now() where name_ckb = 'دەستکاریکەری ڕۆڵ' $$, '23514', 'role_in_use',
  'a role cannot be deleted while staff have it'
);
select is(
  tests.row_count($$ update public.roles set deleted_at = now() where name_ckb = 'پێشوازی' $$), 1,
  'an unused custom role can be deleted'
);
select throws_ok(
  $$ update public.role_permissions set permission_key = 'members.view' $$, '42501',
  'permission denied for table role_permissions', 'role permissions are added and removed, never edited'
);

select tests.authenticate_as(tests.staff('owner'));
select lives_ok($$ update public.roles set name_en = 'Front desk' where key = 'receptionist' $$,
  'Super Admin can rename built-in roles');
select throws_ok($$ update public.roles set key = 'front_desk' where key = 'receptionist' $$, '42501',
  'read_only_column', 'a built-in role key never changes');
select throws_ok($$ update public.roles set deleted_at = now() where key = 'trainer' $$, '42501',
  'system_role_read_only', 'built-in roles cannot be deleted');
select throws_ok(
  $$ insert into public.role_permissions (role_id, permission_key) values (tests.role('super_admin'), 'members.view') $$,
  '23514', 'super_admin_has_all_permissions', 'Super Admin''s permissions are never stored'
);

-- The role editor has roles.manage but only members.view.
select tests.authenticate_as(tests.staff('editor'));
select lives_ok(
  $$ insert into public.role_permissions (role_id, permission_key)
     select id, 'members.view' from public.roles where name_ckb = 'ڕۆڵی نوێ' $$,
  'staff can give a permission they have'
);
select throws_ok(
  $$ insert into public.role_permissions (role_id, permission_key)
     select id, 'payments.refund' from public.roles where name_ckb = 'ڕۆڵی نوێ' $$,
  '42501', 'cannot_grant_permission', 'nobody can give a permission they do not have'
);
select throws_ok(
  $$ insert into public.role_permissions (role_id, permission_key)
     select id, 'members.view' from public.roles where name_ckb = 'گەڕاندنەوەی پارە' $$,
  '42501', 'cannot_edit_role', 'nobody can edit a role that has permissions they do not have'
);
select throws_ok(
  $$ delete from public.role_permissions
      where role_id = (select id from public.roles where name_ckb = 'دەستکاریکەری ڕۆڵ')
        and permission_key = 'members.view' $$,
  '42501', 'cannot_edit_own_role', 'nobody can change the permissions of their own role'
);

select * from finish();
rollback;
