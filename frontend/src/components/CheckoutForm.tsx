import React, { useState } from 'react';
import { CreditCard, Lock, Calendar, Shield } from 'lucide-react';

interface CheckoutFormProps {
  amount: number;
  onSubmit: (card: CardData) => Promise<void>;
  loading: boolean;
}

export interface CardData {
  cardNumber: string;
  expiry: string;
  cvv: string;
  cardholderName: string;
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

function getCardBrand(number: string): string {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^5[1-5]/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  return '';
}

export default function CheckoutForm({ amount, onSubmit, loading }: CheckoutFormProps) {
  const [card, setCard] = useState<CardData>({
    cardNumber: '',
    expiry: '',
    cvv: '',
    cardholderName: '',
  });
  const [errors, setErrors] = useState<Partial<CardData>>({});

  const brand = getCardBrand(card.cardNumber);

  function validate(): boolean {
    const newErrors: Partial<CardData> = {};
    const rawNumber = card.cardNumber.replace(/\s/g, '');

    if (rawNumber.length !== 16) newErrors.cardNumber = 'Enter a valid 16-digit card number';
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) newErrors.expiry = 'Enter a valid expiry (MM/YY)';
    if (!/^\d{3,4}$/.test(card.cvv)) newErrors.cvv = 'Enter a valid CVV';
    if (card.cardholderName.trim().length < 2) newErrors.cardholderName = 'Enter the cardholder name';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(card);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Cardholder name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Cardholder name</label>
        <input
          type="text"
          autoComplete="cc-name"
          placeholder="Jane Smith"
          value={card.cardholderName}
          onChange={(e) => setCard((p) => ({ ...p, cardholderName: e.target.value }))}
          className={`input-base ${errors.cardholderName ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
        />
        {errors.cardholderName && <p className="mt-1 text-xs text-red-500">{errors.cardholderName}</p>}
      </div>

      {/* Card number */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Card number</label>
        <div className="relative">
          <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            value={card.cardNumber}
            onChange={(e) => setCard((p) => ({ ...p, cardNumber: formatCardNumber(e.target.value) }))}
            className={`input-base pl-10 pr-16 ${errors.cardNumber ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
          />
          {brand && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {brand}
            </span>
          )}
        </div>
        {errors.cardNumber && <p className="mt-1 text-xs text-red-500">{errors.cardNumber}</p>}
        <p className="mt-1 text-xs text-slate-400">Use card ending 0000 to test a decline, 1111 for insufficient funds</p>
      </div>

      {/* Expiry + CVV */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Expiry</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={card.expiry}
              onChange={(e) => setCard((p) => ({ ...p, expiry: formatExpiry(e.target.value) }))}
              className={`input-base pl-10 ${errors.expiry ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
            />
          </div>
          {errors.expiry && <p className="mt-1 text-xs text-red-500">{errors.expiry}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">CVV</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              maxLength={4}
              value={card.cvv}
              onChange={(e) => setCard((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, '') }))}
              className={`input-base pl-10 ${errors.cvv ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}`}
            />
          </div>
          {errors.cvv && <p className="mt-1 text-xs text-red-500">{errors.cvv}</p>}
        </div>
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button type="submit" disabled={loading} className="btn-primary w-full gap-2 py-3 text-base">
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Processing payment…
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <Shield className="h-3.5 w-3.5" />
        <span>Payments are simulated. No real charge will occur.</span>
      </div>
    </form>
  );
}
