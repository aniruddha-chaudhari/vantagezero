import * as React from "react";

import { cn } from "@/lib/utils";

function Progress({ value = 0, className, indicatorClassName, ...props }: React.ComponentProps<"div"> & { value?: number; indicatorClassName?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)} {...props}>
      <div className={cn("h-full bg-primary transition-all", indicatorClassName)} style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export { Progress };
