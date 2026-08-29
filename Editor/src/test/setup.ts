import { afterEach } from 'vitest'

// The suite is node by default and only some files opt into jsdom, so the DOM
// helpers are loaded only where there is a document for them to work on.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')
  // Testing Library auto-cleans only when vitest globals are on, and they are not.
  afterEach(() => cleanup())

  // jsdom has no layout, so it implements neither of these. Components use both
  // to keep the reading in view.
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.scrollTo = () => {}

  // jsdom has no pointer capture, which the splitter uses so a drag survives
  // the cursor outrunning a 5px handle.
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
