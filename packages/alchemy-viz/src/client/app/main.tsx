import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "../../ui/index.ts";
import "./app.css";
import { bootstrap, warmModules } from "./bootstrap.ts";
import { ProviderTooltip } from "./providers.tsx";
import { router } from "./router.tsx";
import { applyStoredTheme } from "./theme.ts";

applyStoredTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2_000, retry: 1, refetchOnWindowFocus: true }
  }
});

// Render once what the first paint needs has arrived (see bootstrap.ts).
void bootstrap(queryClient).then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ProviderTooltip />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>
  );
  warmModules(queryClient);
});
