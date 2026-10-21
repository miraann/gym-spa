import { imageDataUrl, MEMBER_PHOTO_MAX_SIDE, type StoredImage } from '@gym/core';
import { cameraSupported, openCamera, stopCamera, type CameraProblem } from '@gym/platform';
import { ResponsiveDialog } from '@gym/ui/blocks/responsive-dialog';
import { Alert, AlertDescription } from '@gym/ui/components/alert';
import { Button } from '@gym/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@gym/ui/components/card';
import { Skeleton } from '@gym/ui/components/skeleton';
import { Spinner } from '@gym/ui/components/spinner';
import { cn } from '@gym/ui/lib/utils';
import { CameraIcon, ImageUpIcon, TrashIcon, TriangleAlertIcon, UserRoundIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePermission } from '@/features/auth/use-permissions';
import { useAdminWriteState } from '@/features/staff/write-state';
import { logError } from '@/lib/logger';
import {
  useMemberPhoto,
  useRemoveMemberPhoto,
  useSetMemberPhoto,
  type Member,
} from './member-data';
import { MemberError } from './member-error';
import { memberErrorKey, type MemberErrorKey } from './member-errors';
import {
  preparePhoto,
  preparePhotoFile,
  type PhotoProblem,
  type PreparedPhoto,
} from './member-photo-image';

/** The member's photo, large, or a placeholder without one. */
export function MemberPhotoImage({
  image,
  alt,
  className,
}: {
  readonly image: StoredImage | null | undefined;
  readonly alt: string;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted',
        className,
      )}
    >
      {image ? (
        <img src={imageDataUrl(image)} alt={alt} className="size-full object-cover" />
      ) : (
        <UserRoundIcon aria-hidden className="size-1/2 text-muted-foreground" />
      )}
    </div>
  );
}

/**
 * The photo on a member's page (spec §4.1, step 2c): taken with the camera or picked from a file,
 * shown before saving, saved at once. Staff with members.edit change it; an archived member's
 * photo stays as it is.
 */
export function MemberPhotoCard({ member }: { readonly member: Member }) {
  const { t } = useTranslation('members');
  const { online, readOnly } = useAdminWriteState();
  const canEdit = usePermission('members.edit') && member.status !== 'archived';
  const photo = useMemberPhoto(member);
  const setPhoto = useSetMemberPhoto();
  const removePhoto = useRemoveMemberPhoto();
  const input = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<PreparedPhoto | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [problem, setProblem] = useState<PhotoProblem | null>(null);
  const [error, setError] = useState<MemberErrorKey | null>(null);
  const hasPhoto = member.photoUpdatedAt !== null;
  const writable = online && !readOnly;
  const busy = preparing || setPhoto.isPending || removePhoto.isPending;
  const canUseCamera = cameraSupported();
  // Without a photo (a member just added, too) taking one is the card's main action.
  const takeIsMain = !hasPhoto && canUseCamera;
  const chooseIsMain = !hasPhoto && !canUseCamera;

  const pick = async (picker: HTMLInputElement) => {
    const file = picker.files?.[0];
    if (!file) return;
    setProblem(null);
    setError(null);
    setPreparing(true);
    try {
      const prepared = await preparePhotoFile(file);
      if (prepared.ok) setPending(prepared.prepared);
      else setProblem(prepared.problem);
    } catch (failure) {
      logError(failure, { area: 'members', action: 'photo_prepare' });
      setProblem('photo_unreadable');
    } finally {
      setPreparing(false);
      // Cleared only after reading: the same file can be picked again after a problem.
      picker.value = '';
    }
  };

  const save = (prepared: PreparedPhoto) => {
    setError(null);
    setPhoto.mutate(
      { id: member.id, photo: prepared },
      {
        onSuccess: () => {
          setPending(null);
          toast.success(t('photo.saved'));
        },
        onError: (failure) => {
          setPending(null);
          setError(memberErrorKey(failure, 'photo_save'));
        },
      },
    );
  };

  const remove = () => {
    setError(null);
    removePhoto.mutate(member.id, {
      onSuccess: () => {
        setConfirmRemove(false);
        toast.success(t('photo.removed'));
      },
      onError: (failure) => {
        setConfirmRemove(false);
        setError(memberErrorKey(failure, 'photo_remove'));
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('photo.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-start gap-4">
        {hasPhoto && photo.isPending ? (
          <Skeleton className="size-40 rounded-2xl" />
        ) : (
          <MemberPhotoImage
            image={hasPhoto ? photo.data : null}
            alt={t('photo.alt', { name: member.fullName })}
            className="size-40"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {!hasPhoto && <p className="text-sm text-muted-foreground">{t('photo.none')}</p>}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {canUseCamera && (
                <Button
                  variant={takeIsMain ? 'default' : 'outline'}
                  size={takeIsMain ? 'lg' : 'default'}
                  disabled={!writable || busy}
                  onClick={() => {
                    setProblem(null);
                    setError(null);
                    setCameraOpen(true);
                  }}
                >
                  <CameraIcon aria-hidden />
                  {t('photo.take')}
                </Button>
              )}
              <Button
                variant={chooseIsMain ? 'default' : 'outline'}
                size={chooseIsMain ? 'lg' : 'default'}
                disabled={!writable || busy}
                onClick={() => input.current?.click()}
              >
                {preparing ? <Spinner /> : <ImageUpIcon aria-hidden />}
                {preparing ? t('photo.preparing') : t('photo.choose')}
              </Button>
              {hasPhoto && (
                <Button
                  variant="ghost"
                  disabled={!writable || busy}
                  onClick={() => {
                    setConfirmRemove(true);
                  }}
                >
                  <TrashIcon aria-hidden />
                  {t('photo.remove')}
                </Button>
              )}
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                data-testid="member-photo-file"
                onChange={(event) => {
                  void pick(event.target);
                }}
              />
            </div>
          )}
          {problem && (
            <Alert variant="destructive" role="alert">
              <TriangleAlertIcon />
              <AlertDescription>{t(`photo.errors.${problem}`)}</AlertDescription>
            </Alert>
          )}
          <MemberError error={error} />
        </div>
      </CardContent>

      {cameraOpen && (
        <CameraDialog
          onClose={() => {
            setCameraOpen(false);
          }}
          onCaptured={(prepared) => {
            setCameraOpen(false);
            setPending(prepared);
          }}
          onProblem={(next) => {
            setCameraOpen(false);
            setProblem(next);
          }}
        />
      )}

      <ResponsiveDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t('photo.confirmTitle')}
        description={t('photo.confirmDescription', { name: member.fullName })}
        footer={
          <>
            <Button
              disabled={setPhoto.isPending || !online}
              onClick={() => {
                if (pending) save(pending);
              }}
            >
              {setPhoto.isPending && <Spinner />}
              {t('photo.save')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPending(null);
              }}
            >
              {t('photo.back')}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="flex justify-center">
            <MemberPhotoImage image={pending.photo} alt={t('photo.preview')} className="size-56" />
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('photo.removeTitle', { name: member.fullName })}
        description={t('photo.removeDescription')}
        footer={
          <>
            <Button
              variant="destructive"
              disabled={removePhoto.isPending || !online}
              onClick={remove}
            >
              {removePhoto.isPending && <Spinner />}
              {t('photo.remove')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmRemove(false);
              }}
            >
              {t('photo.back')}
            </Button>
          </>
        }
      />
    </Card>
  );
}

const CAMERA_PROBLEMS: Readonly<Record<CameraProblem, `camera_${CameraProblem}`>> = {
  unsupported: 'camera_unsupported',
  denied: 'camera_denied',
  no_camera: 'camera_no_camera',
  busy: 'camera_busy',
  unavailable: 'camera_unavailable',
};

/** The live camera: the member looks at it, staff press "take". The camera is off once closed. */
function CameraDialog({
  onClose,
  onCaptured,
  onProblem,
}: {
  readonly onClose: () => void;
  readonly onCaptured: (prepared: PreparedPhoto) => void;
  readonly onProblem: (problem: PhotoProblem) => void;
}) {
  const { t } = useTranslation('members');
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraProblem, setCameraProblem] = useState<CameraProblem | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let opened: MediaStream | null = null;
    let closed = false;
    void openCamera().then((result) => {
      if (!result.ok) {
        if (!closed) setCameraProblem(result.problem);
        return;
      }
      if (closed) {
        stopCamera(result.stream);
        return;
      }
      opened = result.stream;
      setStream(result.stream);
    });
    return () => {
      closed = true;
      if (opened) stopCamera(opened);
    };
  }, []);

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream]);

  const capture = async () => {
    const frame = video.current;
    if (!frame || frame.videoWidth === 0) return;
    setCapturing(true);
    try {
      const bitmap = await createImageBitmap(frame);
      try {
        const prepared = await preparePhoto(bitmap);
        if (prepared.ok) onCaptured(prepared.prepared);
        else onProblem(prepared.problem);
      } finally {
        bitmap.close();
      }
    } catch (failure) {
      logError(failure, { area: 'members', action: 'photo_capture' });
      onProblem('photo_unreadable');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('photo.cameraTitle')}
      description={t('photo.cameraDescription')}
      footer={
        <>
          <Button
            size="lg"
            disabled={stream === null || capturing}
            onClick={() => {
              void capture();
            }}
          >
            {capturing ? <Spinner /> : <CameraIcon aria-hidden />}
            {t('photo.capture')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('photo.back')}
          </Button>
        </>
      }
    >
      {cameraProblem ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlertIcon />
          <AlertDescription>{t(`photo.errors.${CAMERA_PROBLEMS[cameraProblem]}`)}</AlertDescription>
        </Alert>
      ) : (
        <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl bg-muted">
          {stream === null && <Skeleton className="absolute inset-0" />}
          {/* Mirrored like a mirror, so moving left looks left; the photo itself is not mirrored. */}
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            data-testid="member-camera"
            className="size-full -scale-x-100 object-cover"
            width={MEMBER_PHOTO_MAX_SIDE}
          />
        </div>
      )}
    </ResponsiveDialog>
  );
}
