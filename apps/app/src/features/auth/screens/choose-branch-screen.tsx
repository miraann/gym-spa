import { localizedName } from '@gym/i18n';
import { Building2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/lib/preferences';
import { useAuthController } from '../auth-context';
import type { AuthStep } from '../auth-controller';
import { authErrorKey, type AuthErrorKey, type BranchChoice } from '../staff-api';
import { AuthLayout } from './auth-layout';
import { AuthErrorMessage } from './form-error';

/** Picks the branch this device works in (on its first login, when the staff member has several). */
export function ChooseBranchScreen({
  staffId,
  branches,
  onStep,
}: {
  readonly staffId: string;
  readonly branches: readonly BranchChoice[];
  readonly onStep: (step: AuthStep) => void;
}) {
  const { t } = useTranslation('auth');
  const { language } = usePreferences();
  const controller = useAuthController();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);

  return (
    <AuthLayout title={t('branch.title')} description={t('branch.description')}>
      <ul className="flex flex-col gap-2">
        {branches.map((branch) => (
          <li key={branch.id}>
            <Button
              variant="outline"
              className="h-auto w-full justify-start gap-3 py-3"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                controller
                  .chooseBranch(staffId, branch.id)
                  .then(onStep)
                  .catch((thrown: unknown) => {
                    setError(authErrorKey(thrown, 'choose-branch'));
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              <Building2Icon />
              <span className="flex-1 text-start">{localizedName(branch, language)}</span>
              <span dir="ltr" className="text-xs text-muted-foreground">
                {branch.code}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <AuthErrorMessage error={error} />
    </AuthLayout>
  );
}
