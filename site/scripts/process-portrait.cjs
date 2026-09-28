// Colour-matches a portrait's near-black studio backdrop to the page background (#080809), so a hard image edge
// is invisible against the flat page. The bottom fade (visible where the photo meets whatever follows it) is
// NOT baked in here — it's a CSS gradient overlay (see .portrait::after in layout.css), because object-fit:cover
// crops the source to whatever box size/aspect the layout ends up with, and a fixed pixel-baked fade can end up
// entirely inside the cropped-away part of the image. A CSS overlay always sits on the actual rendered box.
//
// Usage: node scripts/process-portrait.cjs <source-image> [outfile-816] [outfile-480]
const sharp = require('sharp');
const fs = require('fs');

const [, , src, out816 = 'public/images/akhil-portrait-816.webp', out480 = 'public/images/akhil-portrait-480.webp'] = process.argv;
if (!src) { console.error('Usage: node scripts/process-portrait.cjs <source-image>'); process.exit(1); }

const a = (255 - 8) / 255, b = 8; // linear remap: 0 -> 8, 255 -> 255 (matches --bg-page #080809; imperceptible on the subject)

(async () => {
  const buf816 = await sharp(src).linear(a, b).webp({ quality: 86 }).toBuffer();
  fs.writeFileSync(out816, buf816);
  const buf480 = await sharp(src).resize({ width: 480 }).linear(a, b).webp({ quality: 86 }).toBuffer();
  fs.writeFileSync(out480, buf480);
  const m = await sharp(buf816).metadata();
  console.log(`wrote ${out816} (${m.width}x${m.height}) and ${out480}`);
})();
