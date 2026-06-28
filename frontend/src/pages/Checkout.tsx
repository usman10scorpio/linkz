import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Armchair } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import CheckoutForm, { CardData } from '../components/CheckoutForm';
import api from '../api/client';
import { getApiError } from '../utils/error';

interface Booking {
  _id: string;
  status: string;
  amount: number;
  seatId: { _id: string; number: number; heldUntil: string | null } | string;
}

function useCountdown(targetDate: Date | null): number {
  const [remaining, setRemaining] = useState<number>(() =>
    targetDate ? Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!targetDate) return;
    const update = () =>
      setRemaining(Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return remaining;
}

export default function CheckoutPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [holdExpiry, setHoldExpiry] = useState<Date | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(true);
  const [paying, setPaying] = useState(false);

  // Only redirect on expiry after the countdown has actually been ticking —
  // prevents a false redirect on initial render when countdown is still 0.
  const countdownStartedRef = useRef(false);

  const countdown = useCountdown(holdExpiry);

  const fetchBooking = useCallback(async () => {
    try {
      const res = await api.get<{ booking: Booking }>(`/payments/booking/${bookingId}`);
      const b = res.data.booking;

      if (b.status === 'completed') {
        navigate(`/success/${bookingId}`, { replace: true });
        return;
      }
      if (b.status === 'failed' || b.status === 'expired') {
        navigate(`/failure/${bookingId}`, { replace: true });
        return;
      }

      setBooking(b);

      // Get heldUntil from the booking's own populated seat — not from a separate
      // seat list call, which could return another user's seat by mistake.
      if (typeof b.seatId === 'object' && b.seatId.heldUntil) {
        setHoldExpiry(new Date(b.seatId.heldUntil));
      }
    } catch (err) {
      toast.error(getApiError(err));
      navigate('/');
    } finally {
      setLoadingBooking(false);
    }
  }, [bookingId, navigate]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  // Track when the countdown is actively ticking so we don't fire a false redirect
  // on mount (countdown initialises to 0 before holdExpiry is loaded).
  useEffect(() => {
    if (countdown > 0) {
      countdownStartedRef.current = true;
    }
  }, [countdown]);

  useEffect(() => {
    if (countdown === 0 && holdExpiry && countdownStartedRef.current) {
      toast.error('Your seat hold expired. Please choose again.');
      navigate('/');
    }
  }, [countdown, holdExpiry, navigate]);

  async function handlePayment(card: CardData) {
    if (!booking) return;
    setPaying(true);

    try {
      const res = await api.post<{ success: boolean; booking: { id: string } }>('/payments/process', {
        bookingId: booking._id,
        card,
      });

      if (res.data.success) {
        navigate(`/success/${res.data.booking.id}`);
      } else {
        navigate(`/failure/${res.data.booking.id}`);
      }
    } catch (err) {
      const msg = getApiError(err);
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('no longer valid')) {
        toast.error(msg);
        navigate('/');
      } else {
        toast.error(msg);
      }
    } finally {
      setPaying(false);
    }
  }

  if (loadingBooking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Navbar />
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const seatNumber = typeof booking.seatId === 'object' ? booking.seatId.number : '?';
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const isUrgent = countdown > 0 && countdown < 120;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Navbar />

      <main className="mx-auto max-w-xl px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to seats
        </button>

        <div className="card overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-100 bg-slate-50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
                  <Armchair className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Seat {seatNumber}</p>
                  <p className="text-sm text-slate-500">${(booking.amount / 100).toFixed(2)} reservation fee</p>
                </div>
              </div>

              {holdExpiry && countdown > 0 && (
                <div
                  className={`flex flex-col items-end rounded-lg px-3 py-1.5 text-right
                    ${isUrgent ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Clock className="h-4 w-4" />
                    {minutes}:{seconds.toString().padStart(2, '0')}
                  </div>
                  <span className="text-xs opacity-75">Hold expires</span>
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="p-6">
            <h2 className="mb-5 text-lg font-semibold text-slate-800">Payment details</h2>
            <CheckoutForm amount={booking.amount} onSubmit={handlePayment} loading={paying} />
          </div>
        </div>
      </main>
    </div>
  );
}
