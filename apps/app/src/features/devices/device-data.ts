import type { Database } from '@gym/db';
import { isLanguage, type Language } from '@gym/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthController } from '@/features/auth/auth-context';
import type { DevicePlatform } from '@/features/auth/device-registration';
import { LIMITS_QUERY, requireClient, useActingClient } from '@/features/staff/admin-data';

// The devices screen's server calls (devices.manage, the acting staff member's branches): the list
// with each device's last report (device_overview), renaming and its language, moving it to
// another branch (move_device), and deactivating or reactivating it. New devices are registered on
// the device itself, at a password login by someone with devices.manage.

const DEVICES_QUERY = 'device-overview';

export interface DeviceInfo {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly platform: DevicePlatform;
  readonly defaultLanguage: Language | null;
  readonly isActive: boolean;
  readonly branchId: string;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
  readonly appVersion: string | null;
  readonly lastSeenByName: string | null;
}

type DeviceOverviewRow = Database['public']['Functions']['device_overview']['Returns'][number];

function toDeviceInfo(row: DeviceOverviewRow): DeviceInfo {
  // The generated types call every returned column non-null; these can be null.
  const nullable = row as Omit<
    DeviceOverviewRow,
    'last_seen_at' | 'app_version' | 'last_seen_by_name' | 'default_language'
  > & {
    last_seen_at: string | null;
    app_version: string | null;
    last_seen_by_name: string | null;
    default_language: string | null;
  };
  const platform: DevicePlatform =
    row.platform === 'android' || row.platform === 'windows' ? row.platform : 'web';
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    platform,
    defaultLanguage: isLanguage(nullable.default_language) ? nullable.default_language : null,
    isActive: row.is_active,
    branchId: row.branch_id,
    createdAt: row.created_at,
    lastSeenAt: nullable.last_seen_at,
    appVersion: nullable.app_version,
    lastSeenByName: nullable.last_seen_by_name,
  };
}

export function useDeviceOverview() {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [DEVICES_QUERY, actor],
    enabled: client !== undefined,
    queryFn: async () => {
      const { data, error } = await requireClient(client).rpc('device_overview');
      if (error) throw error;
      return data.map(toDeviceInfo);
    },
  });
}

/**
 * After a change: the list, the counts against the gym's limit, and this device's own registration
 * (a change to it, such as a move or a deactivation, takes effect at once).
 */
function useRefreshDevices() {
  const queryClient = useQueryClient();
  const controller = useAuthController();
  return async () => {
    await Promise.all(
      [DEVICES_QUERY, LIMITS_QUERY].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
    await controller.refreshAll();
  };
}

/** Throws the "not allowed" refusal when RLS left nothing to change. */
function changedOne(data: readonly unknown[]): void {
  if (data.length === 0) throw Object.assign(new Error('permission_denied'), { code: '42501' });
}

/** A device's name and its language before login (null: none). */
export function useSaveDevice() {
  const { client } = useActingClient();
  const refresh = useRefreshDevices();
  return useMutation({
    mutationFn: async ({
      deviceId,
      name,
      defaultLanguage,
    }: {
      deviceId: string;
      name: string;
      defaultLanguage: Language | null;
    }) => {
      const { data, error } = await requireClient(client)
        .from('devices')
        .update({ name, default_language: defaultLanguage })
        .eq('id', deviceId)
        .select('id');
      if (error) throw error;
      changedOne(data);
    },
    onSettled: refresh,
  });
}

/** Moves a device to another branch; it gets the next code there. */
export function useMoveDevice() {
  const { client } = useActingClient();
  const refresh = useRefreshDevices();
  return useMutation({
    mutationFn: async ({ deviceId, branchId }: { deviceId: string; branchId: string }) => {
      const { error } = await requireClient(client).rpc('move_device', {
        p_device_id: deviceId,
        p_branch_id: branchId,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/** Deactivates a device (nobody can unlock on it; it no longer counts) or reactivates it. */
export function useSetDeviceActive() {
  const { client } = useActingClient();
  const refresh = useRefreshDevices();
  return useMutation({
    mutationFn: async ({ deviceId, active }: { deviceId: string; active: boolean }) => {
      const { data, error } = await requireClient(client)
        .from('devices')
        .update({ is_active: active })
        .eq('id', deviceId)
        .select('id');
      if (error) throw error;
      changedOne(data);
    },
    onSettled: refresh,
  });
}
