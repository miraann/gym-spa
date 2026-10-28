import { SPA_KINDS, SPA_LIMITS } from '@gym/core';
import { localizedName } from '@gym/i18n';
import { GroupedList, GroupedListItem, RowChevron } from '@gym/ui/blocks/list-group';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Button } from '@gym/ui/components/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@gym/ui/components/field';
import { Input } from '@gym/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@gym/ui/components/native-select';
import { Spinner } from '@gym/ui/components/spinner';
import { groupedRowClass } from '@gym/ui/lib/grouped-list';
import { zodResolver } from '@hookform/resolvers/zod';
import { DoorOpenIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAdminWriteState } from '@/features/staff/write-state';
import { useFormat } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { InactiveBadge, SetupSection } from './setup-section';
import { useSaveSpaRoom, useSpaRooms, type SpaRoom, type SpaRoomDraft } from './spa-data';
import { SpaError } from './spa-error';
import { spaErrorKey, type SpaErrorKey } from './spa-errors';
import { useBranchChoice } from '@/lib/use-branch-choice';
import { BranchSelect } from '@/components/branch-select';
import { CheckField, FormMessage, NameFields } from './spa-fields';
import { roomFormSchema, roomFormValues, type RoomFormValues } from './spa-forms';

/** /spa/setup/rooms: a branch's rooms, added and changed in a dialog. */
export function RoomsSetup() {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const format = useFormat();
  const { branchId, setBranchId, active, loaded } = useBranchChoice();
  const rooms = useSpaRooms(branchId);
  const [editing, setEditing] = useState<SpaRoom | 'new' | null>(null);

  if (loaded && branchId === '') {
    return <p className="text-muted-foreground">{t('setup.noBranch')}</p>;
  }
  return (
    <>
      <SetupSection
        addLabel={t('rooms.add')}
        onAdd={() => {
          setEditing('new');
        }}
        canAdd={branchId !== ''}
        pending={rooms.isPending}
        error={rooms.isError ? spaErrorKey(rooms.error, 'load_rooms') : null}
        empty={t('rooms.empty')}
        emptyIcon={<DoorOpenIcon />}
        isEmpty={rooms.data?.length === 0}
        toolbar={
          <BranchSelect
            label={t('setup.branch')}
            branchId={branchId}
            active={active}
            onChange={setBranchId}
          />
        }
      >
        <GroupedList aria-label={t('setup.tabs.rooms')}>
          {rooms.data?.map((room) => (
            <GroupedListItem key={room.id}>
              <button
                type="button"
                className={groupedRowClass()}
                data-spa-room={room.nameCkb}
                onClick={() => {
                  setEditing(room);
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{localizedName(room, language)}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>{t(`kinds.${room.kind}`)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t('rooms.places', { count: format.number(room.capacity) })}</span>
                    {!room.isActive && <InactiveBadge />}
                  </span>
                </span>
                <RowChevron />
              </button>
            </GroupedListItem>
          ))}
        </GroupedList>
      </SetupSection>
      {editing && (
        <RoomDialog
          branchId={branchId}
          room={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function RoomDialog({
  branchId,
  room,
  onClose,
}: {
  readonly branchId: string;
  readonly room: SpaRoom | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('spa');
  const { language } = usePreferences();
  const formId = useId();
  const { online, readOnly } = useAdminWriteState();
  const save = useSaveSpaRoom();
  const [error, setError] = useState<SpaErrorKey | null>(null);
  const form = useForm<RoomFormValues, unknown, SpaRoomDraft>({
    resolver: zodResolver(roomFormSchema(room?.branchId ?? branchId)),
    defaultValues: roomFormValues(room),
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    setError(null);
    save.mutate(
      { id: room?.id ?? null, room: values },
      {
        onSuccess: () => {
          toast.success(t('rooms.saved'));
          onClose();
        },
        onError: (thrown) => {
          setError(spaErrorKey(thrown, 'save_room'));
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        room ? t('rooms.editTitle', { name: localizedName(room, language) }) : t('rooms.newTitle')
      }
      footer={
        <>
          <Button type="submit" form={formId} disabled={!online || readOnly || save.isPending}>
            {save.isPending && <Spinner />}
            {t('actions.save')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)}>
        <FieldGroup data-testid="spa-room-form">
          <NameFields
            register={{
              ckb: form.register('nameCkb'),
              en: form.register('nameEn'),
              ar: form.register('nameAr'),
            }}
            errors={{ ckb: errors.nameCkb, en: errors.nameEn, ar: errors.nameAr }}
            max={SPA_LIMITS.roomName}
            label={t('form.roomName')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${formId}-kind`}>{t('form.kind')}</FieldLabel>
              <NativeSelect id={`${formId}-kind`} {...form.register('kind')}>
                {SPA_KINDS.map((kind) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {t(`kinds.${kind}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field data-invalid={Boolean(errors.capacity)}>
              <FieldLabel htmlFor={`${formId}-capacity`}>{t('form.capacity')}</FieldLabel>
              <Input
                id={`${formId}-capacity`}
                inputMode="numeric"
                dir="ltr"
                className="tabular-nums"
                {...form.register('capacity')}
              />
              <FieldDescription>{t('form.capacityHint')}</FieldDescription>
              <FormMessage error={errors.capacity} max={SPA_LIMITS.maxCapacity} />
            </Field>
          </div>
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <CheckField
                label={t('form.active')}
                hint={t('form.activeHint')}
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <SpaError error={error} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
