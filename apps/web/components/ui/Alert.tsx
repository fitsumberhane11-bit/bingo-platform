import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import clsx from "clsx";

interface AlertProps {
  variant: "error" | "success" | "info";
  children: React.ReactNode;
}

const styles = {
  error: { wrap: "bg-red-50 text-red-800 border-red-200", Icon: AlertTriangle },
  success: { wrap: "bg-brand-50 text-brand-800 border-brand-200", Icon: CheckCircle2 },
  info: { wrap: "bg-slate-50 text-slate-700 border-slate-200", Icon: Info },
};

export function Alert({ variant, children }: AlertProps) {
  const { wrap, Icon } = styles[variant];
  return (
    <div className={clsx("flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm", wrap)} role="alert">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>{children}</div>
    </div>
  );
}
