// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KitchenStatus, MixResult } from '../src/types'
import { imageUrl } from './fixtures'
import { EmojisPage } from '../client/page'

const harness = vi.hoisted(() => {
  const status: KitchenStatus = { ready: true, updating: false, emojiCount: 3, combinationCount: 2 }
  const action = vi.fn<(name: string, input: { input?: string }) => Promise<unknown>>()
  return { status, loading: false, offline: false, action }
})

vi.mock('@chatluna/ui-client/client', async () => {
  const { useState } = await import('react')
  return {
    useTranslate: () => (key: string) => key,
    useLive: (name: string, params?: { query: string }) => ({
      status: harness.loading ? 'loading' : 'ready',
      data: name === 'emojis.status' ? harness.status : {
        items: params?.query ? [] : [{ id: '1f600', emoji: '😀', name: 'grinning face', keywords: ['smile'] }], total: 1, page: 1, pages: 1
      }
    }),
    useAction: (name: string, options: { onError: () => void }) => {
      const [state, setState] = useState<{ pending: boolean; variables?: { input?: string }; data?: unknown }>({ pending: false })
      return Object.assign(async (input: { input?: string }) => {
        setState({ pending: true, variables: input })
        try {
          const data = await harness.action(name, input)
          setState({ pending: false, variables: input, data })
          return data
        } catch {
          setState({ pending: false, variables: input })
          options.onError()
          return undefined
        }
      }, state, { offline: harness.offline })
    }
  }
})

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
  harness.status = { ready: true, updating: false, emojiCount: 3, combinationCount: 2 }
  harness.loading = false
  harness.offline = false
  harness.action.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

async function render() { await act(async () => root.render(<EmojisPage />)) }
function button(text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === text)
  if (!match) throw new Error(`Missing button: ${text}`)
  return match
}
async function combine(result: MixResult) {
  harness.action.mockResolvedValue(result)
  await render()
  await act(async () => button('compose').click())
}

describe('ui-kit page states', () => {
  it('shows inputs, recipe examples and a paginated catalog', async () => {
    await render()
    expect(container.textContent).toContain('inputTitle')
    expect(container.querySelector('#emojis-left')).not.toBeNull()
    expect(container.querySelector('button[aria-label="left: 😀 grinning face"]')).not.toBeNull()
    expect(button('previous').disabled).toBe(true)
    expect(button('next').disabled).toBe(true)
  })
  it('shows loading skeletons', async () => {
    harness.loading = true
    await render()
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull()
  })
  it('keeps retry available without usable metadata', async () => {
    harness.status.ready = false
    await render()
    expect(button('compose').disabled).toBe(true)
    expect(button('update').disabled).toBe(false)
    expect(container.textContent).toContain('unavailable')
  })
  it('disables actions when offline', async () => {
    harness.offline = true
    await render()
    expect(button('compose').disabled).toBe(true)
    expect(button('update').disabled).toBe(true)
    expect(container.textContent).toContain('offline')
  })
  it('shows cached-data fallback after an update failure', async () => {
    harness.status.error = 'network'
    await render()
    expect(container.textContent).toContain('errors.network')
    expect(container.textContent).toContain('cachedHint')
    expect(button('compose').disabled).toBe(false)
  })
  it('renders one image and the chat command', async () => {
    await combine({ kind: 'found', left: '😀', right: '🔥', image: { url: imageUrl, description: 'test', date: '20201001' } })
    expect(harness.action).toHaveBeenCalledWith('emojis.mix', { input: '😀 🔥' })
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img')?.src).toBe(imageUrl)
    expect(container.textContent).toContain('emoji 😀🔥')
  })
  it('shows an explicit image load failure and retains the original link', async () => {
    await combine({ kind: 'found', left: '😀', right: '🔥', image: { url: imageUrl, description: 'test', date: '20201001' } })
    await act(async () => container.querySelector('img')?.dispatchEvent(new Event('error')))
    expect(container.textContent).toContain('imageError')
    expect(container.querySelector('a')?.href).toBe(imageUrl)
  })
  it('shows unavailable combinations without inserting an image', async () => {
    await combine({ kind: 'missing', left: '😀', right: '🔥' })
    expect(container.textContent).toContain('missing')
    expect(container.querySelector('img')).toBeNull()
  })
  it('shows invalid input details', async () => {
    await combine({ kind: 'invalid', reason: 'notEmoji' })
    expect(container.textContent).toContain('inputErrors.notEmoji')
    expect(container.querySelector('#emojis-left')?.getAttribute('aria-invalid')).toBe('true')
  })
  it('does not show an old request after selecting a different recipe', async () => {
    let finish: (value: MixResult) => void = () => {}
    harness.action.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await render()
    await act(async () => button('compose').click())
    await act(async () => button('❤️ + 🔥').click())
    await act(async () => finish({ kind: 'found', left: '😀', right: '🔥', image: { url: imageUrl, description: 'test', date: '20201001' } }))
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('previewEmpty')
  })
  it('reports action failure inline', async () => {
    harness.action.mockRejectedValue(new Error('FORBIDDEN'))
    await render()
    await act(async () => button('update').click())
    expect(container.textContent).toContain('requestError')
  })
})
