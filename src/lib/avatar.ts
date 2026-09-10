// Avatar upload helper — profile pictures are stored inline on User.avatar
// as a resized data: URL so they survive reloads/offline (localStorage is the
// offline cache; the API persists them via PATCH /api/users/me when logged in).
// This deliberately does NOT go through storageService: its Local provider
// keeps blob: object URLs that die on reload.

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5MB input limit (resized down after)
export const MAX_AVATAR_DIM = 256 // longest edge after resize — keeps localStorage small
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp'

export function validateAvatarFile(file: { type?: string; size?: number; name?: string }): string | null {
  const type = (file?.type || '').toLowerCase()
  if (!type.startsWith('image/')) return 'Please choose an image file (PNG, JPEG, or WebP).'
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  if (!allowed.includes(type)) return `Unsupported image type (${type || 'unknown'}). Use PNG, JPEG, or WebP.`
  const size = typeof file?.size === 'number' ? file.size : 0
  if (size <= 0) return 'That file looks empty — please choose another image.'
  if (size > MAX_AVATAR_BYTES) return `Image is too large (${(size / 1024 / 1024).toFixed(1)}MB). Max is 5MB.`
  return null
}

export function getInitials(name?: string, email?: string): string {
  const src = (name || '').trim() || (email || '').trim()
  if (!src) return '?'
  if (src.includes('@') && !src.includes(' ')) return src.slice(0, 1).toUpperCase()
  return src
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.slice(0, 1).toUpperCase())
    .join('') || '?'
}

/** Read any Blob/File as a data: URL. Works in browsers (FileReader) and Node tests (arrayBuffer). */
export function fileToDataUrl(file: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onerror = () => reject(new Error('Could not read that image.'))
      r.onload = () => resolve(String(r.result || ''))
      r.readAsDataURL(file)
    })
  }
  // Node / vitest fallback (no FileReader)
  const anyFile = file as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }
  if (typeof anyFile.arrayBuffer === 'function') {
    return anyFile.arrayBuffer().then((buf) => {
      const b64 =
        typeof Buffer !== 'undefined'
          ? Buffer.from(buf).toString('base64')
          : btoa(String.fromCharCode(...new Uint8Array(buf)))
      const mime = (file as File).type || 'image/png'
      return `data:${mime};base64,${b64}`
    })
  }
  return Promise.reject(new Error('Could not read that image.'))
}

/**
 * Downscale a data: URL image to a centered square (cover-crop) of at most
 * maxDim px. Returns the original data URL when DOM canvas is unavailable
 * (SSR / vitest) so uploads still work — just without resizing.
 */
export function downscaleToAvatar(dataUrl: string, maxDim = MAX_AVATAR_DIM): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(dataUrl)
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const w = (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width || 0
          const h = (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height || 0
          if (!w || !h) { resolve(dataUrl); return }
          // Square cover-crop centered, then scale to <= maxDim.
          const side = Math.min(w, h)
          const target = Math.min(maxDim, side, Math.max(w, h))
          const dim = Math.max(1, Math.min(maxDim, target))
          const sx = Math.floor((w - side) / 2)
          const sy = Math.floor((h - side) / 2)
          const canvas = document.createElement('canvas')
          canvas.width = dim
          canvas.height = dim
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(dataUrl); return }
          ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim)
          // Keep PNG for transparency, JPEG otherwise (smaller).
          const isPng = dataUrl.slice(5, 15).toLowerCase().includes('png')
          resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85))
        } catch {
          resolve(dataUrl)
        }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch {
      resolve(dataUrl)
    }
  })
}

/** Validate + read + downscale a user-picked file into a User.avatar value. */
export async function fileToAvatarDataUrl(file: File, maxDim = MAX_AVATAR_DIM): Promise<string> {
  const err = validateAvatarFile(file)
  if (err) throw new Error(err)
  const raw = await fileToDataUrl(file)
  if (!raw.startsWith('data:image/')) throw new Error('Could not read that image.')
  return downscaleToAvatar(raw, maxDim)
}
