"use client";

import { useRef, useState } from "react";
import { Package, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Plain <img>, not next/image: these are hotlinked straight from the distributor's own
 * CDN (never cached or rehosted, per the limitations disclosure), so there's no local
 * asset for Next's optimizer to process.
 */
export function ComponentImage({
  src,
  alt,
  className,
  expandable = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  expandable?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const showFallback = !src || failed;
  const canExpand = expandable && !showFallback;

  return (
    <>
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-secondary",
          canExpand && "cursor-zoom-in",
          className,
        )}
        onClick={canExpand ? () => dialogRef.current?.showModal() : undefined}
        role={canExpand ? "button" : undefined}
        aria-label={canExpand ? `View full image of ${alt}` : undefined}
      >
        {showFallback ? (
          <Package className="size-5 text-muted-foreground" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="size-full object-contain p-1" onError={() => setFailed(true)} />
        )}
      </div>

      {canExpand && (
        <dialog
          ref={dialogRef}
          onClick={(e) => {
            if (e.target === dialogRef.current) dialogRef.current?.close();
          }}
          className="m-auto max-h-[85vh] max-w-[85vw] rounded-lg border bg-background p-0 backdrop:bg-background/80"
        >
          <div className="relative flex max-h-[85vh] max-w-[85vw] items-center justify-center p-6">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src ?? undefined} alt={alt} className="max-h-[70vh] max-w-[75vw] object-contain" />
          </div>
        </dialog>
      )}
    </>
  );
}
