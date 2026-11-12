export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-10 max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-950">
        {title}
      </h1>
      <p className="mt-3 text-ink-500">{description}</p>
    </div>
  );
}
