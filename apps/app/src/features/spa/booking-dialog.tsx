import {
  SPA_LIMITS,
  baghdadClock,
  baghdadMoment,
  formatMemberNumber,
  isCleanText,
  normalizeMemberPhone,
  normalizeName,
  spaDaySlots,
  spaHoldsTime,
  weekdayOf,
  worksDuring,
} from '@gym/core';
import { localizedName } from '@gym/i18n';
import { ChoiceGroup } from '@gym/ui/blocks/choice-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { Label } from '@gym/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { RadioGroup, RadioGroupItem } from '@gym/ui/components/radio-group';
import { Spinner } from '@gym/ui/components/spinner';
import { Textarea } from '@gym/ui/components/textarea';
import { UserPlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DateSelectField } from '@/components/date-select-field';
import { usePermission } from '@/features/auth/use-permissions';
import { useMemberSearch } from '@/features/members/member-data';
import { PayNow } from '@/features/payments/pay-now';
import { usePayNow } from '@/features/payments/use-pay-now';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import {
  useArriveSpaBooking,
  useBookSpa,
  useCreateGuest,
  useSpaBalances,
  useSpaBookings,
  type SpaCalendarSettings,
} from './spa-calendar-data';
import { useSpaRooms, useSpaServices, useSpaTherapists, type SpaService } from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';

/** Where a new booking starts out: its day and time, and the room or staff member clicked. */
export interface BookingStart {
  readonly day: string;
  readonly minute: number;
  readonly roomId: string | null;
  readonly therapistId: string | null;
}

interface Person {
  readonly id: string;
  readonly fullName: string;
  readonly gender: 'male' | 'female';
}

/** The minutes two spans share, half open: [a, b) and [c, d). */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * A new booking, or a walk-in (`walkIn`: now, and the arrival with its payment is recorded right
 * after the booking). The database checks everything again; this dialog only offers what fits.
 */
export function BookingDialog({
  branchId,
  start,
  walkIn,
  settings,
  onClose,
}: {
  readonly branchId: string;
  readonly start: BookingStart;
  readonly walkIn: boolean;
  readonly settings: SpaCalendarSettings;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const id = useId();
  const { online, readOnly } = useAdminWriteState();
  const mayTakeMoney = usePermission('payments.create');
  const services = useSpaServices();
  const rooms = useSpaRooms(branchId);
  const therapists = useSpaTherapists(branchId);
  const [day, setDay] = useState(start.day);
  const [minute, setMinute] = useState(start.minute);
  const dayBookings = useSpaBookings(branchId, day, day);
  const book = useBookSpa();
  const arrive = useArriveSpaBooking();
  const createGuest = useCreateGuest();
  const [ids] = useState(() => ({
    booking: crypto.randomUUID(),
    invoice: crypto.randomUUID(),
    payment: crypto.randomUUID(),
  }));

  const [person, setPerson] = useState<Person | null>(null);
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 1;
  const found = useMemberSearch(query, searching && person === null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guest, setGuest] = useState({
    name: '',
    phone: '',
    gender: 'female' as 'male' | 'female',
  });
  const [serviceId, setServiceId] = useState('');
  const [roomId, setRoomId] = useState(start.roomId ?? '');
  const [therapistId, setTherapistId] = useState(start.therapistId ?? '');
  const [source, setSource] = useState('pay');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SpaErrorKey | null>(null);

  const gender = person?.gender ?? (guestOpen ? guest.gender : null);
  const offered = (services.data ?? []).filter(
    (service) =>
      service.isActive &&
      (gender === null || service.gender === 'any' || service.gender === gender),
  );
  const service: SpaService | undefined =
    offered.find((each) => each.id === serviceId) ?? offered[0];
  const end = minute + (service?.durationMinutes ?? 0);
  const roomEnd = end + (service?.cleanupMinutes ?? 0);
  const open = (dayBookings.data ?? []).filter((booking) => spaHoldsTime(booking.status));
  const span = (booking: (typeof open)[number]) => ({
    start: baghdadClock(booking.startsAt).minute,
    end: baghdadClock(booking.endsAt).minute || 1440,
    roomEnd: baghdadClock(booking.roomFreeAt).minute || 1440,
  });

  const roomChoices = (rooms.data ?? [])
    .filter((room) => room.isActive && room.kind === service?.kind)
    .map((room) => {
      const taken = open.filter((booking) => {
        const each = span(booking);
        return booking.roomId === room.id && overlaps(minute, roomEnd, each.start, each.roomEnd);
      }).length;
      return { room, full: taken >= room.capacity };
    });
  const room =
    roomChoices.find((each) => each.room.id === roomId && !each.full) ??
    roomChoices.find((each) => !each.full);

  const weekday = weekdayOf(day);
  const therapistChoices = service?.needsTherapist
    ? (therapists.data ?? [])
        .filter((therapist) => therapist.isActive && therapist.serviceIds.includes(service.id))
        .map((therapist) => ({
          therapist,
          off: !worksDuring(therapist.hours, weekday, minute, end),
          busy: open.some((booking) => {
            const each = span(booking);
            return (
              booking.therapistId === therapist.id && overlaps(minute, end, each.start, each.end)
            );
          }),
        }))
    : [];
  const therapist =
    therapistChoices.find((each) => each.therapist.id === therapistId && !each.off && !each.busy) ??
    therapistChoices.find((each) => !each.off && !each.busy);

  const balances = useSpaBalances(person?.id ?? null);
  const usable = (balances.data ?? []).filter(
    (balance) =>
      balance.serviceId === service?.id &&
      balance.active &&
      balance.left > 0 &&
      balance.startsOn <= day &&
      (balance.endsOn === null || day <= balance.endsOn),
  );
  const chosenSource = usable.some((balance) => `${balance.source}:${balance.id}` === source)
    ? source
    : 'pay';
  const [paidWith, sourceId] =
    chosenSource === 'pay'
      ? (['pay', null] as const)
      : (chosenSource.split(':') as ['package' | 'plan', string]);
  const price = paidWith === 'pay' ? (service?.price ?? 0) : 0;
  const pay = usePayNow(price);

  const guestName = normalizeName(guest.name);
  const guestPhone = normalizeMemberPhone(guest.phone);
  const guestProblem = guestOpen && (!isCleanText(guestName, 100) || guestPhone === null);
  const personProblem = person === null && !guestOpen;
  const slotProblem = !service || !room || (service.needsTherapist && !therapist);
  const moneyProblem = walkIn && price > 0 && mayTakeMoney && pay.problem;
  const pending = book.isPending || arrive.isPending || createGuest.isPending;
  const times = spaDaySlots(settings.fromHour, settings.untilHour, settings.slotMinutes);
  const clock = (each: number) => format.time(baghdadMoment(day, each));

  const confirm = async () => {
    setSent(true);
    if (personProblem || guestProblem || slotProblem || moneyProblem) return;
    setError(null);
    try {
      let memberId = person?.id;
      let name = person?.fullName ?? guestName;
      if (!memberId) {
        memberId = await createGuest.mutateAsync({
          branchId,
          fullName: guestName,
          gender: guest.gender,
          phone: guestPhone ?? '',
        });
        // A retry books the guest just made, not another one.
        setPerson({ id: memberId, fullName: guestName, gender: guest.gender });
        setGuestOpen(false);
        name = guestName;
      }
      const startsAt = walkIn ? new Date() : baghdadMoment(day, minute);
      await book.mutateAsync({
        id: ids.booking,
        branchId,
        memberId,
        serviceId: service.id,
        startsAt,
        roomId: room.room.id,
        therapistId: service.needsTherapist ? (therapist?.therapist.id ?? null) : null,
        paidWith,
        sourceId,
        walkIn,
        note: note.trim() === '' ? null : note.trim(),
      });
      if (walkIn) {
        await arrive.mutateAsync({
          bookingId: ids.booking,
          invoiceId: ids.invoice,
          payment: mayTakeMoney ? pay.input(ids.payment) : null,
        });
        toast.success(t('booking.walkInDone', { name, service: localizedName(service, language) }));
      } else {
        toast.success(t('booking.done', { name, time: `${format.date(day)} ${clock(minute)}` }));
      }
      onClose();
    } catch (thrown) {
      setError(spaErrorKey(thrown, walkIn ? 'walk_in' : 'book'));
    }
  };

  return (
    <ResponsiveDialog
      open
      wide
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={walkIn ? t('booking.walkInTitle') : t('booking.title')}
      description={walkIn ? t('booking.walkInDescription') : undefined}
      footer={
        <>
          <Button
            disabled={!online || readOnly || pending}
            onClick={() => {
              void confirm();
            }}
          >
            {pending && <Spinner />}
            {t('booking.confirm')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <FieldGroup data-testid="spa-booking-form">
        {person ? (
          <Field>
            <FieldLabel>{t('booking.who')}</FieldLabel>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
              <span className="font-medium">{person.fullName}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPerson(null);
                }}
              >
                {t('booking.change')}
              </Button>
            </div>
          </Field>
        ) : guestOpen ? (
          <fieldset
            className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-3"
            data-testid="spa-guest"
          >
            <legend className="sr-only">{t('booking.newGuest')}</legend>
            <FieldDescription>{t('booking.guestHint')}</FieldDescription>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-guest-name`}>{t('booking.guestName')}</FieldLabel>
                <Input
                  id={`${id}-guest-name`}
                  autoComplete="off"
                  value={guest.name}
                  onChange={(event) => {
                    setGuest({ ...guest, name: event.target.value });
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-guest-phone`}>{t('booking.guestPhone')}</FieldLabel>
                <Input
                  id={`${id}-guest-phone`}
                  type="tel"
                  dir="ltr"
                  autoComplete="off"
                  value={guest.phone}
                  onChange={(event) => {
                    setGuest({ ...guest, phone: event.target.value });
                  }}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>{t('booking.guestGender')}</FieldLabel>
              <ChoiceGroup
                label={t('booking.guestGender')}
                value={guest.gender}
                choices={(['female', 'male'] as const).map((each) => ({
                  value: each,
                  label: t(`therapistGenders.${each}`),
                }))}
                onChange={(value) => {
                  setGuest({ ...guest, gender: value });
                }}
              />
            </Field>
            {sent && guestProblem && <FieldError>{t('booking.guestProblem')}</FieldError>}
          </fieldset>
        ) : (
          <>
            <Field data-invalid={(sent && personProblem) || undefined}>
              <FieldLabel htmlFor={`${id}-search`}>{t('booking.search')}</FieldLabel>
              <Input
                id={`${id}-search`}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
              {sent && personProblem && <FieldError>{t('booking.required')}</FieldError>}
            </Field>
            {searching && found.isSuccess && found.data.members.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('booking.none')}</p>
            )}
            {(found.data?.members.length ?? 0) > 0 && searching && (
              <RadioGroup
                aria-label={t('booking.search')}
                value=""
                onValueChange={(chosen) => {
                  const member = found.data?.members.find((each) => each.id === chosen);
                  if (member)
                    setPerson({ id: member.id, fullName: member.fullName, gender: member.gender });
                }}
                className="grid gap-2"
              >
                {found.data?.members
                  .filter((member) => member.status === 'active')
                  .map((member) => (
                    <Label
                      key={member.id}
                      htmlFor={`${id}-${member.id}`}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal"
                    >
                      <RadioGroupItem id={`${id}-${member.id}`} value={member.id} />
                      <span className="flex-1">{member.fullName}</span>
                      <span dir="ltr" className="text-sm text-muted-foreground tabular-nums">
                        {formatMemberNumber(member.memberNumber)}
                      </span>
                    </Label>
                  ))}
              </RadioGroup>
            )}
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                setGuestOpen(true);
              }}
            >
              <UserPlusIcon data-icon="inline-start" />
              {t('booking.newGuest')}
            </Button>
          </>
        )}

        {offered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('booking.noServices')}</p>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${id}-service`}>{t('booking.service')}</FieldLabel>
            <NativeSelect
              id={`${id}-service`}
              value={service?.id ?? ''}
              onChange={(event) => {
                setServiceId(event.target.value);
              }}
            >
              {offered.map((each) => (
                <NativeSelectOption key={each.id} value={each.id}>
                  {`${localizedName(each, language)} · ${t('services.minutes', { count: format.number(each.durationMinutes) })}`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}

        {!walkIn && (
          <div className="grid gap-4 sm:grid-cols-2">
            <DateSelectField
              label={t('booking.day')}
              value={day}
              onChange={setDay}
              years={[Number(start.day.slice(0, 4)), Number(start.day.slice(0, 4)) + 1]}
              allowEmpty={false}
            />
            <Field>
              <FieldLabel htmlFor={`${id}-time`}>{t('booking.time')}</FieldLabel>
              <NativeSelect
                id={`${id}-time`}
                value={String(minute)}
                onChange={(event) => {
                  setMinute(Number(event.target.value));
                }}
              >
                {(times.includes(minute) ? times : [...times, minute].sort((a, b) => a - b)).map(
                  (each) => (
                    <NativeSelectOption key={each} value={String(each)}>
                      {clock(each)}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
              {service && (
                <FieldDescription>{t('booking.ends', { time: clock(end) })}</FieldDescription>
              )}
            </Field>
          </div>
        )}

        {service && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={(sent && !room) || undefined}>
              <FieldLabel htmlFor={`${id}-room`}>{t('booking.room')}</FieldLabel>
              {roomChoices.length === 0 ? (
                <FieldError>{t('booking.noRoom')}</FieldError>
              ) : (
                <NativeSelect
                  id={`${id}-room`}
                  value={room?.room.id ?? ''}
                  onChange={(event) => {
                    setRoomId(event.target.value);
                  }}
                >
                  {roomChoices.map(({ room: each, full }) => (
                    <NativeSelectOption key={each.id} value={each.id} disabled={full}>
                      {full
                        ? `${localizedName(each, language)} (${t('booking.roomFull')})`
                        : localizedName(each, language)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </Field>
            {service.needsTherapist && (
              <Field data-invalid={(sent && !therapist) || undefined}>
                <FieldLabel htmlFor={`${id}-therapist`}>{t('booking.therapist')}</FieldLabel>
                {therapistChoices.length === 0 ? (
                  <FieldError>{t('booking.noTherapist')}</FieldError>
                ) : (
                  <NativeSelect
                    id={`${id}-therapist`}
                    value={therapist?.therapist.id ?? ''}
                    onChange={(event) => {
                      setTherapistId(event.target.value);
                    }}
                  >
                    {therapistChoices.map(({ therapist: each, off, busy }) => (
                      <NativeSelectOption key={each.id} value={each.id} disabled={off || busy}>
                        {off
                          ? `${each.fullName} (${t('booking.therapistOff')})`
                          : busy
                            ? `${each.fullName} (${t('booking.therapistBusy')})`
                            : each.fullName}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            )}
          </div>
        )}

        {service && usable.length > 0 && (
          <Field>
            <FieldLabel>{t('booking.paidWith')}</FieldLabel>
            <RadioGroup
              aria-label={t('booking.paidWith')}
              value={chosenSource}
              onValueChange={setSource}
              className="grid gap-2"
            >
              {[
                { key: 'pay', label: `${t('paidWith.pay')} · ${format.money(service.price)}` },
                ...usable.map((balance) => ({
                  key: `${balance.source}:${balance.id}`,
                  label: `${t(`paidWith.${balance.source}`)} · ${t('booking.left', {
                    name: localizedName(balance.names, language),
                    left: format.number(balance.left),
                    total: format.number(balance.total),
                  })}`,
                })),
              ].map((choice) => (
                <Label
                  key={choice.key}
                  htmlFor={`${id}-source-${choice.key}`}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
                >
                  <RadioGroupItem id={`${id}-source-${choice.key}`} value={choice.key} />
                  <span>{choice.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </Field>
        )}

        {walkIn && price > 0 && mayTakeMoney && (
          <PayNow
            label={t('details.payNow')}
            total={price}
            payNow={pay.payNow}
            onPayNow={pay.setPayNow}
            payment={pay.values}
            onPayment={pay.setPayment}
            showProblems={sent}
          />
        )}

        <Field>
          <FieldLabel htmlFor={`${id}-note`}>{t('booking.note')}</FieldLabel>
          <Textarea
            id={`${id}-note`}
            maxLength={SPA_LIMITS.note}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        {sent && slotProblem && <FieldError>{t('booking.missing')}</FieldError>}
        <SpaError error={error} />
      </FieldGroup>
    </ResponsiveDialog>
  );
}
