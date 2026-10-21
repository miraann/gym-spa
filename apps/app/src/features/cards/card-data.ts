import {
  CARD_END_REASONS,
  CARD_STATUSES,
  MEMBER_STATUSES,
  type CardEndReason,
  type CardReplaceReason,
  type CardStatus,
  type MemberStatus,
} from '@gym/core';
import type { Database } from '@gym/db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireClient, useActingClient } from '@/features/staff/admin-data';
import type { AppSupabaseClient } from '@/lib/backend';
import { errorField } from '@/lib/save-error';

// The card screens' server calls (README → NFC cards), each with the acting staff member's own
// session: RLS and the card functions decide what they see and may change. UIDs are sent as stored
// (normalizeCardUid, already in the card's own byte order).

const CARDS_QUERY = 'cards';

type CardRow = Database['public']['Tables']['nfc_cards']['Row'];

/** One time a card was a member's (public.nfc_cards). */
export interface MemberCard {
  readonly id: string;
  readonly memberId: string;
  readonly uid: string;
  readonly status: CardStatus;
  readonly endReason: CardEndReason | null;
  readonly endedAt: string | null;
  readonly blockReason: string | null;
  readonly blockedAt: string | null;
  readonly unblockedAt: string | null;
  /** When the member was given it. */
  readonly createdAt: string;
}

/** Whose card a UID is (find_card), for "this card is …'s". */
export interface CardHolder {
  readonly card: MemberCard;
  readonly member: {
    readonly id: string;
    readonly fullName: string;
    readonly memberNumber: number;
    readonly status: MemberStatus;
  } | null;
}

const CARD_COLUMNS =
  'id, member_id, uid, status, end_reason, ended_at, block_reason, blocked_at, unblocked_at, created_at';

type CardColumns = Pick<
  CardRow,
  | 'id'
  | 'member_id'
  | 'uid'
  | 'status'
  | 'end_reason'
  | 'ended_at'
  | 'block_reason'
  | 'blocked_at'
  | 'unblocked_at'
  | 'created_at'
>;

export function toMemberCard(row: CardColumns): MemberCard {
  return {
    id: row.id,
    memberId: row.member_id,
    uid: row.uid,
    // The database's checks keep these to their lists; this only narrows the types.
    status: CARD_STATUSES.find((status) => status === row.status) ?? 'ended',
    endReason: CARD_END_REASONS.find((reason) => reason === row.end_reason) ?? null,
    endedAt: row.ended_at,
    blockReason: row.block_reason,
    blockedAt: row.blocked_at,
    unblockedAt: row.unblocked_at,
    createdAt: row.created_at,
  };
}

/** A member's cards, the newest first: the working one (if any) and their history. */
export function useMemberCards(memberId: string) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [CARDS_QUERY, actor, 'member', memberId],
    enabled: client !== undefined,
    queryFn: async (): Promise<MemberCard[]> => {
      const { data, error } = await requireClient(client)
        .from('nfc_cards')
        .select(CARD_COLUMNS)
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data.map(toMemberCard);
    },
  });
}

/** Who has a UID now (or had it last); null for a card the gym never gave out. */
export async function findCardHolder(
  client: AppSupabaseClient,
  uid: string,
): Promise<CardHolder | null> {
  const found = await client.rpc('find_card', { p_uid: uid }).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return null;
  const card = toMemberCard(found.data);
  const member = await client
    .from('members')
    .select('id, full_name, member_number, status')
    .eq('id', card.memberId)
    .maybeSingle();
  if (member.error) throw member.error;
  const row = member.data;
  return {
    card,
    member: row && {
      id: row.id,
      fullName: row.full_name,
      memberNumber: row.member_number,
      status: MEMBER_STATUSES.find((status) => status === row.status) ?? 'active',
    },
  };
}

/** Whose card a UID is; only asked for once there is a UID. */
export function useCardHolder(uid: string | null) {
  const { client, actor } = useActingClient();
  return useQuery({
    queryKey: [CARDS_QUERY, actor, 'holder', uid],
    enabled: client !== undefined && uid !== null,
    queryFn: () => findCardHolder(requireClient(client), uid ?? ''),
  });
}

/** After a change, the cards (and members, whose pages show them) read the server again. */
function useRefreshCards() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [CARDS_QUERY] });
}

/**
 * Gives a member a card (assign_card) with the id the dialog made. Saving the same card again (a
 * retry after a lost answer) finds it already saved.
 */
export function useAssignCard() {
  const { client } = useActingClient();
  const refresh = useRefreshCards();
  return useMutation({
    mutationFn: async (input: { id: string; memberId: string; uid: string }): Promise<void> => {
      const acting = requireClient(client);
      const { error } = await acting.rpc('assign_card', {
        p_id: input.id,
        p_member_id: input.memberId,
        p_uid: input.uid,
      });
      if (error && errorField(error, 'message') === 'card_exists') {
        const saved = await acting.from('nfc_cards').select('uid').eq('id', input.id).maybeSingle();
        if (saved.data?.uid === input.uid) return;
      }
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/**
 * A card was lost, damaged or stolen (replace_card): it stops working, and with `newCard` the
 * member gets that card in the same step.
 */
export function useReplaceCard() {
  const { client } = useActingClient();
  const refresh = useRefreshCards();
  return useMutation({
    mutationFn: async (input: {
      cardId: string;
      reason: CardReplaceReason;
      newCard: { id: string; uid: string } | null;
    }): Promise<void> => {
      const { error } = await requireClient(client).rpc('replace_card', {
        p_card_id: input.cardId,
        p_reason: input.reason,
        ...(input.newCard === null
          ? {}
          : { p_new_id: input.newCard.id, p_new_uid: input.newCard.uid }),
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/** The member gave their card back (end_card). */
export function useEndCard() {
  const { client } = useActingClient();
  const refresh = useRefreshCards();
  return useMutation({
    mutationFn: async (cardId: string): Promise<void> => {
      const { error } = await requireClient(client).rpc('end_card', { p_card_id: cardId });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/** Blocks a card, with a reason (block_card, cards.blacklist). */
export function useBlockCard() {
  const { client } = useActingClient();
  const refresh = useRefreshCards();
  return useMutation({
    mutationFn: async (input: { cardId: string; reason: string }): Promise<void> => {
      const { error } = await requireClient(client).rpc('block_card', {
        p_card_id: input.cardId,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

/** Unblocks a card: anyone may be given it again (unblock_card, cards.blacklist). */
export function useUnblockCard() {
  const { client } = useActingClient();
  const refresh = useRefreshCards();
  return useMutation({
    mutationFn: async (cardId: string): Promise<void> => {
      const { error } = await requireClient(client).rpc('unblock_card', { p_card_id: cardId });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}
