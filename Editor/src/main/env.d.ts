/**
 * The prompts the app ships are markdown files, inlined at build time.
 *
 * `?raw` is Vite's, and electron-vite applies it to the main bundle the same
 * way it does to the renderer — so the text is compiled in and there is no file
 * to find at runtime, packaged or not. This is the type for it.
 */
declare module '*.md?raw' {
  const content: string
  export default content
}
