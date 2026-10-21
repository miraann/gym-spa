import { baghdadDateOf } from '@gym/core';
import { useState } from 'react';

/** Today's date in Baghdad (YYYY-MM-DD), read once when the component mounts. */
export function useBaghdadToday(): string {
  const [today] = useState(() => baghdadDateOf(Date.now()));
  return today;
}
