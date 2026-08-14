'use client';
import { useEffect, useState } from 'react';

interface BootScreenProps {
  onComplete: () => void;
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 600);
    const t2 = setTimeout(() => setPhase('out'), 1400);
    const t3 = setTimeout(() => { setShow(false); onComplete(); }, 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  if (!show) return null;

  return (
    <div className={`digi-boot-screen boot-${phase}`}>
      <div className="boot-logo">SONY</div>
      <div className="boot-model">DSC-W530</div>
      <div className="boot-line" />
    </div>
  );
}
