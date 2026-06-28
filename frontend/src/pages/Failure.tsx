import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XCircle, RefreshCcw } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../api/client';
import { getApiError } from '../utils/error';

interface Booking {
  _id: string;
  status: string;
  paymentResult: { message: string } | null;
}

export default function FailurePage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const [reason, setReason] = useState('Payment was not successful.');

  useEffect(() => {
    api
      .get<{ booking: Booking }>(`/payments/booking/${bookingId}`)
      .then((res) => {
        if (res.data.booking.paymentResult?.message) {
          setReason(res.data.booking.paymentResult.message);
        }
      })
      .catch((err) => setReason(getApiError(err)));
  }, [bookingId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Navbar />

      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Payment Failed</h1>
          <p className="mt-2 text-slate-500">{reason}</p>

          <p className="mt-4 text-sm text-slate-400">
            The seat has been released and is available for others to book.
          </p>

          <button onClick={() => navigate('/')} className="btn-primary mt-8 gap-2">
            <RefreshCcw className="h-4 w-4" />
            Choose a different seat
          </button>
        </div>
      </main>
    </div>
  );
}
