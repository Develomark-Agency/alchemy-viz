import { Link } from "@tanstack/react-router";
import { buttonClass, EmptyState } from "../../ui/index.ts";

export function NotFound() {
  return (
    <EmptyState title="Page not found" action={<Link to="/" className={buttonClass()}>Back to overview</Link>}>
      Nothing lives at this address.
    </EmptyState>
  );
}
