// QR на репозиторий: матрица модулей в src/assets/qr.json (слайд собирает QR из модулей).
import { writeFileSync } from 'node:fs'
import QRCode from 'qrcode'

export const REPO_URL = 'https://github.com/GeorgeTolen/real-couple'
const qr = QRCode.create(REPO_URL, { errorCorrectionLevel: 'M' })
const size = qr.modules.size
const bits = Array.from(qr.modules.data, (v) => (v ? 1 : 0)).join('')
writeFileSync(new URL('../src/assets/qr.json', import.meta.url), JSON.stringify({ url: REPO_URL, size, bits }))
console.log('qr.json ->', REPO_URL, size + '×' + size)
