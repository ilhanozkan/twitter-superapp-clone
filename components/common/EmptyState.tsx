import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  title,
  children,
  action,
}: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-sm px-8 py-12">
      <h2 className="text-[31px] font-extrabold leading-9 [overflow-wrap:anywhere]">
        {title}
      </h2>
      {children && <p className="mt-2 text-[15px] text-muted">{children}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}
