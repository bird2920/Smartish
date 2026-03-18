import React, { useEffect } from "react";

export default function ReferralModal({ isOpen, onClose, source }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !source) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={() => onClose?.()}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-xl rounded-3xl bg-white text-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-modal-title"
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-400 to-indigo-500" />
        <button
          type="button"
          onClick={() => onClose?.()}
          className="absolute right-3 top-3 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Close"
        >
          <span aria-hidden="true">X</span>
        </button>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-600">
              {source.eyebrow}
            </p>
            <h2 id="referral-modal-title" className="text-2xl font-black text-slate-950">
              {source.title}
            </h2>
          </div>
          <div className="space-y-3 text-slate-700">
            <p className="font-semibold">{source.intro}</p>
            {source.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-3 text-base font-black text-slate-950 shadow-lg shadow-amber-200/70 transition hover:scale-[1.01]"
            >
              {source.primaryCta}
            </button>
            <a
              href={source.secondaryHref}
              target="_blank"
              rel="noreferrer noopener"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm transition hover:border-amber-200 hover:text-amber-700 hover:shadow"
            >
              {source.secondaryCta}
            </a>
          </div>
          <p className="pt-1 text-xs text-slate-500">{source.footer}</p>
        </div>
      </div>
    </div>
  );
}
