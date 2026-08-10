'use client';

import { forwardRef } from 'react';
import clsx from 'clsx';
import { GlassSurface, GlassSurfaceProps } from './GlassSurface';

export const GlassPanel = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ className, ...rest }, ref) => (
    <GlassSurface
      ref={ref}
      radiusClassName="rounded-3xl"
      glass={{ scale: -110, chroma: 6, blur: 6, mapBlur: 20, border: 0.05 }}
      className={clsx('p-6 sm:p-8', className)}
      {...rest}
    />
  ),
);

GlassPanel.displayName = 'GlassPanel';
