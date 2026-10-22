// Members and cards added straight in the database for the end-to-end tests (no screens involved).
import { randomUUID } from 'node:crypto';
import { admin, write, type TestData } from './backend';

/** A member of the test's gym; returns its id. */
export async function addMember(
  data: TestData,
  branchId: string,
  fullName: string,
  phone: string,
): Promise<string> {
  const gym = await data.gym();
  const id = randomUUID();
  await write(
    admin().from('members').insert({
      id,
      gym_id: gym.id,
      branch_id: branchId,
      full_name: fullName,
      gender: 'male',
      phone,
      member_number: 0,
    }),
  );
  return id;
}

/** A card the member was given earlier. */
export async function addCard(data: TestData, memberId: string, uid: string): Promise<void> {
  const gym = await data.gym();
  await write(
    admin()
      .from('nfc_cards')
      .insert({ id: randomUUID(), gym_id: gym.id, member_id: memberId, uid }),
  );
}

/** A member's number, given by the server. */
export async function memberNumberOf(memberId: string): Promise<number> {
  const { data, error } = await admin()
    .from('members')
    .select('member_number')
    .eq('id', memberId)
    .single();
  if (error) throw error;
  return data.member_number;
}
