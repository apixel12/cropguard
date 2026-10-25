import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Capture from '../src/components/Capture'
import { ModeProvider } from '../src/hooks/useMode'

vi.mock('../src/ml/modelLoader', async (orig) => ({
  ...(await orig<typeof import('../src/ml/modelLoader')>()),
  loadModel: vi.fn(async () => { throw new Error('model.json 404') }),
}))

describe('camera fallback', () => {
  it('shows "Camera unavailable" and a gallery option when permission fails', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) },
    })
    render(<Capture tips={["t"]} onBack={() => {}} onAnalyze={() => {}} />)
    expect(await screen.findByText('Camera not available')).toBeTruthy()
    const gallery = screen.getByText('Choose photos or a video')
    expect(gallery).toBeTruthy()
    fireEvent.click(gallery) // must not throw
  })
})

describe('model load failure', () => {
  it('shows Lemon AI unavailable and never claims offline readiness', async () => {
    const { ModelProvider } = await import('../src/hooks/useModels')
    const { default: Home } = await import('../src/components/Home')
    render(<ModelProvider><ModeProvider><Home onScan={() => {}} onHistory={() => {}} onAbout={() => {}} online offlineReady={false} displayName={(_c, l) => l} /></ModeProvider></ModelProvider>)
    await waitFor(() => expect(screen.getByText('Some of CropGuard didn’t download.')).toBeTruthy())
    expect(screen.queryByText(/works offline/)).toBeNull()
    expect((screen.getByRole('button', { name: /Check a leaf/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
