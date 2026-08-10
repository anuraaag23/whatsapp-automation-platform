'use client';

import { forwardRef, ReactNode } from 'react';
import clsx from 'clsx';
import { motion, HTMLMotionProps } from 'framer-motion';

export interface GlassButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<NonNullable<GlassButtonProps['variant']>, string> = {
  primary:
    'bg-electric text-white shadow-[0_8px_24px_rgba(10,132,255,0.35)] hover:bg-electric-soft',
  secondary:
    'bg-white/50 text-deep-navy border border-white/40 hover:bg-white/70 dark:bg-white/10 dark:text-white dark:border-white/10 dark:hover:bg-white/20',
  ghost: 'bg-transparent text-deep-navy hover:bg-black/5 dark:text-white dark:hover:bg-white/10',
  danger: 'bg-danger text-white hover:bg-danger/90',
};

const SIZES: Record<NonNullable<GlassButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    { variant = 'primary', size = 'md', icon, loading, className, children, disabled, ...rest },
    ref,
  ) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
          'disabled:opacity-50 disabled:pointer-events-none',
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          icon
        )}
        {children}
      </motion.button>
    );
  },
);

GlassButton.displayName = 'GlassButton';
