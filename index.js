/**
 * processMediaWatermark (Gen2, nodejs20)
 *
 * v4 fixes (based on your logs + symptom "processing succeeded but no visible watermark"):
 * 1) The SVG pattern text was drawn at y=0 with dominant-baseline=middle, which can be clipped away in SVG pattern tiles.
 *    -> draw at y=STEP_Y/2 so glyphs are inside the tile.
 * 2) Match existing front-end watermark color: white text with alpha 0.25.
 * 3) Reduce caching confusion when overwriting the same object+token: set cacheControl to max-age=0 (force revalidate).
 *
 * We still avoid ffmpeg drawtext (your ffmpeg build has no drawtext filter) and instead rasterize SVG via sharp.
 */

import { onObjectFinalized } from "firebase-functions/v2/storage";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import admin from "firebase-admin";
import { Storage } from "@google-cloud/storage";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

initializeApp();
const storage = new Storage();

const WM_TEXT = "台中簡媽媽狗園";
const WM_ANGLE_DEG = -33;

// NOTE: browser canvas blends in a way that can look a bit "brighter" than sharp/libvips compositing.
// If your new watermark still looks lighter/dimmer than the old front-end one, tweak this (0.25 -> 0.30/0.32).
const WM_OPACITY = 0.25;

// Font files (put them under functions/fonts/)
const WM_FONT_REGULAR = path.join(process.cwd(), "fonts", "TaipeiSansTCBeta-Regular.ttf");
const WM_FONT_SEMIBOLD = path.join(process.cwd(), "fonts", "TaipeiSansTCBeta-Bold.ttf"); // recommended (closer to font-weight: 600)
let _wmFontPathCache = null;

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function getWatermarkFontPath() {
  if (_wmFontPathCache) return _wmFontPathCache;
  if (await exists(WM_FONT_SEMIBOLD)) {
    _wmFontPathCache = WM_FONT_SEMIBOLD;
    return _wmFontPathCache;
  }
  _wmFontPathCache = WM_FONT_REGULAR;
  return _wmFontPathCache;
}

// Embed font as data: URI so librsvg can always load it in Cloud Functions (file:// often fails)
let _wmFontDataUriCache = null;
async function getWatermarkFontDataUri() {
  if (_wmFontDataUriCache) return _wmFontDataUriCache;
  const fontPath = await getWatermarkFontPath();
  const buf = await fs.readFile(fontPath);
  const b64 = buf.toString("base64");
  // ttf works for both Regular/Bold files in this project
  _wmFontDataUriCache = `data:font/ttf;base64,${b64}`;
  return _wmFontDataUriCache;
}

function isUnderRoots(filePath) {
  return filePath.startsWith("pets/") || filePath.startsWith("adopted/");
}
function isThumb(filePath) { return filePath.startsWith("thumbs/"); }
function noExt(p) { return p.replace(/\.[^.]+$/i, ""); }
function makeThumbPath(filePath) { return `thumbs/${noExt(filePath)}.jpg`; }
function parseDocId(filePath) {
  const parts = String(filePath).split("/");
  const top = parts[0];
  const docId = parts[1];
  if (!top || !docId) return null;
  return { top, docId };
}


// Firestore：用 pets/<docId> 當作唯一資料來源（無論 Storage path 是 pets/ 或 adopted/）
async function markPetMediaProcessed(filePath, extraMerge = {}) {
  const info = parseDocId(filePath);
  if (!info || !info.docId) return;

  const petRef = admin.firestore().doc(`pets/${info.docId}`);
  const FieldValue = admin.firestore.FieldValue;

  // 移除 pending path + 可能的額外欄位（例如影片縮圖 thumbByPath）
  await petRef.set(
    {
      ...extraMerge,
      wmPending: FieldValue.arrayRemove(filePath),
    },
    { merge: true }
  );

  // 若 pending 清空 → mediaReady=true
  const snap = await petRef.get().catch(() => null);
  const pending = snap && snap.exists ? (snap.data()?.wmPending || []) : [];
  if (!pending || pending.length === 0) {
    await petRef.set({ mediaReady: true }, { merge: true });
  }
}

async function runFFmpeg(args, { stdio = "ignore" } = {}) {
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio });
    p.on("error", reject);
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

async function getVideoDims(tmpVideo) {
  return await new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ["-hide_banner", "-i", tmpVideo], { stdio: ["ignore", "ignore", "pipe"] });
    let out = "";
    p.stderr.on("data", (d) => (out += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", () => {
      const m = out.match(/,\s*(\d+)x(\d+)[,\s]/);
      if (!m) return reject(new Error("cannot parse video dimensions"));
      resolve({ width: parseInt(m[1], 10), height: parseInt(m[2], 10) });
    });
  });
}

function svgEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWatermarkSvg(W, H, text, fontDataUri) {
  // Match front-end computation (see Modal.js __drawWatermarkPattern)
  const FS = Math.round(Math.max(W, H) * 0.03);
  const STEP_X = Math.max(Math.round(FS * 12), 360);
  const STEP_Y = Math.max(Math.round(FS * 8), 260);
  const diag = Math.hypot(W, H);
  // Canvas "textBaseline=middle" vs SVG baseline differs slightly; nudge down to match the old front-end look.
  const SHIFT_Y = Math.round(FS * 0.33);
  const SHIFT_X = 0;
  const t = svgEscape(text);
  const fontUrl = fontDataUri;

  // Explicitly place text elements (no <pattern>) so phase/spacing matches the canvas loops.
  const nodes = [];
  for (let x = -diag; x <= diag; x += STEP_X) {
    for (let y = -diag; y <= diag; y += STEP_Y) {
      nodes.push(`<text x="${(x + SHIFT_X).toFixed(2)}" y="${(y + SHIFT_Y).toFixed(2)}" class="wmText" dominant-baseline="middle">${t}</text>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style type="text/css"><![CDATA[
      @font-face { font-family: "TaipeiSansTCBeta"; src: url("${fontUrl}"); font-weight: 600; }
      .wmText {
        font-family: "TaipeiSansTCBeta","Taipei Sans TC Beta","Microsoft JhengHei",sans-serif;
        font-size: ${FS}px;
        font-weight: 600;
        fill: rgb(255,255,255);
        stroke: rgb(255,255,255);
        stroke-width: ${Math.max(0.8, FS * 0.06).toFixed(2)};
        paint-order: stroke fill;
        stroke-linejoin: round;
      }
    ]]></style>
  </defs>

  <g transform="translate(${(W / 2).toFixed(2)} ${(H / 2).toFixed(2)}) rotate(${WM_ANGLE_DEG})">
    ${nodes.join("\n    ")}
  </g>
</svg>`;
}

async function renderWatermarkPng(W, H, outPng, fontDataUri, text = WM_TEXT) {
  // Render as fully-opaque text (alpha=1) first, then multiply overall alpha by WM_OPACITY.
  // This makes WM_OPACITY reliably effective (and avoids any SVG rgba parsing quirks).
  const svg = buildWatermarkSvg(W, H, text, fontDataUri);
  const basePng = await sharp(Buffer.from(svg)).png().toBuffer();

  // Multiply alpha by WM_OPACITY using a dest-in mask (background stays transparent, text becomes WM_OPACITY).
  const mask = await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: WM_OPACITY },
    },
  }).png().toBuffer();

  await sharp(basePng)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toFile(outPng);
}

async function uploadOverwrite(bucket, srcLocalPath, dstPath, { contentType, token, extraMetadata = {} }) {
  await bucket.upload(srcLocalPath, {
    destination: dstPath,
    metadata: {
      contentType,
      // IMPORTANT: overwrite same URL/token; set max-age=0 so browsers/CDN revalidate.
      cacheControl: "public, max-age=0, must-revalidate",
      metadata: {
        firebaseStorageDownloadTokens: token,
        ...extraMetadata,
      },
    },
  });
}

export const processMediaWatermark = onObjectFinalized(
  {
    region: "asia-east1",
    timeoutSeconds: 540,
    memory: "2GiB",
  },
  async (event) => {
    const obj = event.data;
    const bucketName = obj.bucket;
    const filePath = obj.name;
    const contentType = obj.contentType || "";
    const meta = obj.metadata || {};
    if (!bucketName || !filePath) return;

    if (!isUnderRoots(filePath)) return;
    if (isThumb(filePath)) return;
    const force = meta.forceWm === "1";
    if (meta.wmProcessed === "1" && !force) return;

    const bucket = storage.bucket(bucketName);
    const srcFile = bucket.file(filePath);
    const token = meta.firebaseStorageDownloadTokens || uuidv4();

    const tmpIn = path.join(os.tmpdir(), `in_${path.basename(filePath)}`);
    const tmpWm = path.join(os.tmpdir(), `wm_${uuidv4()}.png`);
    const tmpOut = path.join(os.tmpdir(), `out_${path.basename(noExt(filePath))}`);
    const tmpThumb = path.join(os.tmpdir(), `thumb_${path.basename(noExt(filePath))}.jpg`);

    try {
      const fontPath = await getWatermarkFontPath();
      const fontDataUri = await getWatermarkFontDataUri();
      if (!(await exists(fontPath))) {
        logger.error("Font file missing", { fontPath, cwd: process.cwd(), tried: [WM_FONT_SEMIBOLD, WM_FONT_REGULAR] });
        return;
      }
      logger.info("watermark config", { fontPath, WM_OPACITY, WM_ANGLE_DEG, WM_TEXT, fontEmbedded: true });

      await srcFile.download({ destination: tmpIn });

      if (contentType.startsWith("image/")) {
        const md = await sharp(tmpIn).rotate().metadata();
        const W = md.width || 0;
        const H = md.height || 0;
        if (!W || !H) throw new Error("cannot read image dimensions");

        await renderWatermarkPng(W, H, tmpWm, fontDataUri, WM_TEXT);
        const outJpg = `${tmpOut}.jpg`;
        await sharp(tmpIn)
          .rotate()
          .composite([{ input: tmpWm }])
          .jpeg({ quality: 85 })
          .toFile(outJpg);

        await uploadOverwrite(bucket, outJpg, filePath, {
          contentType: "image/jpeg",
          token,
          extraMetadata: { wmProcessed: "1", wmCode: "v10", wmOpacity: String(WM_OPACITY) },
        });

        logger.info("image watermarked", { filePath });

        await markPetMediaProcessed(filePath);

      } else if (contentType.startsWith("video/")) {
        const { width: W, height: H } = await getVideoDims(tmpIn);
        await renderWatermarkPng(W, H, tmpWm, fontDataUri, WM_TEXT);
        const outMp4 = `${tmpOut}.mp4`;

        await new Promise((resolve, reject) => {
          const args = [
            "-i", tmpIn,
            "-i", tmpWm,
            "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[v]",
            "-map", "[v]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            outMp4,
          ];
          const p = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
          let err = "";
          p.stderr.on("data", (d) => (err += d.toString("utf8")));
          p.on("error", reject);
          p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg overlay exit ${code}: ${err}`)));
        });

        await uploadOverwrite(bucket, outMp4, filePath, {
          contentType: "video/mp4",
          token,
          extraMetadata: { wmProcessed: "1", wmCode: "v10", wmOpacity: String(WM_OPACITY) },
        });

        // thumb from new mp4
        await runFFmpeg([
          "-ss", "0.1",
          "-i", outMp4,
          "-frames:v", "1",
          "-vf", "scale=360:-1",
          "-q:v", "2",
          tmpThumb,
        ]);

        const thumbPath = makeThumbPath(filePath);
        const thumbToken = uuidv4();
        await bucket.upload(tmpThumb, {
          destination: thumbPath,
          metadata: {
            contentType: "image/jpeg",
            cacheControl: "public, max-age=31536000",
            metadata: { firebaseStorageDownloadTokens: thumbToken },
          },
        });
        const encoded = encodeURIComponent(thumbPath);
        const thumbUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${thumbToken}`;
        await markPetMediaProcessed(filePath, { thumbByPath: { [filePath]: thumbUrl } });

        logger.info("video watermarked + thumb generated", { filePath, thumbPath });
      }
    } catch (e) {
      logger.error("processMediaWatermark failed", { filePath, message: String(e?.message || e) });
    } finally {
      await fs.unlink(tmpIn).catch(() => { });
      await fs.unlink(tmpWm).catch(() => { });
      await fs.unlink(`${tmpOut}.jpg`).catch(() => { });
      await fs.unlink(`${tmpOut}.mp4`).catch(() => { });
      await fs.unlink(tmpThumb).catch(() => { });
    }
  }
);
