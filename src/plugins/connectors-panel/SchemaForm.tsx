// Minimal JSON Schema form. Supports the common primitive types found in
// Gradio / OpenAPI / MCP schemas. Not a general-purpose form generator — it
// covers what phase 3 needs (text, number, boolean, file, dropdown) and
// lets more exotic schemas fall back to a JSON textarea.
//
// The form is uncontrolled (raw form values kept in a ref); the caller gets
// the final object via `onChange(values)`. We don't try to validate against
// the schema — phase 9 will plug a Zod validator in.

import { useCallback, useRef, useState } from "react";

export interface SchemaFormProps {
  schema: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  initial?: Record<string, unknown>;
}

type PropSchema = {
  type?: string;
  title?: string;
  enum?: unknown[];
  format?: string;
  default?: unknown;
};

export function SchemaForm({ schema, onChange, initial }: SchemaFormProps) {
  const properties = (schema.properties as Record<string, PropSchema> | undefined) ?? {};
  const required = new Set((schema.required as string[] | undefined) ?? Object.keys(properties));
  const [values, setValues] = useState<Record<string, unknown>>(initial ?? {});
  const lastEmitted = useRef<Record<string, unknown> | null>(null);

  const set = useCallback(
    (name: string, v: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [name]: v };
        if (lastEmitted.current !== next) {
          lastEmitted.current = next;
          queueMicrotask(() => onChange(next));
        }
        return next;
      });
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      {Object.entries(properties).map(([name, prop]) => {
        const label = prop.title ?? name;
        const isRequired = required.has(name);
        if (prop.enum) {
          return (
            <Field key={name} label={label} required={isRequired}>
              <select
                value={String(values[name] ?? "")}
                onChange={(e) => set(name, e.target.value)}
                className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              >
                {prop.enum.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
            </Field>
          );
        }
        if (prop.type === "number" || prop.type === "integer") {
          return (
            <Field key={name} label={label} required={isRequired}>
              <input
                type="number"
                value={typeof values[name] === "number" ? (values[name] as number) : ""}
                onChange={(e) =>
                  set(name, e.target.value === "" ? undefined : Number(e.target.value))
                }
                className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </Field>
          );
        }
        if (prop.type === "boolean") {
          return (
            <Field key={name} label={label} required={isRequired}>
              <input
                type="checkbox"
                checked={Boolean(values[name])}
                onChange={(e) => set(name, e.target.checked)}
              />
            </Field>
          );
        }
        if (prop.type === "string" && prop.format === "uri-reference") {
          return (
            <Field key={name} label={label} required={isRequired}>
              <input
                type="text"
                placeholder="https://… or lilium-blob://…"
                value={String(values[name] ?? "")}
                onChange={(e) => set(name, e.target.value)}
                className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </Field>
          );
        }
        return (
          <Field key={name} label={label} required={isRequired}>
            <input
              type="text"
              value={String(values[name] ?? "")}
              onChange={(e) => set(name, e.target.value)}
              className="w-full rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </Field>
        );
      })}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-[var(--text-muted)]">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
