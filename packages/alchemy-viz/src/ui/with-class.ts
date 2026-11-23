import { cn } from "cn";

type ClassName<S> = string | ((state: S) => string | undefined) | undefined;

/**
 * Merges a base class with a part's `className`, which ui-sdk lets be a
 * function of the part's state.
 */
export function withClass<S>(base: string, className: ClassName<S>): string | ((state: S) => string) {
  if(typeof className === "function") return (state: S) => cn(base, className(state));
  return cn(base, className);
}
