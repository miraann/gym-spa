-- has_permission(), branch access and the escalation rules behind every policy and guard.
begin;
select plan(26);
select tests.create_fixture();

-- Permissions
select tests.authenticate_as(tests.staff('owner'));
select ok(app.is_owner(), 'the owner has the Owner role');
select is(
  cardinality(app.my_permissions()), tests.total_rows('public.permissions'),
  'the Owner has every permission'
);

select tests.authenticate_as(tests.staff('admin'));
select ok(not app.is_owner(), 'Admin is not the Owner');
select is(
  cardinality(app.my_permissions()), tests.total_rows('public.permissions'),
  'Admin has every permission in the catalog'
);

select tests.authenticate_as(tests.staff('reception_a'));
select ok(app.has_permission('members.create'), 'a receptionist can add members');
select ok(not app.has_permission('payments.refund'), 'a receptionist cannot refund payments');
select ok(app.is_active_staff(), 'an active staff member is active staff');

select tests.authenticate_as(tests.staff('former_a'));
select is(app.my_permissions(), '{}'::text[], 'a deactivated staff member has no permissions');
select ok(not app.is_active_staff(), 'a deactivated staff member is not active staff');

select tests.clear_authentication();
select is(app.my_permissions(), '{}'::text[], 'without a session there are no permissions');

-- A role being deleted takes its permissions away.
update public.staff_users set role_id = tests.create_role('دەستیار', array['members.view'])
 where id = tests.staff('trainer_ab');
update public.roles set deleted_at = now() where name_ckb = 'دەستیار';
select tests.authenticate_as(tests.staff('trainer_ab'));
select is(app.my_permissions(), '{}'::text[], 'a staff member whose role is deleted has no permissions');

-- Branch access
select tests.authenticate_as(tests.staff('reception_a'));
select set_eq(
  'select * from app.accessible_branch_ids()', array[tests.branch('B901')],
  'a receptionist in branch A can access branch A only'
);
select ok(app.has_branch_access(tests.branch('B901')), 'has_branch_access: own branch');
select ok(not app.has_branch_access(tests.branch('B902')), 'has_branch_access: other branch');

select tests.authenticate_as(tests.staff('trainer_ab'));
select set_eq(
  'select * from app.accessible_branch_ids()', array[tests.branch('B901'), tests.branch('B902')],
  'staff can have several branches'
);

select tests.authenticate_as(tests.staff('admin'));
select set_eq(
  'select * from app.accessible_branch_ids()', $$ select * from tests.all_ids('public.branches') $$,
  'all_branches gives every branch of the gym'
);

select tests.authenticate_as(tests.staff('former_a'));
select is_empty('select * from app.accessible_branch_ids()', 'a deactivated staff member has no branches');

-- Who can give which role
select tests.authenticate_as(tests.staff('manager_a'));
select ok(app.can_grant_role(tests.role('receptionist')), 'a branch manager can give the receptionist role');
select ok(not app.can_grant_role(tests.role('admin')), 'a branch manager cannot give the admin role');

select tests.authenticate_as(tests.staff('admin'));
select ok(not app.can_grant_role(tests.role('owner')), 'Admin cannot give the Owner role');

select tests.authenticate_as(tests.staff('owner'));
select ok(app.can_grant_role(tests.role('owner')), 'the Owner can give the Owner role');

-- Who can manage whom
select tests.authenticate_as(tests.staff('manager_a'));
select ok(app.can_manage_staff(tests.staff('reception_a')), 'a manager can manage staff of their branch');
select ok(not app.can_manage_staff(tests.staff('reception_b')), 'a manager cannot manage staff of another branch');
select ok(
  not app.can_manage_staff(tests.staff('trainer_ab')),
  'a manager cannot manage staff who also work in a branch they cannot access'
);
select ok(not app.can_manage_staff(tests.staff('manager_a')), 'nobody manages their own account');
select ok(not app.can_manage_staff(tests.staff('admin')), 'a manager cannot manage someone with more permissions');

select * from finish();
rollback;
