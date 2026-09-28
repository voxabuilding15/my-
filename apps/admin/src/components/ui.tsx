import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={cx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-strong',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-canvas',
        variant === 'danger' && 'bg-bad text-white hover:opacity-90',
        variant === 'ghost' && 'text-muted hover:bg-canvas hover:text-ink',
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

const fieldClass =
  'h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand disabled:opacity-60';

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cx(fieldClass, className)} />
);

export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cx(fieldClass, 'pr-8', className)} />
);

export const Textarea = ({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={cx(fieldClass, 'h-auto min-h-24 py-2 font-mono', className)} />
);

export function Field({
  label,
  hint,
  children,
}: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Card({
  title,
  actions,
  className,
  children,
}: PropsWithChildren<{ title?: string; actions?: ReactNode; className?: string }>) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface p-4 md:p-5', className)}>
      {title || actions ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | undefined;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div
        className={cx(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'bad' && 'text-bad',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: PropsWithChildren<{ tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' }>) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-canvas text-muted',
        tone === 'brand' && 'bg-brand-subtle text-brand',
        tone === 'ok' && 'bg-ok-subtle text-ok',
        tone === 'warn' && 'bg-warn-subtle text-warn',
        tone === 'bad' && 'bg-bad-subtle text-bad',
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
    <Loader2 className="size-4 animate-spin" aria-hidden /> {label}…
  </div>
);

export const EmptyState = ({ children }: PropsWithChildren) => (
  <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted">
    <Inbox className="size-6" aria-hidden />
    {children}
  </div>
);

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const forbidden = (error as { forbidden?: boolean })?.forbidden;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-bad/30 bg-bad-subtle p-6 text-center text-sm"
    >
      <AlertTriangle className="size-5 text-bad" aria-hidden />
      <p>
        {forbidden
          ? 'Your role does not have access to this.'
          : ((error as Error)?.message ?? 'Something went wrong')}
      </p>
      {onRetry && !forbidden ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Data table that scrolls horizontally on tablets instead of squashing columns. */
export function Table({ head, children }: PropsWithChildren<{ head: ReactNode[] }>) {
  return (
    <div className="-mx-4 overflow-x-auto md:mx-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted uppercase">
          <tr>
            {head.map((cell, i) => (
              <th key={i} scope="col" className="px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: PropsWithChildren<{ className?: string }>) => (
  <td className={cx('px-3 py-2.5 align-top', className)}>{children}</td>
);

/** Modal built on <dialog>: focus trapping and Escape handling come from the browser. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: PropsWithChildren<{ open: boolean; title: string; onClose: () => void; footer?: ReactNode }>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    >
      {open ? (
        <div className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">{title}</h2>
          {children}
          {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export { cx };
