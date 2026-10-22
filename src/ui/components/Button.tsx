import { Button as KitButton, type ButtonProps as KitButtonProps } from '@/ui/kit';

/**
 * Legacy button API over the kit button. New code should import `Button` from `@/ui/kit`.
 * `primary` → filled, `secondary` → gray, `ghost` → plain, `danger` → gray destructive.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg' | 'icon';

export interface ButtonProps extends Omit<KitButtonProps, 'variant' | 'size' | 'icon'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT: Record<ButtonVariant, Pick<KitButtonProps, 'variant' | 'destructive'>> = {
  primary: { variant: 'filled' },
  secondary: { variant: 'gray' },
  ghost: { variant: 'plain' },
  danger: { variant: 'gray', destructive: true },
};

export function Button({ variant = 'secondary', size = 'md', ...rest }: ButtonProps) {
  return (
    <KitButton
      {...VARIANT[variant]}
      size={size === 'icon' ? 'md' : size}
      icon={size === 'icon'}
      {...rest}
    />
  );
}
