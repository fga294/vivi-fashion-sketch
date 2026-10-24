// The few Node APIs scripts/ uses. @types/node is not a project dependency
// (PLAN.md, Tech stack), so these are declared here for scripts only.
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
  export function writeFileSync(path: URL, data: Uint8Array): void;
  export function readdirSync(path: URL, options: { recursive: true }): string[];
  export function statSync(path: URL): { isFile(): boolean; size: number };
  export function existsSync(path: URL): boolean;
}
declare const process: { exitCode: number | undefined; argv: string[] };
interface ImportMeta {
  readonly url: string;
}
