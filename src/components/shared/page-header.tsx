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
        <p className="mb-2 text-sm font-medium text-slate-500">{eyebrow}</p>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        {title}
      </h1>
      <p className="mt-2 text-slate-600">{description}</p>
    </div>
  );
}
