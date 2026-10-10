// What the app shares with the server: the requests, their answers and the error keys. The server
// part (operations, handler, Supabase ports) is '@gym/staff-admin/server' and never goes into the
// app's bundle.
export {
  STAFF_ADMIN_ERROR_KEYS,
  STAFF_ADMIN_ERROR_STATUS,
  StaffAdminError,
  isStaffAdminErrorKey,
  type StaffAdminErrorKey,
} from './errors.ts';
export {
  STAFF_ADMIN_RESULTS,
  createStaffRequest,
  createStaffResult,
  deactivateStaffRequest,
  reactivateStaffRequest,
  renameStaffRequest,
  resetPasswordRequest,
  resetPasswordResult,
  staffAdminFailure,
  staffAdminRequest,
  staffChangeResult,
  type CreateStaffRequest,
  type CreateStaffResult,
  type DeactivateStaffRequest,
  type ReactivateStaffRequest,
  type RenameStaffRequest,
  type ResetPasswordRequest,
  type ResetPasswordResult,
  type StaffAdminAction,
  type StaffAdminRequest,
  type StaffAdminResults,
  type StaffChangeResult,
} from './requests.ts';
