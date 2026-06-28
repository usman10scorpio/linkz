import { useState, useEffect } from 'react';
import { Armchair, Lock, CheckCircle2, Clock } from 'lucide-react';

export interface Seat {
  _id: string;
  number: number;
  status: 'available' | 'held' | 'reserved';
  heldUntil: string | null;
  heldBy: string | null;
}

interface SeatCardProps {
  seat: Seat;
  currentUserId: string;
  onSelect: (seat: Seat) => void;
  disabled: boolean;
}

const STATUS_CONFIG = {
  available: {
    label: 'Available',
    icon: Armchair,
    cardClass: 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md cursor-pointer group',
    iconClass: 'text-slate-400 group-hover:text-blue-500 transition-colors',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    description: 'Click to select this seat',
  },
  held: {
    label: 'On Hold',
    icon: Clock,
    cardClass: 'border-amber-200 bg-amber-50 cursor-not-allowed',
    iconClass: 'text-amber-400',
    badgeClass: 'bg-amber-100 text-amber-700',
    description: 'Reserved by another user',
  },
  reserved: {
    label: 'Reserved',
    icon: CheckCircle2,
    cardClass: 'border-slate-200 bg-slate-50 cursor-not-allowed',
    iconClass: 'text-slate-300',
    badgeClass: 'bg-slate-100 text-slate-500',
    description: 'This seat has been booked',
  },
};

function HoldTimer({ heldUntil, isOwner }: { heldUntil: string; isOwner: boolean }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(heldUntil).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(heldUntil).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [heldUntil]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining > 0 && remaining < 120;

  if (remaining === 0) {
    return <p className="mt-1 text-xs text-slate-400">Hold expiring…</p>;
  }

  return (
    <p className={`mt-1 text-xs font-medium ${isOwner ? (isUrgent ? 'text-red-500' : 'text-blue-600') : 'text-amber-600'}`}>
      {isOwner ? 'Hold expires in ' : 'Frees up in '}
      {minutes}:{seconds.toString().padStart(2, '0')}
    </p>
  );
}

export default function SeatCard({ seat, currentUserId, onSelect, disabled }: SeatCardProps) {
  const config = STATUS_CONFIG[seat.status];
  const Icon = config.icon;

  const isMyHold = seat.status === 'held' && seat.heldBy === currentUserId;

  const effectiveConfig = isMyHold
    ? {
        ...STATUS_CONFIG.available,
        label: 'Your Hold',
        description: 'Click to continue to checkout',
        cardClass: 'border-blue-300 bg-blue-50 hover:border-blue-500 hover:shadow-md cursor-pointer group',
        iconClass: 'text-blue-500',
        badgeClass: 'bg-blue-100 text-blue-700',
      }
    : config;

  const isClickable = seat.status === 'available' || isMyHold;

  function handleClick() {
    if (isClickable && !disabled) onSelect(seat);
  }

  return (
    <div
      role={isClickable ? 'button' : 'presentation'}
      tabIndex={isClickable && !disabled ? 0 : -1}
      aria-label={`Seat ${seat.number} — ${effectiveConfig.label}`}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className={`card flex flex-col items-center gap-4 p-8 transition-all ${effectiveConfig.cardClass}
                  ${disabled && isClickable ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div className="relative">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
            seat.status === 'available' || isMyHold ? 'bg-blue-50 group-hover:bg-blue-100' : 'bg-slate-100'
          } transition-colors`}
        >
          <Icon className={`h-8 w-8 ${effectiveConfig.iconClass}`} />
        </div>
        {seat.status === 'reserved' && (
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-400">
            <Lock className="h-3 w-3 text-white" />
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-2xl font-bold text-slate-800">Seat {seat.number}</p>
        <span
          className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${effectiveConfig.badgeClass}`}
        >
          {effectiveConfig.label}
        </span>
        <p className="mt-2 text-xs text-slate-500">{effectiveConfig.description}</p>

        {/* Show live countdown to the person who holds this seat */}
        {isMyHold && seat.heldUntil && (
          <HoldTimer heldUntil={seat.heldUntil} isOwner={true} />
        )}

        {/* Show countdown to other users so they know when it may free up */}
        {seat.status === 'held' && !isMyHold && seat.heldUntil && (
          <HoldTimer heldUntil={seat.heldUntil} isOwner={false} />
        )}
      </div>
    </div>
  );
}
