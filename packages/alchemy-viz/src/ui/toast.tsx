import { ToastAction, ToastClose, ToastDescription, Toast as ToastPart, ToastRegion, ToastTitle, toast } from "@ui-sdk/react/toast";
import { X } from "lucide-react";

export { toast };

/** Place once at the app root. Views call `toast("Saved")` from anywhere. */
export function Toaster() {
  return (
    <ToastRegion side="bottom" align="end">
      {() => (
        <ToastPart className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 pr-9 shadow-popup">
          <div className="min-w-0 flex-1">
            <ToastTitle className="block text-[13px] font-medium" />
            <ToastDescription className="mt-0.5 block text-xs text-fg-muted empty:hidden" />
          </div>
          <ToastAction className="h-7 shrink-0 rounded-md border border-line-strong px-2.5 text-xs font-medium hover:bg-hover empty:hidden" />
          <ToastClose aria-label="Dismiss" className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg">
            <X className="size-3" />
          </ToastClose>
        </ToastPart>
      )}
    </ToastRegion>
  );
}
