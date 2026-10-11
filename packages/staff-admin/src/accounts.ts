import { AuthAdminError } from './ports.ts';

// Two steps every module that makes logins with the Auth admin API shares: the staff module
// (operations.ts) and the seller panel's module (packages/seller-admin). Auth and the database
// can't share a transaction, so:
//   * a login whose rows can't be written is deleted again (writeRowsOrUndo);
//   * a login left behind when that undo failed keeps its address blocked (Auth's emails are
//     unique), so the next change to that address frees it first, but only when the database says
//     the login may go (withAddressFreed).
// Each module turns the errors below into its own keys.

/** The address is taken by a login that may not be removed. */
export class AddressTaken extends Error {
  override readonly name = 'AddressTaken';
}

/**
 * Writing the rows of a new login failed. undone: the login was deleted again. When the undo failed
 * too, the login is left behind (and was reported through onUndoFailed).
 */
export class RowsNotWritten extends Error {
  override readonly name = 'RowsNotWritten';
  constructor(
    readonly undone: boolean,
    options: ErrorOptions,
  ) {
    super('rows_not_written', options);
  }
}

export function isEmailTaken(error: unknown): boolean {
  return error instanceof AuthAdminError && error.code === 'email_exists';
}

export interface AddressFreeing {
  readonly email: string;
  /** The id of a login left behind at this address that may be deleted, or null (the database decides). */
  readonly findOrphan: (email: string) => Promise<string | null>;
  readonly deleteLogin: (id: string) => Promise<void>;
  /** Called after a left-behind login was deleted, for the operator's log. */
  readonly onOrphanDeleted: (id: string) => void;
}

/**
 * Runs an Auth change that gives a login this address. When the address is taken by a login left
 * behind, that login is deleted and the change tried once more. Only the id the database returned
 * is ever deleted. Throws AddressTaken when the address stays taken.
 */
export async function withAddressFreed<T>(
  freeing: AddressFreeing,
  change: () => Promise<T>,
): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (!isEmailTaken(error)) throw error;
  }

  const orphan = await freeing.findOrphan(freeing.email);
  if (orphan === null) throw new AddressTaken('address_taken');
  await freeing.deleteLogin(orphan);
  freeing.onOrphanDeleted(orphan);

  try {
    return await change();
  } catch (error) {
    if (isEmailTaken(error)) throw new AddressTaken('address_taken', { cause: error });
    throw error;
  }
}

/**
 * Writes the rows of a login that was just made. When that fails, the login is deleted again: a
 * login without its rows would keep its address blocked. Throws RowsNotWritten with what failed as
 * its cause.
 */
export async function writeRowsOrUndo(
  loginId: string,
  write: () => Promise<void>,
  deleteLogin: (id: string) => Promise<void>,
  onUndoFailed: (undoError: unknown, cause: unknown) => void,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    try {
      await deleteLogin(loginId);
    } catch (undoError) {
      onUndoFailed(undoError, error);
      throw new RowsNotWritten(false, { cause: error });
    }
    throw new RowsNotWritten(true, { cause: error });
  }
}
