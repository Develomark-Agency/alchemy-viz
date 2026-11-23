import { AlertDialog, AlertDialogBackdrop, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@ui-sdk/react/alert-dialog";
import { DialogBackdrop, DialogClose, DialogContent as DialogContentPart, DialogDescription as DialogDescriptionPart, Dialog as DialogPart, DialogTitle as DialogTitlePart, DialogTrigger } from "@ui-sdk/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { type ButtonSize, type ButtonVariant, buttonClass } from "./button.tsx";
import { cn } from "./cn.ts";
import { toast } from "./toast.tsx";
import { withClass } from "./with-class.ts";

export { DialogClose, DialogTrigger };

const backdrop = "fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0";
const content = "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-popup outline-none transition-[opacity,scale] duration-200 ease-out data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 motion-reduce:transition-none";

export function Dialog(props: ComponentProps<typeof DialogPart>) {
  return <DialogPart {...props} />;
}

/** The dialog's panel with its backdrop and a close button. */
export function DialogContent({ className, children, ...rest }: Omit<ComponentProps<typeof DialogContentPart>, "children"> & { children?: ReactNode }) {
  return (
    <>
      <DialogBackdrop className={backdrop} />
      <DialogContentPart {...rest} className={withClass(content, className)}>
        {children}
        <DialogClose aria-label="Close" className={cn(buttonClass("ghost", "icon-sm"), "absolute top-3 right-3")}>
          <X />
        </DialogClose>
      </DialogContentPart>
    </>
  );
}

export function DialogTitle({ className, ...rest }: ComponentProps<typeof DialogTitlePart>) {
  return <DialogTitlePart {...rest} className={withClass("px-5 pt-4 pr-12 text-[15px] font-semibold", className)} />;
}

export function DialogDescription({ className, ...rest }: ComponentProps<typeof DialogDescriptionPart>) {
  return <DialogDescriptionPart {...rest} className={withClass("px-5 pt-1 text-[13px] text-fg-muted", className)} />;
}

export function DialogBody({ children, className }: { children: ReactNode, className?: string }) {
  return <div className={cn("flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{children}</div>;
}

async function confirmSafely(onConfirm: () => unknown) {
  try {
    await onConfirm();
  } catch (error) {
    toast("That didn't work", { description: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * A button that asks before running a destructive action. The confirm
 * button stays pending while `onConfirm` runs.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  children,
  variant = "danger",
  size = "sm",
  trigger
}: {
  title: string,
  description?: ReactNode,
  confirmLabel?: string,
  onConfirm: () => unknown,
  children?: ReactNode,
  variant?: ButtonVariant,
  size?: ButtonSize,
  /** Replaces the default trigger button, e.g. with an icon button. */
  trigger?: ReactElement
}) {
  return (
    <AlertDialog>
      {trigger ? <AlertDialogTrigger render={trigger} /> : <AlertDialogTrigger className={buttonClass(variant, size)}>{children}</AlertDialogTrigger>}
      <AlertDialogBackdrop className={backdrop} />
      <AlertDialogContent className={cn(content, "w-[min(420px,calc(100vw-32px))]")}>
        <AlertDialogTitle className="px-5 pt-5 text-[15px] font-semibold">{title}</AlertDialogTitle>
        {description && <AlertDialogDescription className="px-5 pt-1.5 text-[13px] text-fg-muted">{description}</AlertDialogDescription>}
        <div className="flex justify-end gap-2 px-5 pt-5 pb-4">
          <AlertDialogClose className={buttonClass("default", "sm")}>Cancel</AlertDialogClose>
          <AlertDialogClose value="confirm" action={() => confirmSafely(onConfirm)} className={cn(buttonClass("danger", "sm"), "border-danger bg-danger text-white hover:bg-danger/90 hover:text-white data-pending:opacity-70")}>
            {confirmLabel}
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
