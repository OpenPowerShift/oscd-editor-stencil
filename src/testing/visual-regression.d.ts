// The package's type entry point re-exports a `.mjs` file whose types TypeScript cannot find.
declare module '@web/test-runner-visual-regression' {
  export function visualDiff(element: Node, name: string): Promise<void>;
}

// Ace modes are plain scripts that register themselves with Ace
declare module '@omicronenergy/oscd-ui/ace-editor/ace/*';
