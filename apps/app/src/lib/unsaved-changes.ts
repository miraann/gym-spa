import { useEffect } from 'react';

// Forms with changes not saved yet. Something that would leave the page by itself, such as a card
// scanned on another screen opening its member (step 2h), asks first while there are any, so
// nobody's typing is lost.

const dirtyForms = new Set<symbol>();

/** Whether any form on screen has changes that aren't saved. */
export function hasUnsavedChanges(): boolean {
  return dirtyForms.size > 0;
}

/** Tells the app that this form has changes that aren't saved yet, while `dirty`. */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const form = Symbol('form');
    dirtyForms.add(form);
    return () => {
      dirtyForms.delete(form);
    };
  }, [dirty]);
}
