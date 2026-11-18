/** Skeleton shown instantly while a page loads its data. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="-mx-4 mb-4 flex h-[62px] items-center gap-6 border-b px-4 md:-mx-6 md:px-6">
        <div className="h-5 w-40 rounded-md bg-muted" />
        <div className="hidden h-4 w-64 rounded-md bg-muted md:block" />
        <div className="ml-auto h-9 w-32 rounded-md bg-muted" />
      </div>
      <div className="mb-3 flex gap-2">
        <div className="h-9 w-64 rounded-md bg-muted" />
        <div className="h-9 w-24 rounded-md bg-muted" />
        <div className="h-9 w-24 rounded-md bg-muted" />
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="h-10 border-b" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-12 items-center gap-6 border-b px-4">
            <div className="h-3.5 w-1/4 rounded bg-muted" />
            <div className="h-3.5 w-1/6 rounded bg-muted" />
            <div className="h-3.5 w-1/5 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
