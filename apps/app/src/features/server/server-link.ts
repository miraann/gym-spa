import { canLinkServer, serverLinkStatus } from '@gym/platform';
import { useQuery } from '@tanstack/react-query';
import { isOfflineEdition } from '@/lib/edition';

export const SERVER_LINK_KEY = ['server-link'] as const;

/** Whether this PC is linked, and whether the server runs on it; null outside the Windows app. */
export function useServerLink() {
  return useQuery({
    queryKey: SERVER_LINK_KEY,
    queryFn: serverLinkStatus,
    enabled: isOfflineEdition && canLinkServer(),
    staleTime: Infinity,
  });
}
