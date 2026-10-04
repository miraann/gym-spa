import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: LucideIcon;
  /** Small example shown at the end of the option, e.g. "١٢٣". */
  readonly sample?: string;
  /** Language of the label when it differs from the page (language names). */
  readonly lang?: string;
}

/** Radio options shown as cards. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];
  readonly onChange: (value: T) => void;
}) {
  const id = useId();

  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const choice = choices.find((option) => option.value === next);
        if (choice) onChange(choice.value);
      }}
      className="grid gap-2 sm:grid-cols-3"
    >
      {choices.map((choice) => {
        const itemId = `${id}-${choice.value}`;
        const Icon = choice.icon;
        return (
          <Label
            key={choice.value}
            htmlFor={itemId}
            className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted"
          >
            <RadioGroupItem id={itemId} value={choice.value} />
            {Icon && <Icon aria-hidden className="size-4 text-muted-foreground" />}
            <span lang={choice.lang} className="font-medium">
              {choice.label}
            </span>
            {choice.sample && (
              <span className="ms-auto text-muted-foreground">{choice.sample}</span>
            )}
          </Label>
        );
      })}
    </RadioGroup>
  );
}
