interface Props {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: Props) {
  return (
    <div className="mb-6 rounded-xl border border-border/80 bg-card/70 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.16)] backdrop-blur-sm">
      <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{title}</h1>
      {subtitle && (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
