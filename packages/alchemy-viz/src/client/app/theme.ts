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

export function setTheme(choice: ThemeChoice) {
  if(choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {}
}

export function applyStoredTheme() {
  const choice = storedTheme();
  if(choice !== "system") document.documentElement.dataset.theme = choice;
}
