export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 max-w-2xl min-w-0 sm:mb-8">
      {eyebrow ? (
        <p className="text-caption text-accent-ink mb-2 font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-title text-ink tracking-tight text-balance">
        {title}
      </h1>
      <p className="text-body text-ink-muted mt-2 text-pretty">{description}</p>
    </div>
  );
}
