import { Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { Banner, EmptyState, Loading } from "../../ui/index.ts";
import { CommandPalette } from "./command-palette.tsx";
import { TopBar } from "./top-bar.tsx";
import { StageContext, useStack } from "./use-stack.ts";

export function Shell() {
  const [stage, setStage] = useState<string>();
  return (
    <StageContext.Provider value={{ stage, setStage }}>
      <Layout />
    </StageContext.Provider>
  );
}

function Layout() {
  const stack = useStack();
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <TopBar onSearch={() => setPaletteOpen(true)} />
      <main className="min-w-0 px-4 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
          {stack.data && stack.error && <Banner tone="warn">Lost contact with the stack state: {stack.error.message}</Banner>}
          {stack.data
            ? <Outlet />
            : stack.error
              ? <EmptyState title="Couldn't read the stack">{stack.error.message}</EmptyState>
              : <Loading label="Reading stack state…" />}
        </div>
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
