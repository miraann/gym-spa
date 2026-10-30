-- OF-d: server.manage, the offline server's screen (pairing codes, paired PCs). The Owner and the
-- built-in Admin of every gym have it, a new gym's Admin too; no other built-in role does.
begin;
select plan(6);
select tests.create_fixture();

select is(
  (select module from public.permissions where key = 'server.manage'), 'settings',
  'server.manage is in the catalog, with the settings'
);
select ok(
  exists (select from app.role_template_permissions where role_key = 'admin' and permission_key = 'server.manage'),
  'the Admin template has it'
);
select ok(
  not exists (
    select from app.role_template_permissions
     where permission_key = 'server.manage' and role_key <> 'admin'
  ),
  'no other built-in role has it'
);
select ok(
  exists (
    select from public.role_permissions rp join public.roles r on r.id = rp.role_id
     where rp.permission_key = 'server.manage' and r.key = 'admin' and r.gym_id = tests.gym('pgtap-a')
  ),
  'an existing gym''s Admin has it'
);

select tests.authenticate_as(tests.staff('owner'));
select ok(app.has_permission('server.manage'), 'the Owner has it, like every permission');
select tests.authenticate_as(tests.staff('reception_a'));
select ok(not app.has_permission('server.manage'), 'a receptionist does not');

select * from finish();
rollback;
