"use client";
import { useState, type ChangeEvent, type InputHTMLAttributes } from "react";

/** Drop-in for <input type="number"> in controlled forms: while the field is being edited the typed text is kept locally, so "-", "" or "1." can be typed
 *  without snapping to 0 (which silently flipped the sign of negative growth rates typed key by key). onChange fires only for a finite number
 *  (or "" when a placeholder marks the field optional); on blur the field shows the committed value again. */
export function NumInput({ value, onChange, onBlur, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & { value: number | string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input {...rest} type="number" value={draft ?? String(value)}
      onBlur={(e) => { setDraft(null); onBlur?.(e); }}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        setDraft(e.target.value);
        if ((e.target.value === "" && rest.placeholder !== undefined) || Number.isFinite(parseFloat(e.target.value))) onChange?.(e);
      }} />
  );
}
