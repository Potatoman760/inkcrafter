// Cut the new white-card sprites using the editor's tested keyer, preserving originals.
// Run from Editor: npx electron scripts/villa-portrait-cutouts.cjs
const { app, nativeImage } = require('electron')
const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { resolve } = require('node:path')
const vm = require('node:vm')
const { transformSync } = require('esbuild')
const moduleShim = { exports: {} }
vm.runInNewContext(transformSync(readFileSync(resolve('src/main/backgroundKey.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
  { module: moduleShim, exports: moduleShim.exports })
const { keyBackground } = moduleShim.exports
app.whenReady().then(() => {
  try {
    const baths = process.argv.includes('--baths')
    const people = baths ? Object.keys(JSON.parse(readFileSync(resolve('data/projects/breedhaven/chapter5/villa-bath-art.json'), 'utf8')).characters) : ['isolde', 'tamsin']
    for (const who of people) for (const look of baths ? ['bath'] : ['neutral', 'happy']) {
      const source = resolve(`data/projects/breedhaven/media/characters/${who}/${look}-${baths ? 'v1' : 'v2'}.png`)
      const target = source.replace(/\.png$/, '-cutout.png')
      if (existsSync(target)) { console.log('Already cut: ' + target); continue }
      const original = nativeImage.createFromPath(source), { width, height } = original.getSize()
      if (!width || !height) throw new Error('Missing image: ' + source)
      const bitmap = original.toBitmap(), data = new Uint8ClampedArray(bitmap.length)
      // Electron on Windows exposes premultiplied BGRA; input cards are opaque.
      for (let i = 0; i < bitmap.length; i += 4) {
        if (bitmap[i + 3] !== 255) throw new Error('Expected an opaque source card')
        data[i] = bitmap[i + 2]; data[i + 1] = bitmap[i + 1]; data[i + 2] = bitmap[i]; data[i + 3] = 255
      }
      const result = keyBackground({ width, height, data }, { mode: 'gaps' })
      if (!result.ok) throw new Error(result.message)
      const pixels = result.image.data, encoded = Buffer.alloc(pixels.length)
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3], scale = alpha / 255
        encoded[i] = Math.round(pixels[i + 2] * scale); encoded[i + 1] = Math.round(pixels[i + 1] * scale)
        encoded[i + 2] = Math.round(pixels[i] * scale); encoded[i + 3] = alpha
      }
      writeFileSync(target, nativeImage.createFromBitmap(encoded, { width, height }).toPNG())
      console.log(`${who}/${look}: ${width} x ${height}; cleared ${result.cleared} pixels including ${result.enclosed} enclosed background pixels`)
    }
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})
