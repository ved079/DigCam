'use client';

import { useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';

/**
 * Shared orientation hook for the digicam layout. Reads screen.orientation.type
 * when available (preferred), falling back to the orientation matchMedia query.
 * Reused by the gallery playback screens now and the capture screen later.
 */
function readOrientation(): Orientation {
  if (typeof window === 'undefined') return 'portrait';
  const so = window.screen?.orientation;
  if (so && typeof so.type === 'string') {
    return so.type.startsWith('landscape') ? 'landscape' : 'portrait';
  }
  if (window.matchMedia?.('(orientation: landscape)').matches) return 'landscape';
  return 'portrait';
}

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(readOrientation);

  useEffect(() => {
    const update = () => setOrientation(readOrientation());
    const so = window.screen?.orientation;
    if (so) {
      so.addEventListener?.('change', update as EventListener);
    }
    const mql = window.matchMedia?.('(orientation: landscape)');
    if (mql) {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', update);
      } else {
        // Legacy Safari (pre-14): only the deprecated listener is available.
        mql.addListener(update);
      }
    }
    return () => {
      if (so) so.removeEventListener?.('change', update as EventListener);
      if (mql) {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', update);
        } else {
          mql.removeListener(update);
        }
      }
    };
  }, []);

  return orientation;
}