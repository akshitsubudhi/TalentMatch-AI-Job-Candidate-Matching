import { createHash } from "node:crypto";

/** Lower-case hex sha256 of bytes or a UTF-8 string. */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}
