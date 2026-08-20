export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <p className="eyebrow mb-1.5">{eyebrow}</p>
        <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight m-0">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--muted)] mt-1.5 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
