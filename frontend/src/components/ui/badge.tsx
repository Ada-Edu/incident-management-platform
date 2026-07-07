import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> {
  /** Optional explicit colour (hex) used for a soft coloured pill. */
  color?: string | null;
}

/** A pill badge. When `color` is provided it renders a tinted background. */
export function Badge({ className, color, style, ...props }: BadgeProps) {
  const colorStyle = color
    ? { backgroundColor: `${color}22`, color, borderColor: `${color}55`, ...style }
    : style;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        !color && 'border-transparent bg-secondary text-secondary-foreground',
        className,
      )}
      style={colorStyle}
      {...props}
    />
  );
}
