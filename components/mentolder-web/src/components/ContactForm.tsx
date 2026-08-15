import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2, 'Name erforderlich'),
  email: z.string().email('Gültige E-Mail erforderlich'),
  phone: z.string().optional(),
  type: z.string().min(1, 'Bitte Anliegen wählen'),
  message: z.string().min(10, 'Nachricht zu kurz (min. 10 Zeichen)'),
  consent: z.literal(true, { message: 'Bitte Datenschutzhinweis bestätigen' }),
});

type FormValues = z.infer<typeof schema>;

const typeOptions = [
  { value: 'allgemein', label: 'Allgemeine Anfrage' },
  { value: 'erstgespraech', label: 'Kostenloses Erstgespräch' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'beratung', label: 'Beratung' },
  { value: 'support', label: 'Support / Bestandskunden' },
  { value: 'feedback', label: 'Feedback' },
] as const;

const FORMSPREE_ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT ?? '';
const FALLBACK_EMAIL = import.meta.env.VITE_CONTACT_EMAIL ?? 'mail@mentolder.de';

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'allgemein' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setResult(null);
    setFallbackUsed(false);

    try {
      if (!FORMSPREE_ENDPOINT) {
        // Dev-mode fallback: build a mailto: link so the user can still reach out.
        if (import.meta.env.DEV) {
          console.warn(
            '[mentolder-web] VITE_FORMSPREE_ENDPOINT is not set — falling back to mailto:. ' +
              'Set the variable in .env for production deployments.',
          );
        }
        const subject = encodeURIComponent(`[mentolder] ${values.type} von ${values.name}`);
        const body = encodeURIComponent(
          `${values.message}\n\n— ${values.name}\n${values.email}${values.phone ? `\n${values.phone}` : ''}`,
        );
        window.location.href = `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${body}`;
        setResult({
          success: true,
          message: 'E-Mail-Programm geöffnet — bitte senden Sie die Nachricht von dort ab.',
        });
        setFallbackUsed(true);
        return;
      }

      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(values),
      });

      if (res.ok) {
        setResult({ success: true, message: 'Danke! Ich melde mich innerhalb von 48 Stunden.' });
        reset();
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setResult({
          success: false,
          message: data.error ?? 'Senden fehlgeschlagen — bitte versuchen Sie es erneut.',
        });
      }
    } catch {
      setResult({
        success: false,
        message: 'Verbindung fehlgeschlagen — bitte prüfen Sie Ihre Internetverbindung.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="cf-form flex flex-col gap-[22px]" noValidate>
      <div className="cf-field flex flex-col gap-2">
        <label htmlFor="cf-type" className="cf-label">
          Anliegen
        </label>
        <select id="cf-type" {...register('type')} className="cf-input">
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.type && <p className="cf-err">{errors.type.message}</p>}
      </div>

      <div className="cf-field-row grid grid-cols-1 sm:grid-cols-2 gap-[22px]">
        <div className="cf-field flex flex-col gap-2">
          <label htmlFor="cf-name" className="cf-label">
            Name <span className="text-brass">*</span>
          </label>
          <input
            id="cf-name"
            type="text"
            autoComplete="name"
            placeholder="Vor- und Nachname"
            {...register('name')}
            className="cf-input"
          />
          {errors.name && <p className="cf-err">{errors.name.message}</p>}
        </div>
        <div className="cf-field flex flex-col gap-2">
          <label htmlFor="cf-email" className="cf-label">
            E-Mail <span className="text-brass">*</span>
          </label>
          <input
            id="cf-email"
            type="email"
            autoComplete="email"
            placeholder="name@beispiel.de"
            {...register('email')}
            className="cf-input"
          />
          {errors.email && <p className="cf-err">{errors.email.message}</p>}
        </div>
      </div>

      <div className="cf-field flex flex-col gap-2">
        <label htmlFor="cf-phone" className="cf-label">
          Telefon <span className="text-mute-2 text-[12px] font-sans normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="cf-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+49 ..."
          {...register('phone')}
          className="cf-input"
        />
      </div>

      <div className="cf-field flex flex-col gap-2">
        <label htmlFor="cf-message" className="cf-label">
          Nachricht <span className="text-brass">*</span>
        </label>
        <textarea
          id="cf-message"
          rows={5}
          placeholder="Worum geht es? In 2-3 Sätzen reicht für ein erstes Kennenlernen."
          {...register('message')}
          className="cf-input cf-textarea resize-y min-h-[100px] leading-[1.55]"
        />
        {errors.message && <p className="cf-err">{errors.message.message}</p>}
      </div>

      <div className="cf-field flex flex-row items-start gap-2">
        <input
          id="cf-consent"
          type="checkbox"
          {...register('consent')}
          className="mt-1 accent-[color:var(--brass)]"
        />
        <label htmlFor="cf-consent" className="text-[13px] text-mute leading-[1.5]">
          Ich habe die{' '}
          <a href="/datenschutz" className="border-b border-brass text-fg-soft hover:text-brass-2">
            Datenschutzerklärung
          </a>{' '}
          gelesen und stimme der Verarbeitung meiner Daten zur Bearbeitung der Anfrage zu.
        </label>
      </div>
      {errors.consent && <p className="cf-err">{errors.consent.message}</p>}

      <div className="cf-submit-area flex flex-wrap items-center justify-between gap-6">
        <button type="submit" disabled={submitting} className="cf-btn">
          {submitting ? 'Wird gesendet…' : 'Nachricht senden'}
        </button>
        <p className="cf-submit-note text-[13px] text-mute max-w-[38ch] leading-[1.5] m-0">
          Antwort innerhalb von 48 Stunden. Kein Verkaufsdruck, kein Newsletter.
        </p>
      </div>

      {result && (
        <div
          className={`cf-result p-4 text-[14px] leading-[1.55] rounded-lg ${
            result.success
              ? 'border'
              : 'border'
          }`}
          style={
            result.success
              ? {
                  background: 'oklch(0.80 0.06 160 / .1)',
                  color: 'oklch(0.80 0.06 160)',
                  borderColor: 'oklch(0.80 0.06 160 / .25)',
                }
              : {
                  background: 'oklch(0.62 0.18 22 / .1)',
                  color: 'oklch(0.75 0.12 22)',
                  borderColor: 'oklch(0.62 0.18 22 / .25)',
                }
          }
          role="status"
        >
          {result.message}
          {fallbackUsed && (
            <span className="block text-[12px] text-mute mt-1">
              Hinweis: Es wurde kein Formspree-Backend konfiguriert.
            </span>
          )}
        </div>
      )}

      <style>{`
        .cf-label {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--mute);
        }
        .cf-input {
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--line-2);
          padding: 10px 0 12px;
          font-family: var(--sans);
          font-size: 16px;
          color: var(--fg);
          outline: none;
          width: 100%;
          transition: border-color 200ms ease;
          -webkit-appearance: none;
          appearance: none;
        }
        .cf-input::placeholder { color: var(--mute-2); }
        .cf-input:focus { border-color: var(--brass); }
        select.cf-input {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238c96a3' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 4px center;
          padding-right: 24px;
          cursor: pointer;
        }
        .cf-err {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: oklch(0.75 0.12 22);
          margin: 0;
        }
        .cf-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: var(--brass);
          color: #1a130a;
          border: none;
          padding: 15px 28px;
          border-radius: 999px;
          font-family: var(--sans);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 200ms ease, transform 200ms ease;
        }
        .cf-btn:hover:not(:disabled) { background: var(--brass-2); transform: translateY(-1px); }
        .cf-btn:disabled { background: var(--ink-800); color: var(--mute); cursor: not-allowed; }
        @media (max-width: 640px) {
          .cf-field-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </form>
  );
}
