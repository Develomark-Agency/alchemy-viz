export type ThemeChoice = "system" | "light" | "dark";

const KEY = "alchemy-viz:theme";

export function storedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  if(choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {}
}

/**
 * Switches the theme in one view transition, revealed from `origin` (the
 * button that asked for it). `update` runs inside the transition, so state
 * it sets (the menu's icon) lands in the same frame as the colors.
 */
export function setTheme(choice: ThemeChoice, options: { origin?: { x: number, y: number }, update?: () => void } = {}) {
  function run() {
    apply(choice);
    options.update?.();
  }
  const root = document.documentElement;
  if(!document.startViewTransition) return run();

  const { x, y } = options.origin ?? { x: innerWidth, y: 0 };
  root.style.setProperty("--theme-x", `${x}px`);
  root.style.setProperty("--theme-y", `${y}px`);
  root.style.setProperty("--theme-r", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  root.classList.add("theme-switching");
  const transition = document.startViewTransition(run);
  transition.finished.finally(() => root.classList.remove("theme-switching"));
}

export function applyStoredTheme() {
  const choice = storedTheme();
  if(choice !== "system") document.documentElement.dataset.theme = choice;
}
