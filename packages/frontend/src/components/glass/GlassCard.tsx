'use client';

import { forwardRef, ReactNode } from 'react';
import clsx from 'clsx';
import { GlassSurface, GlassSurfaceProps } from './GlassSurface';

export interface GlassCardProps extends Omit<GlassSurfaceProps, 'children'> {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  children?: ReactNode;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ title, subtitle, icon, actions, padded = true, className, children, ...rest }, ref) => {
    return (
      <GlassSurface
        ref={ref}
        radiusClassName="rounded-2xl"
        className={clsx(padded && 'p-5 sm:p-6', className)}
        glass={{ scale: -70, chroma: 4, blur: 4, mapBlur: 16 }}
        {...rest}
      >
        {(title || icon || actions) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/10 text-electric">
                  {icon}
                </div>
              )}
              <div>
                {title && (
                  <h3 className="text-sm font-semibold text-deep-navy dark:text-white">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-xs text-deep-navy/60 dark:text-white/60">{subtitle}</p>
                )}
              </div>
            </div>
            {actions}
          </div>
        )}
        {children}
      </GlassSurface>
    );
  },
);

GlassCard.displayName = 'GlassCard';
