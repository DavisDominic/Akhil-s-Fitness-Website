// Crops the source to the portrait box's exact aspect ratio (4/5, object-position 50% 12%, matching
// .portrait in layout.css) so object-fit:cover never re-crops it at a different breakpoint, then feathers
// all four edges to real transparency (built as a raw alpha buffer, not a blend-mode composite — libvips'
// 'dest-in' porter-duff op was leaking the mask's own RGB in as a white halo at low-alpha pixels) and
// flattens onto the page background.
const sharp = require('sharp');

const [, , src, out816, out480] = process.argv;

const BG = '#080809'; // --ink-950 / --bg-page
const BOX_RATIO = 4 / 5; // width/height
const POS_X = 0.5, POS_Y = 0.12;
const FEATHER_FRAC = 0.09; // fraction of the shorter cropped dimension

function ramp(pos, size, feather) {
  const d = Math.min(pos, size - 1 - pos);
  if (d >= feather) return 1;
  return d / feather; // linear 0 -> 1 over `feather` px from each edge
}

(async () => {
  const meta = await sharp(src).metadata();
  const srcW = meta.width, srcH = meta.height;
  const srcRatio = srcW / srcH;

  let cropW, cropH;
  if (srcRatio > BOX_RATIO) { cropH = srcH; cropW = Math.round(srcH * BOX_RATIO); }
  else { cropW = srcW; cropH = Math.round(srcW / BOX_RATIO); }
  const left = Math.round((srcW - cropW) * POS_X);
  const top = Math.round((srcH - cropH) * POS_Y);

  const feather = Math.round(Math.min(cropW, cropH) * FEATHER_FRAC);

  const alpha = Buffer.alloc(cropW * cropH);
  const colX = new Float64Array(cropW);
  const colY = new Float64Array(cropH);
  for (let x = 0; x < cropW; x++) colX[x] = ramp(x, cropW, feather);
  for (let y = 0; y < cropH; y++) colY[y] = ramp(y, cropH, feather);
  for (let y = 0; y < cropH; y++) {
    const base = y * cropW;
    const fy = colY[y];
    for (let x = 0; x < cropW; x++) alpha[base + x] = Math.round(255 * fy * colX[x]);
  }

  const croppedRgb = await sharp(src).extract({ left, top, width: cropW, height: cropH }).removeAlpha().raw().toBuffer();

  const flatBuf = await sharp(croppedRgb, { raw: { width: cropW, height: cropH, channels: 3 } })
    .joinChannel(alpha, { raw: { width: cropW, height: cropH, channels: 1 } })
    .flatten({ background: BG })
    .removeAlpha()
    .raw()
    .toBuffer();

  await sharp(flatBuf, { raw: { width: cropW, height: cropH, channels: 3 } }).resize({ width: 816 }).webp({ quality: 86 }).toFile(out816);
  await sharp(flatBuf, { raw: { width: cropW, height: cropH, channels: 3 } }).resize({ width: 480 }).webp({ quality: 86 }).toFile(out480);

  const m816 = await sharp(out816).metadata();
  console.log(`wrote ${out816} (${m816.width}x${m816.height}) and ${out480}`);
})();
