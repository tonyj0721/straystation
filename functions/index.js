/**
 * Cloud Storage 影片上傳後 → 用 ffmpeg「硬浮水印」再覆寫回原檔案路徑
 *
 * 觸發條件：contentType 以 video/ 開頭，且路徑符合 pets/{docId}/...
 * 跳過條件：
 *   - 資料夾（name 結尾為 / 或沒有 contentType）
 *   - 已經處理過（metadata.watermarked === "true"）
 *
 * 需求：
 *   - Firebase 專案需啟用 Cloud Functions / Storage（通常需要 Blaze）
 *   - 建議把 functions 部署在與 Storage bucket 相同 region，避免部署失敗/延遲
 *
 * 說明：
 *   - 此做法會把影片「燒進檔案」（下載出去也會看到水印）
 *   - 前台不需要再疊 UI 浮水印覆蓋層
 */

const { onObjectFinalized } = require("firebase-functions/v2/storage");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");

const os = require("os");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { spawn } = require("child_process");
const crypto = require("crypto");

// Use bundled static binaries (more reliable on Cloud Functions Gen2)
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

initializeApp();

const DEFAULT_WATERMARK_TEXT = "台中簡媽媽狗園";

/** 讀取影片寬高（使用 ffprobe） */
async function probeVideoSize(inputPath) {
  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    inputPath,
  ];
  const { out } = await run(ffprobePath, args);
  const j = JSON.parse(out);
  const s = (j.streams && j.streams[0]) || {};
  const width = Number(s.width || 0);
  const height = Number(s.height || 0);
  if (!width || !height) throw new Error("ffprobe: cannot read video size");
  return { width, height };
}

/** 嘗試找一個可用的中文字型（避免方塊字） */
function pickFontFile() {
  const candidates = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return ""; // 讓 ffmpeg 用預設字型（若可用）
}

/** ffmpeg filter 用的字串 escape（保守處理常見字元） */
function escForDrawtext(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

/**
 * 產生「跟前端圖片同款」的滿版斜向重複水印文字檔（給 drawtext 用 textfile）
 * - 斜角：-33deg
 * - 字色：white@0.25
 * - 間距：STEP_X / STEP_Y（跟前端 addWatermarkToFile 同邏輯）
 */
async function buildTiledWatermarkTextFile({ text, width, height, fontSizePx }) {
  const diag = Math.hypot(width, height);
  const FS = Math.max(12, Math.round(fontSizePx));
  const STEP_X = Math.max(Math.round(FS * 12), 360);
  const STEP_Y = Math.max(Math.round(FS * 8), 260);

  // 用全形空白拉開間距（在 CJK 字型上效果最接近前端 canvas）
  const gapCount = Math.max(2, Math.round(STEP_X / FS));
  const GAP = "　".repeat(gapCount); // U+3000 IDEOGRAPHIC SPACE

  const cols = Math.ceil((diag * 2) / STEP_X) + 3;
  const rows = Math.ceil((diag * 2) / STEP_Y) + 3;

  const segment = `${text}${GAP}`;
  const line = segment.repeat(cols).trimEnd();
  const body = Array.from({ length: rows }, () => line).join("\n");

  const textPath = path.join(os.tmpdir(), `wm_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`);
  await fsp.writeFile(textPath, body, "utf8");

  // line_spacing 是「額外增加」的行距（px）；讓整體 baseline 間距接近 STEP_Y
  const lineSpacing = Math.max(0, STEP_Y - FS);

  return { textPath, lineSpacing };
}

function run(cmd, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) return resolve({ out, err });
      const e = new Error(`${cmd} exited with code ${code}\n${err}`);
      e.stdout = out;
      e.stderr = err;
      reject(e);
    });
  });
}

// ⚠️ 把 region 改成你的 Storage bucket 所在地（例：asia-east1 / asia-east2 / us-central1...）
exports.hardWatermarkVideo = onObjectFinalized(
  {
    region: "asia-east1",
    cpu: 2,
    memory: "2GiB",
    timeoutSeconds: 540,
    maxInstances: 3,
  },
  async (event) => {
    const obj = event.data;
    const fileBucket = obj.bucket;
    const filePath = obj.name;
    const contentType = obj.contentType || "";

    // folder / empty
    if (!filePath || filePath.endsWith("/")) {
      return logger.log("Skip folder-like object:", filePath);
    }

    // only videos
    if (!contentType.startsWith("video/")) {
      return logger.log("Skip non-video:", contentType, filePath);
    }

    // scope to your app path: pets/{docId}/...
    const parts = String(filePath).split("/").filter(Boolean);
    if (parts[0] !== "pets" || parts.length < 2) {
      return logger.log("Skip out-of-scope path:", filePath);
    }

    // prevent infinite loop
    const meta = obj.metadata || {};
    if (meta.watermarked === "true") {
      return logger.log("Skip already watermarked:", filePath);
    }

    // optional: size guard (bytes)
    const size = Number(obj.size || 0);
    if (size && size > 350 * 1024 * 1024) {
      // 350MB 以上先跳過，避免超時/爆記憶體（你可以自行調整）
      return logger.warn("Skip too large video:", size, filePath);
    }

    const bucket = getStorage().bucket(fileBucket);
    const file = bucket.file(filePath);

    const ext = path.extname(filePath) || ".mp4";
    const baseName = path.basename(filePath, ext);

    const tmpDir = os.tmpdir();
    const inPath = path.join(tmpDir, `${baseName}_${Date.now()}_in${ext}`);
    const outPath = path.join(tmpDir, `${baseName}_${Date.now()}_out.mp4`);

    logger.log("Downloading:", filePath, "->", inPath);
    await file.download({ destination: inPath });

    const fontfile = pickFontFile();
    const { width: vW, height: vH } = await probeVideoSize(inPath);

    // 跟前端圖片同款：字高 ≈ 長邊 * 0.03、斜角 -33deg、滿版重複、無外框
    const FS = Math.max(16, Math.round(Math.max(vW, vH) * 0.03));
    const { textPath: wmTextFile, lineSpacing } = await buildTiledWatermarkTextFile({
      text: DEFAULT_WATERMARK_TEXT,
      width: vW,
      height: vH,
      fontSizePx: FS,
    });

    const draw = [
      "drawtext=",
      fontfile ? `fontfile=${escForDrawtext(fontfile)}:` : "",
      `textfile='${escForDrawtext(wmTextFile)}':`,
      "fontcolor=white@0.25:",
      `fontsize=${FS}:`,
      `line_spacing=${lineSpacing}:`,
      // 置中繪製一大塊文字，旋轉後剛好鋪滿畫面
      "x=(w-text_w)/2:",
      "y=(h-text_h)/2:",
      "rotate=-33*PI/180"
    ].join("");

    // 讓音訊不存在也能成功（-map 0:a?）
    const ffArgs = [
      "-y",
      "-i", inPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-vf", draw,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outPath,
    ];

    logger.log("Running ffmpeg:", ffArgs.join(" "));
    try {
      await run(ffmpegPath, ffArgs);
    } catch (e) {
      logger.error("ffmpeg failed", e);
      // clean temp
      await Promise.allSettled([
        fsp.unlink(inPath),
        fsp.unlink(outPath),
        // 可能還沒產生就失敗，忽略即可
        fsp.unlink(wmTextFile).catch(() => {}),
      ]);
      throw e;
    }

    // keep existing download token (so original getDownloadURL continues to work)
    const token = meta.firebaseStorageDownloadTokens || crypto.randomUUID();

    logger.log("Uploading (overwrite):", filePath);
    await bucket.upload(outPath, {
      destination: filePath, // 覆寫同路徑（URL 不用改）
      resumable: false,
      metadata: {
        contentType: "video/mp4",
        cacheControl: obj.cacheControl || "public,max-age=3600",
        metadata: {
          ...meta,
          watermarked: "true",
          watermarkText: DEFAULT_WATERMARK_TEXT,
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    // temp cleanup
    await Promise.allSettled([
      fsp.unlink(inPath),
      fsp.unlink(outPath),
      fsp.unlink(wmTextFile).catch(() => {}),
    ]);

    logger.log("Done hard watermark:", filePath);
  }
);
