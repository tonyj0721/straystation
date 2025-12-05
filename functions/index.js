const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sharp = require("sharp");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");

admin.initializeApp();

const R = (name) =>
  functions
    .region("asia-east1")
    .runWith({ memory: "1GB", timeoutSeconds: 300 })
    .storage.object()
    .onFinalize(name);

exports.processPets = R(async (object) => {
  if (!object.name || !object.name.startsWith("original/pets/")) return null;
  return handleImage(object, "pets");
});

exports.processAdopted = R(async (object) => {
  if (!object.name || !object.name.startsWith("original/adopted/")) return null;
  return handleImage(object, "adopted");
});

async function handleImage(object, kind) {
  const contentType = object.contentType || "";
  if (!contentType.startsWith("image/")) return null;

  const bucket = admin.storage().bucket(object.bucket);
  const srcPath = object.name; // e.g. original/pets/{docId}/file.jpg
  const [, , docId, ...rest] = srcPath.split("/");
  if (!docId || rest.length === 0) return null;
  const fileName = rest.join("/");
  const dstPath = `${kind}/${docId}/${fileName}`;

  const tmpIn = path.join(os.tmpdir(), `in-${Date.now()}-${path.basename(fileName)}`);
  const tmpOut = path.join(os.tmpdir(), `out-${Date.now()}-${path.basename(fileName)}`);

  try {
    // 1) 下載
    await bucket.file(srcPath).download({ destination: tmpIn });

    // 2) 內嵌浮水印（樣式A：斜向滿版）
    const meta = await sharp(tmpIn).metadata();
    const W = meta.width || 1200, H = meta.height || 800;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
        <defs>
          <pattern id="p" patternUnits="userSpaceOnUse" width="320" height="220" patternTransform="rotate(-28)">
            <text x="0" y="160" font-size="48" font-family="sans-serif"
                  fill="rgba(255, 255, 255, 0.25)" stroke="rgba(0,0,0,0.15)" stroke-width="1">
              台中簡媽媽狗園
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#p)"/>
      </svg>`;
    await sharp(tmpIn).composite([{ input: Buffer.from(svg) }]).toFile(tmpOut);

    // 3) 上傳到公開資料夾（pets/ or adopted/），加 token 產生可下載網址
    const token = uuidv4();
    await bucket.upload(tmpOut, {
      destination: dstPath,
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
        cacheControl: "public,max-age=31536000,immutable",
      },
      resumable: false,
    });

    const downloadURL = buildDownloadURL(bucket.name, dstPath, token);

    // 4) 寫回 Firestore
    const db = admin.firestore();
    const docRef = db.collection("pets").doc(docId);
    const field = kind === "pets" ? "images" : "adoptedPhotos";

    await docRef.set(
      {
        [field]: admin.firestore.FieldValue.arrayUnion(downloadURL),
      },
      { merge: true }
    );

    // 5) 若全部處理完，清 processing 旗標
    const [nOrig, nDone] = await Promise.all([
      countFiles(bucket, `original/${kind}/${docId}/`),
      countFiles(bucket, `${kind}/${docId}/`),
    ]);

    if (nOrig > 0 && nOrig === nDone) {
      const flags =
        kind === "pets"
          ? { processing: false }
          : { processingAdopted: false };
      await docRef.set(flags, { merge: true });
    }

    return null;
  } finally {
    // 清理暫存
    safeUnlink(tmpIn);
    safeUnlink(tmpOut);
  }
}

function buildDownloadURL(bucketName, objectPath, token) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

async function countFiles(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix });
  return files.filter((f) => !f.name.endsWith("/")).length;
}

function safeUnlink(p) {
  if (!p) return;
  fs.unlink(p).catch(() => { });
}
