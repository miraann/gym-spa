// The server part of the staff module: the Edge Function (online) and gym-server (offline) use it.
// Never import it into the app: it works with the secret key.
export * from './index.ts';
export { readStaffAdminConfig } from './env.ts';
export { CORS_HEADERS, createStaffAdminHandler, type StaffAdminHandlerOptions } from './handler.ts';
export {
  createStaff,
  deactivateStaff,
  reactivateStaff,
  renameStaff,
  resetPassword,
  type StaffAdminDeps,
} from './operations.ts';
export {
  AuthAdminError,
  DatabaseError,
  consoleLog,
  summarizeError,
  type AdminPort,
  type CallerPort,
  type ChangeAction,
  type ChangePermit,
  type CreateCheck,
  type CreatePermit,
  type ErrorSummary,
  type NewLogin,
  type NewStaffProfile,
  type StaffAdminLog,
  type StaffAdminLogEntry,
} from './ports.ts';
export {
  supabaseAdminPort,
  supabaseCallerPort,
  supabaseStaffAdminPorts,
  type StaffAdminConfig,
} from './supabase-ports.ts';
export {
  TOKEN_ALGORITHMS,
  jwksTokenVerifier,
  projectTokenVerifier,
  type TokenCheck,
  type TokenVerifier,
} from './token.ts';
export {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
  type RandomBytes,
} from './temporary-password.ts';
