import type { SponsorkitRenderOptions } from '../types.ts'
import { describe, expect, it } from 'vitest'
import { genSvgImage, SvgComposer } from './svg.ts'

function createComposer(width = 800) {
  return new SvgComposer({
    width,
    svgInlineCSS: '.text { fill: red }',
    imageFormat: 'webp',
  } as unknown as Required<SponsorkitRenderOptions>)
}

describe('svgComposer', () => {
  it('starts empty', () => {
    const composer = createComposer()
    expect(composer.height).toBe(0)
    expect(composer.body).toBe('')
  })

  it('addText appends centered text and advances the height', () => {
    const composer = createComposer(800)
    composer.addText('Hello')
    expect(composer.height).toBe(20)
    expect(composer.body).toContain('x="400"')
    expect(composer.body).toContain('>Hello</text>')
    expect(composer.body).toContain('class="text"')
  })

  it('addTitle uses the tier-title class', () => {
    const composer = createComposer()
    composer.addTitle('Backers')
    expect(composer.body).toContain('class="sponsorkit-tier-title"')
    expect(composer.body).toContain('>Backers</text>')
  })

  it('addSpan only advances the height', () => {
    const composer = createComposer()
    composer.addSpan(42)
    expect(composer.height).toBe(42)
    expect(composer.body).toBe('')
  })

  it('addRaw appends without touching the height', () => {
    const composer = createComposer()
    composer.addRaw('<rect />')
    expect(composer.body).toBe('<rect />')
    expect(composer.height).toBe(0)
  })

  it('is chainable', () => {
    const composer = createComposer()
    expect(composer.addSpan(10).addText('x')).toBe(composer)
  })

  it('generateSvg wraps the body with dimensions and inline css', () => {
    const composer = createComposer(600)
    composer.addText('Hi')
    const svg = composer.generateSvg()
    expect(svg).toContain('viewBox="0 0 600 20"')
    expect(svg).toContain('width="600"')
    expect(svg).toContain('height="20"')
    expect(svg).toContain('<style>.text { fill: red }</style>')
    expect(svg).toContain('>Hi</text>')
  })
})

describe('genSvgImage', () => {
  it('embeds the image as a base64 data uri', () => {
    const svg = genSvgImage(1, 2, 40, 0.5, 'QUJD', 'png', 'crop-1')
    expect(svg).toContain('href="data:image/png;base64,QUJD"')
    expect(svg).toContain('x="1"')
    expect(svg).toContain('y="2"')
    expect(svg).toContain('width="40"')
    expect(svg).toContain('rx="20"') // size * radius
  })

  it('uses the provided crop id for both the clip path and its reference', () => {
    const svg = genSvgImage(0, 0, 40, 0.5, 'SAME', 'webp', 'render-crop-42')
    expect(svg).toContain('<clipPath id="render-crop-42">')
    expect(svg).toContain('clip-path="url(#render-crop-42)"')
  })
})
