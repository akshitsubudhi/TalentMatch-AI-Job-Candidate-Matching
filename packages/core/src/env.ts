/**
 * Treat empty environment variables as unset. `.env.example` lists every variable with
 * an empty value (`FOO=`); without this, schemas like z.string().url().optional() reject "".
 */
export function withoutEmptyStrings<T extends Record<string, string | undefined>>(env: T): Partial<T> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== "") out[key] = value;
  }
  return out as Partial<T>;
}
