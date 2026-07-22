"use client";

import { useState } from "react";

import { createRecord } from "@/app/actions/records";
import { AmountInput } from "@/components/ui/AmountInput";
import { Field, SlideOver, inputClass } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { RECORD_TYPES, type RecordKind } from "@/lib/records";

/**
 * One sheet for adding any kind of record, built from the registry.
 *
 * A bespoke form per table would drift: the day a column is added, five forms
 * need finding. Here the fields are declared once in records.ts and both the
 * form and the server validation read the same declaration.
 */
export function RecordEditor({
  open,
  onClose,
  onSaved,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  kind: RecordKind;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = RECORD_TYPES[kind];

  async function onSubmit(formData: FormData) {
    setSaving(true);
    setError(null);

    const input: Record<string, unknown> = {};
    for (const field of type.fields) input[field.name] = formData.get(field.name);

    const result = await createRecord(kind, input);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    onSaved();
    toast.show({ message: `${result.data.label} added`, tone: "success" });
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={`Add ${type.noun === "account" ? "an" : "a"} ${type.noun}`}
      description="It appears everywhere the app uses this list, straight away."
      footer={
        <button
          type="submit"
          form="record-form"
          disabled={saving}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : `Add ${type.noun}`}
        </button>
      }
    >
      <form action={onSubmit} id="record-form">
        {type.fields.map((field) => (
          <Field key={field.name} label={field.label} hint={field.hint}>
            {field.kind === "select" ? (
              <select
                name={field.name}
                className={inputClass}
                required={field.required}
                defaultValue={field.options?.[0] ?? ""}
              >
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.kind === "currency" ? (
              <AmountInput
                name={field.name}
                required={field.required}
                placeholder={field.placeholder ?? "0,00"}
              />
            ) : (
              <input
                name={field.name}
                type="text"
                autoComplete="off"
                required={field.required}
                className={inputClass}
                placeholder={field.placeholder}
              />
            )}
          </Field>
        ))}

        {error ? <p className="mt-1 text-xs text-loss">{error}</p> : null}
      </form>
    </SlideOver>
  );
}
