export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-4">
      <div>
        <p className="eyebrow mb-1">{eyebrow}</p>
        <h1 className="text-[20px] font-bold leading-tight tracking-[-.01em] m-0">{title}</h1>
        {description && (
          <p className="text-[12px] text-[var(--ink-3)] mt-1 max-w-[80ch] leading-relaxed m-0">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
