import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import SeatCard, { Seat } from '../components/SeatCard';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { getApiError } from '../utils/error';

const POLL_INTERVAL_MS = 3_000;

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  const fetchSeats = useCallback(async () => {
    try {
      const res = await api.get<{ seats: Seat[] }>('/seats');
      setSeats(res.data.seats);
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeats();
    const interval = setInterval(fetchSeats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchSeats]);

  async function handleSelectSeat(seat: Seat) {
    if (selecting) return;
    setSelecting(true);

    try {
      // The backend handles two cases transparently:
      // 1. User clicks their already-held seat → returns existing booking ID
      // 2. User clicks a different seat while holding another → releases old hold, grabs new one
      const res = await api.post<{ seat: Seat; bookingId: string }>(`/seats/${seat._id}/hold`);
      navigate(`/checkout/${res.data.bookingId}`);
    } catch (err) {
      toast.error(getApiError(err));
      await fetchSeats();
    } finally {
      setSelecting(false);
    }
  }

  const allReserved = seats.length > 0 && seats.every((s) => s.status === 'reserved');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-slate-900">Choose Your Seat</h2>
          <p className="mt-2 text-slate-500">
            Select an available seat to begin checkout.
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Selected seats are held for 2 minutes — after that they are released back for others
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          </div>
        ) : allReserved ? (
          <div className="card p-12 text-center">
            <p className="text-lg font-semibold text-slate-700">All seats have been reserved</p>
            <p className="mt-2 text-sm text-slate-500">Check back later for availability.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {seats.map((seat) => (
              <SeatCard
                key={seat._id}
                seat={seat}
                currentUserId={user!.id}
                onSelect={handleSelectSeat}
                disabled={selecting}
              />
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Seat availability refreshes every 3 seconds
        </p>
      </main>
    </div>
  );
}
