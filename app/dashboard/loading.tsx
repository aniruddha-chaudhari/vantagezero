function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Pulse className="h-3 w-24" />
          <Pulse className="h-9 w-56" />
          <Pulse className="h-4 w-96 max-w-full" />
        </div>
        <Pulse className="h-9 w-28" />
      </div>

      <div className="grid grid-cols-2 divide-x divide-y rounded-xl border lg:grid-cols-4 lg:divide-y-0">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 p-4 sm:p-5">
            <Pulse className="h-3 w-20" />
            <Pulse className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-4 rounded-xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <Pulse className="h-5 w-32" />
              <Pulse className="h-5 w-9" />
            </div>
            <Pulse className="h-9 w-40" />
            <Pulse className="h-2 w-full" />
            <Pulse className="h-3 w-full" />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border p-5">
        <Pulse className="h-4 w-56" />
        {Array.from({ length: 3 }, (_, i) => (
          <Pulse key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
