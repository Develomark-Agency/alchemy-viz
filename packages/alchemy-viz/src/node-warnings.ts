/**
 * Node flags `node:sqlite` as experimental and prints a warning the first
 * time it loads. alchemy-viz only reads workerd's files with it, so the
 * warning is noise; every other warning still prints.
 */
const emitWarning = process.emitWarning;

process.emitWarning = function(warning: string | Error, ...rest: unknown[]) {
  const message = typeof warning === "string" ? warning : warning.message;
  if(message.startsWith("SQLite is an experimental feature")) return;
  return (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest);
} as typeof process.emitWarning;
