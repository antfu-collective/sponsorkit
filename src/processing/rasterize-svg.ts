import { Buffer } from 'node:buffer'
import { launch } from 'chrome-launcher'
import CDP from 'chrome-remote-interface'

/**
 * Chrome is used to rasterize the SVG into an image
 *
 * Originally, we used sharp but it doesn't support loading webp images
 */
export async function rasterizeSvg(
  svg: string,
  format: 'png' | 'webp' = 'png',
) {
  const chrome = await launch({
    chromeFlags: [
      '--headless',
      '--disable-gpu',
    ],
  })

  const chromeClient = await CDP({
    port: chrome.port,
  })

  const { DOM, Page, Emulation } = chromeClient
  await Page.enable()

  await Page.navigate({
    url: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  })

  await Page.loadEventFired()

  try {
    const { root: { nodeId: documentNodeId } } = await DOM.getDocument()
    const { nodeId } = await DOM.querySelector({
      selector: '*',
      nodeId: documentNodeId,
    })
    const box = await DOM.getBoxModel({ nodeId })

    await Emulation.setDeviceMetricsOverride({
      ...box.model,
      deviceScaleFactor: 2,
      mobile: false,
    })
    await Emulation.setVisibleSize(box.model)

    // Set transparent background
    await Emulation.setDefaultBackgroundColorOverride({
      color: {
        r: 0,
        g: 0,
        b: 0,
        a: 0,
      },
    })

    const screenshot = await Page.captureScreenshot({
      format,
      clip: {
        ...box.model,
        x: 0,
        y: 0,
        scale: 1,
      },
    })

    return Buffer.from(screenshot.data, 'base64')
  }
  catch (error) {
    console.error(error)
    throw new Error('Failed to take a snapshot')
  }
  finally {
    chromeClient.close()
    chrome.kill()
  }
}
