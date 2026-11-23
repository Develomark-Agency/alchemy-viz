import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useState
} from "react";
import { Spinner } from "./feedback.tsx";

function cx(...c: Array<string | false | undefined>) {
  return c.filter(Boolean).join(" ");
}

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant,
  size?: "md" | "sm",
  loading?: boolean
}

export function Button({ variant = "default", size = "md", loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx("av-button", variant !== "default" && `av-button-${variant}`, size === "sm" && "av-button-sm", className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** A link styled as a button (e.g. "Open in Cloudflare"). */
export function LinkButton({
  href,
  children,
  variant = "default",
  size = "md",
  external = true
}: {
  href: string,
  children: ReactNode,
  variant?: ButtonVariant,
  size?: "md" | "sm",
  external?: boolean
}) {
  return (
    <a
      href={href}
      className={cx("av-button", variant !== "default" && `av-button-${variant}`, size === "sm" && "av-button-sm")}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
      {external && <span aria-hidden>↗</span>}
    </a>
  );
}

/**
 * Runs an async action with a pending state. With `confirm`, the first
 * click arms the button and a second click within a few seconds runs it.
 */
export function ActionButton({
  onAction,
  confirm,
  children,
  variant,
  size,
  disabled
}: {
  onAction: () => unknown | Promise<unknown>,
  /** Label shown while armed, e.g. "Click again to delete". `true` uses "Confirm?". */
  confirm?: boolean | string,
  children: ReactNode,
  variant?: ButtonVariant,
  size?: "md" | "sm",
  disabled?: boolean
}) {
  const [pending, setPending] = useState(false);
  const [armed, setArmed] = useState(false);
  async function run() {
    if(confirm && !armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    setPending(true);
    try {
      await onAction();
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant={armed ? "danger" : variant} size={size} loading={pending} disabled={disabled} onClick={run}>
      {armed ? (typeof confirm === "string" ? confirm : "Confirm?") : children}
    </Button>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...rest} className={cx("av-input", className)} />
  );
}

export function Select({
  options,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: Array<string | { value: string, label: ReactNode }> }) {
  return (
    <select {...rest} className={cx("av-select", className)}>
      {options.map(o => typeof o === "string" ? (
        <option key={o} value={o}>
          {o}
        </option>
      ) : (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      )
      )}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...rest} className={cx("av-textarea", className)} />
  );
}

/** A labelled form field. */
export function Field({ label, children, hint }: { label: ReactNode, children: ReactNode, hint?: ReactNode }) {
  return (
  // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the control is passed as children
    <label className="av-field">
      {label}
      {children}
      {hint && <span className="av-muted" style={{ fontWeight: 400 }}>{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean,
  onChange: (checked: boolean) => void,
  disabled?: boolean,
  label?: string
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      className="av-toggle"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
    />
  );
}

/**
 * Monospace editor for SQL, JSON and similar. Cmd/Ctrl+Enter calls
 * `onSubmit`; Tab inserts two spaces.
 */
export function CodeEditor({
  value,
  onChange,
  onSubmit,
  rows = 6,
  placeholder,
  readOnly
}: {
  value: string,
  onChange?: (value: string) => void,
  onSubmit?: () => void,
  rows?: number,
  placeholder?: string,
  readOnly?: boolean
}) {
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if(e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    } else if(e.key === "Tab" && !e.shiftKey && onChange) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: end } = el;
      onChange(value.slice(0, s) + "  " + value.slice(end));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  }
  return (
    <Textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck={false}
      onChange={e => onChange?.(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
