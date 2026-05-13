"use client";

import { FormEvent, useState } from "react";

export type ContactFormData = {
  name: string;
  phone: string;
  email: string;
};

export default function ContactInlineForm({
  onSubmit,
  isLoading,
  error,
}: {
  onSubmit: (data: ContactFormData) => void;
  isLoading: boolean;
  error?: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() });
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 disabled:opacity-50";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm"
    >
      <p className="mb-3 font-semibold text-slate-800">Complete your booking:</p>
      <div className="space-y-2">
        <input
          required
          type="text"
          placeholder="Full name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <input
          required
          type="tel"
          placeholder="Phone number *"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isLoading || !name.trim() || !phone.trim()}
          className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {isLoading ? "Confirming…" : "Confirm Booking"}
        </button>
        {error && (
          <p className="text-xs font-medium text-red-600">{error}</p>
        )}
      </div>
    </form>
  );
}
