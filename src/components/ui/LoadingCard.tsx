import { Card, CardBody } from "@/components/ui/Card";

/**
 * Skeleton shown while a screen's data loads (polish pass 2/3).
 *
 * A shimmering shape reads as "almost there"; the word "Loading…" reads as a
 * stall. Same wait, different feeling — and the shapes stop the layout jumping
 * when the real content lands.
 */
export function LoadingCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card aria-busy="true" aria-live="polite">
      <CardBody className="space-y-3">
        <div className="h-3 w-1/3 animate-pulse rounded bg-raise" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div
              className="h-3 animate-pulse rounded bg-raise"
              style={{ width: `${55 - i * 8}%` }}
            />
            <div className="h-3 w-16 animate-pulse rounded bg-raise" />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
