/** Minimal structured JSON logger (one line per event, stdout/stderr). */
export interface Logger {
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(options: { silent?: boolean } = {}): Logger {
  const write = (level: string, msg: string, fields?: Record<string, unknown>) => {
    if (options.silent) return;
    const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
    (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
  };
  return {
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
  };
}
