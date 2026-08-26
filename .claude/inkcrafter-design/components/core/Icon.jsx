import React, { useEffect, useState } from 'react'

/* Lucide, fetched as SVG source and inlined so the glyph inherits
   currentColor and survives being rasterised. Point BASE at a local copy
   of lucide-static/icons for an offline Electron build. */
const BASE = '../../../../node_modules/lucide-static/icons'
const CACHE = new Map()

function load(name) {
  if (!CACHE.has(name)) {
    CACHE.set(
      name,
      fetch(`${BASE}/${name}.svg`)
        .then((response) => (response.ok ? response.text() : ''))
        .then((text) =>
          text
            .replace(/<\?xml[^>]*>/g, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\s(width|height)="[^"]*"/g, '')
        )
        .catch(() => '')
    )
  }
  return CACHE.get(name)
}

/**
 * A Lucide glyph, tinted with currentColor.
 *
 * The house set is small and named in Icon.prompt.md — never mix in a
 * second icon family, and never substitute an emoji.
 */
export function Icon({ name, size = 14, style, ...rest }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let live = true
    load(name).then((text) => { if (live) setSvg(text) })
    return () => { live = false }
  }, [name])

  return (
    <span
      aria-hidden="true"
      data-icon={name}
      style={{
        display: 'inline-flex',
        flex: 'none',
        width: size,
        height: size,
        lineHeight: 0,
        color: 'inherit',
        ...style
      }}
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`) }}
      {...rest}
    />
  )
}
