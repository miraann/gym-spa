import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './backend';

// The spa's setup, added directly for the calendar's tests.

export async function addSpaService(
  data: TestData,
  service: {
    readonly nameCkb: string;
    readonly kind: string;
    readonly minutes: number;
    readonly price: number;
    readonly needsTherapist: boolean;
  },
): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('spa_services').insert({
      id,
      gym_id: gym.id,
      name_ckb: service.nameCkb,
      kind: service.kind,
      duration_minutes: service.minutes,
      price: service.price,
      needs_therapist: service.needsTherapist,
    }),
  );
  return id;
}

export async function addSpaRoom(
  data: TestData,
  branchId: string,
  room: { readonly nameCkb: string; readonly kind: string; readonly capacity: number },
): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('spa_rooms').insert({
      id,
      gym_id: gym.id,
      branch_id: branchId,
      name_ckb: room.nameCkb,
      kind: room.kind,
      capacity: room.capacity,
    }),
  );
  return id;
}

/** A therapist who does these services and works every day, all day. */
export async function addSpaTherapist(
  data: TestData,
  branchId: string,
  fullName: string,
  serviceIds: readonly string[],
  commissionPercent = 0,
): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('spa_therapists').insert({
      id,
      gym_id: gym.id,
      branch_id: branchId,
      full_name: fullName,
      gender: 'female',
      commission_percent: commissionPercent,
    }),
  );
  await write(
    admin()
      .from('spa_therapist_services')
      .insert(
        serviceIds.map((serviceId) => ({
          gym_id: gym.id,
          therapist_id: id,
          service_id: serviceId,
        })),
      ),
  );
  await write(
    admin()
      .from('spa_therapist_hours')
      .insert(
        [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          gym_id: gym.id,
          therapist_id: id,
          weekday,
          starts_at: '00:00',
          ends_at: '24:00',
        })),
      ),
  );
  return id;
}
