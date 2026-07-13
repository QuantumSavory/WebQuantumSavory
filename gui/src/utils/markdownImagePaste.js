const SAFE_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:gif|jpeg|png|webp);base64,/i

export function getClipboardImageFiles(clipboardData) {
  return Array.from(clipboardData?.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter(file => file && SAFE_IMAGE_TYPES.has(file.type.toLowerCase()))
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string' && SAFE_IMAGE_DATA_URL.test(reader.result)) {
        resolve(reader.result)
      } else {
        reject(new Error('The pasted image did not produce a supported data URL.'))
      }
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('The pasted image could not be read.'))
    })
    reader.addEventListener('abort', () => {
      reject(new Error('Reading the pasted image was cancelled.'))
    })
    reader.readAsDataURL(file)
  })
}

export async function imageFilesToMarkdown(files) {
  const dataUrls = await Promise.all(files.map(readAsDataUrl))
  return dataUrls
    .map(dataUrl => `![Pasted image](${dataUrl})`)
    .join('\n\n')
}
