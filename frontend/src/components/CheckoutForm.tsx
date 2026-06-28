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

type FormErrors = Partial<Record<keyof CardData, string>>;

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatCardNumber(value: string, isAmex: boolean): string {
  const digits = value.replace(/\D/g, '').slice(0, isAmex ? 15 : 16);
  if (isAmex) {
    // Amex pattern: 4-6-5
    return digits
      .replace(/^(\d{4})(\d{1,6})?(\d{1,5})?$/, (_m, a, b, c) =>
        [a, b, c].filter(Boolean).join(' '),
      )
      .trim();
  }
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length === 2 && value.endsWith('/')) return `${digits}/`;
  return digits;
}

// ─── Card brand detection ─────────────────────────────────────────────────────

type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | '';

function getCardBrand(number: string): CardBrand {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  return '';
}

// ─── Luhn algorithm ───────────────────────────────────────────────────────────
// Catches completely invalid card numbers before they reach the mock gateway.

function luhnCheck(number: string): boolean {
  const digits = number.replace(/\s/g, '');
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// ─── Expiry validation ────────────────────────────────────────────────────────

function isExpiryValid(expiry: string): boolean {
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) return false;
  const [month, year] = expiry.split('/').map(Number);
  const now = new Date();
  const expiryDate = new Date(2000 + year, month); // first day of month AFTER expiry
  return expiryDate > now;
}

// ─── Name validation ──────────────────────────────────────────────────────────

function isNameValid(name: string): { ok: boolean; message: string } {
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, message: 'Enter the cardholder name' };
  if (!/^[a-zA-Z\s'\-\.]+$/.test(trimmed))
    return { ok: false, message: 'Name must contain letters only' };
  if (trimmed.split(/\s+/).filter(Boolean).length < 2)
    return { ok: false, message: 'Enter first and last name' };
  if (trimmed.length > 60) return { ok: false, message: 'Name is too long' };
  return { ok: true, message: '' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CheckoutForm({ amount, onSubmit, loading }: CheckoutFormProps) {
  const [card, setCard] = useState<CardData>({
    cardNumber: '',
    expiry: '',
    cvv: '',
    cardholderName: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof CardData, boolean>>>({});

  const brand = getCardBrand(card.cardNumber);
  const isAmex = brand === 'Amex';
  const expectedCvvLength = isAmex ? 4 : 3;

  function clearError(field: keyof CardData) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateField(field: keyof CardData, value: string): string {
    switch (field) {
      case 'cardholderName': {
        const result = isNameValid(value);
        return result.ok ? '' : result.message;
      }
      case 'cardNumber': {
        const raw = value.replace(/\s/g, '');
        const expectedLength = isAmex ? 15 : 16;
        if (raw.length !== expectedLength)
          return `Enter a valid ${expectedLength}-digit card number`;
        if (!luhnCheck(raw)) return 'Card number is invalid';
        return '';
      }
      case 'expiry': {
        if (!isExpiryValid(value)) {
          if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value)) return 'Enter a valid expiry (MM/YY)';
          return 'This card has expired';
        }
        return '';
      }
      case 'cvv': {
        if (!new RegExp(`^\\d{${expectedCvvLength}}$`).test(value))
          return `CVV must be ${expectedCvvLength} digits${isAmex ? ' for Amex' : ''}`;
        return '';
      }
    }
  }

  function handleBlur(field: keyof CardData) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const msg = validateField(field, card[field]);
    setErrors((prev) => ({ ...prev, [field]: msg || undefined }));
  }

  function validate(): boolean {
    const fields: (keyof CardData)[] = ['cardholderName', 'cardNumber', 'expiry', 'cvv'];
    const newErrors: FormErrors = {};
    fields.forEach((f) => {
      const msg = validateField(f, card[f]);
      if (msg) newErrors[f] = msg;
    });
    setErrors(newErrors);
    setTouched({ cardholderName: true, cardNumber: true, expiry: true, cvv: true });
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(card);
  }

  function inputClass(field: keyof CardData) {
    return `input-base ${
      touched[field] && errors[field]
        ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
        : touched[field] && !errors[field]
          ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-400/20'
          : ''
    }`;
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
          onChange={(e) => {
            setCard((p) => ({ ...p, cardholderName: e.target.value }));
            clearError('cardholderName');
          }}
          onBlur={() => handleBlur('cardholderName')}
          className={inputClass('cardholderName')}
        />
        {touched.cardholderName && errors.cardholderName && (
          <p className="mt-1 text-xs text-red-500">{errors.cardholderName}</p>
        )}
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
            placeholder={isAmex ? '3782 822463 10005' : '1234 5678 9012 3456'}
            value={card.cardNumber}
            onChange={(e) => {
              const formatted = formatCardNumber(e.target.value, getCardBrand(e.target.value) === 'Amex');
              setCard((p) => ({ ...p, cardNumber: formatted }));
              clearError('cardNumber');
            }}
            onBlur={() => handleBlur('cardNumber')}
            className={`${inputClass('cardNumber')} pl-10 pr-16`}
          />
          {brand && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {brand}
            </span>
          )}
        </div>
        {touched.cardNumber && errors.cardNumber && (
          <p className="mt-1 text-xs text-red-500">{errors.cardNumber}</p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          Use card ending 0000 to test a decline, 1111 for insufficient funds
        </p>
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
              onChange={(e) => {
                setCard((p) => ({ ...p, expiry: formatExpiry(e.target.value) }));
                clearError('expiry');
              }}
              onBlur={() => handleBlur('expiry')}
              className={`${inputClass('expiry')} pl-10`}
            />
          </div>
          {touched.expiry && errors.expiry && (
            <p className="mt-1 text-xs text-red-500">{errors.expiry}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            CVV {isAmex && <span className="font-normal text-slate-400">(4 digits)</span>}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder={isAmex ? '1234' : '123'}
              maxLength={expectedCvvLength}
              value={card.cvv}
              onChange={(e) => {
                setCard((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, '') }));
                clearError('cvv');
              }}
              onBlur={() => handleBlur('cvv')}
              className={`${inputClass('cvv')} pl-10`}
            />
          </div>
          {touched.cvv && errors.cvv && (
            <p className="mt-1 text-xs text-red-500">{errors.cvv}</p>
          )}
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
