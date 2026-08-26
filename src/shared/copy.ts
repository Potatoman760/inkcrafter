import strings from './copy.json'

/**
 * The small print, in one place.
 *
 * Every clause that explains a control used to be a string literal wherever the
 * control happened to be written, which made the app's voice impossible to read
 * as a whole: whether two panels called the same thing by the same name, whether
 * a sentence had drifted, whether anything explained a field twice in different
 * words. `copy.json` is that voice on one page, sorted, so it can be edited as
 * writing rather than as sixty-odd edits across twenty-two files.
 *
 * JSON rather than a module so it stays obviously data — no imports, no logic,
 * nothing to run. It is still bundled and still type-checked: the keys are
 * literal types, so a typo is a build failure rather than a blank tooltip.
 *
 * All of it is written as sentences — capital at the front, full stop at the
 * end — whether it ends up in a tooltip or set beside a label. A file of
 * fragments drifts, because there is no rule to notice a breach of.
 *
 * What belongs here is *writing*: the explanation of a control. What does not is
 * a value the app computed — a filename, a path, a count — which changes as the
 * author works and is not copy at all. Where a sentence wraps such a value, the
 * sentence lives here with a `{placeholder}` in it and the value is passed in.
 */

export type CopyKey = keyof typeof strings

/**
 * One string, with any `{placeholder}` filled in.
 *
 * A placeholder with nothing to fill it is left as written rather than blanked:
 * the braces in the output say which key is wrong, where an empty gap would only
 * say that something is.
 */
export function copy(key: CopyKey, values?: Record<string, string | number>): string {
  const text: string = strings[key]
  if (!values) return text

  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name]
    return value === undefined ? whole : String(value)
  })
}
