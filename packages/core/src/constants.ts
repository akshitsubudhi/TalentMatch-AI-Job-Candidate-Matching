// Tiny, dependency-free constants that are safe (and cheap) to import from client components.
export const SENIORITIES = ["intern", "junior", "mid", "senior", "lead", "principal"] as const;
export type SeniorityValue = (typeof SENIORITIES)[number];
