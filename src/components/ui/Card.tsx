import type { ReactNode } from "react";

/**
 * Surface primitives. Depth comes from token steps and hairline borders only —
 * no shadows, no gradients (§6).
 */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface ${className}`.trim()}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  action,
  description,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-[13px] font-medium tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-4 ${className}`.trim()}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Honest placeholder for modules not yet built. States plainly that there's no
 * data path yet — better than a fake chart that implies the feature works.
 */
export function ModulePlaceholder({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-sm text-muted">Not built yet.</p>
          {note ? (
            <p className="mx-auto mt-2 max-w-md text-xs text-faint">{note}</p>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
