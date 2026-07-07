// Собирает www/ — локальную копию приложения для упаковки в Capacitor (APK).
// В www попадает только то, что нужно тюнеру офлайн: никакого sw.js —
// внутри приложения service worker не нужен (контент и так локальный).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');

const files = [
  'index.html',
  'mobile.css',
  'mobile.js',
  'manifest.json',
  'assets/gr-logo.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'vendor/react.production.min.js',
  'vendor/react-dom.production.min.js',
];

fs.rmSync(out, { recursive: true, force: true });
for (const f of files) {
  const src = path.join(root, f);
  const dst = path.join(out, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
console.log(`www/ built: ${files.length} files`);
