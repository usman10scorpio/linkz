import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Armchair, Home } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../api/client';

interface Booking {
  _id: string;
  amount: number;
  seatId: { number: number } | string;
  createdAt: string;
}

export default function SuccessPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);

  useEffect(() => {
    api
      .get<{ booking: Booking }>(`/payments/booking/${bookingId}`)
      .then((res) => setBooking(res.data.booking))
      .catch(() => navigate('/'));
  }, [bookingId, navigate]);

  const seatNumber = booking && typeof booking.seatId === 'object' ? booking.seatId.number : '?';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Navbar />

      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Booking Confirmed!</h1>
          <p className="mt-2 text-slate-500">Your seat has been successfully reserved.</p>

          {booking && (
            <div className="mt-8 rounded-xl border border-slate-100 bg-slate-50 p-5 text-left">
              <dl className="space-y-3">
                <div className="flex justify-between text-sm">
                  <dt className="flex items-center gap-1.5 text-slate-500">
                    <Armchair className="h-4 w-4" />
                    Seat
                  </dt>
                  <dd className="font-semibold text-slate-800">Seat {seatNumber}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Amount paid</dt>
                  <dd className="font-semibold text-slate-800">${(booking.amount / 100).toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Booking ID</dt>
                  <dd className="font-mono text-xs text-slate-500">{booking._id}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Date</dt>
                  <dd className="text-slate-800">{new Date(booking.createdAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          )}

          <button onClick={() => navigate('/')} className="btn-secondary mt-8 gap-2">
            <Home className="h-4 w-4" />
            Back to home
          </button>
        </div>
      </main>
    </div>
  );
}
