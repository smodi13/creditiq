import type { ReactNode } from "react";
export const cell = (sort: string | number, node?: ReactNode) => ({ sort, node: node ?? sort });
