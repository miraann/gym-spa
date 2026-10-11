import { createContext, useContext } from 'react';
import type { SellerClient } from './backend';

export const SellerClientContext = createContext<SellerClient | null>(null);

/** The panel's Supabase client (main.tsx provides it). */
export function useSellerClient(): SellerClient {
  const client = useContext(SellerClientContext);
  if (!client) throw new Error('useSellerClient needs a SellerClientContext');
  return client;
}
