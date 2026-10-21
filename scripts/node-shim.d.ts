// The few Node APIs scripts/ uses. @types/node is not a project dependency
// (PLAN.md, Tech stack), so these are declared here for scripts only.
declare module 'node:fs' {
  export function readFileSync(path: URL, encoding: 'utf8'): string;
}
declare const process: { exitCode: number | undefined };
interface ImportMeta {
  readonly url: string;
}
