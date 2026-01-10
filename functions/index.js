// functions/index.js
const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

admin.initializeApp();
const storage = new Storage();

exports.watermarkVideo = functions.storage.onObjectFinalized({
  region: 'asia-east1',
  memory: '1GiB',
  concurrency: 2,
}, async (event) => {
  const object = event.data;
  const filePath = object.name || '';
  if (!filePath.startsWith('raw-videos/')) return;

  const bucket = storage.bucket(object.bucket);
  const tmpdir = require('os').tmpdir();
  const path = require('path');
  const fs = require('fs');

  const fileName = path.basename(filePath);
  const petId = (object.metadata && object.metadata.petId) || null;
  const watermarkText = (object.metadata && object.metadata.watermarkText) || '台中簡媽媽狗園';

  const tmpInput = path.join(tmpdir, `in-${Date.now()}-${fileName}`);
  const tmpOutput = path.join(tmpdir, `out-${Date.now()}.mp4`);

  await bucket.file(filePath).download({ destination: tmpInput });

  await new Promise((resolve, reject) => {
    ffmpeg(tmpInput)
      .videoCodec('libx264')
      .audioCodec('aac')
      .size('?x720')
      .outputOptions([
        '-preset veryfast',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
        '-profile:v baseline',
        '-level 3.1'
      ])
      .videoFilters({
        filter: 'drawtext',
        options: {
          text: watermarkText,
          fontsize: 18,
          fontcolor: 'white@0.88',
          box: 1,
          boxcolor: 'black@0.5',
          boxborderw: 6,
          x: '(w-text_w-12)',
          y: '(h-text_h-12)'
        }
      })
      .on('error', reject)
      .on('end', resolve)
      .save(tmpOutput);
  });

  const outPath = filePath.replace(/^raw-videos\//, 'videos/').replace(/\.[^.]+$/, '') + '.mp4';
  await bucket.upload(tmpOutput, {
    destination: outPath,
    contentType: 'video/mp4',
    metadata: { metadata: { watermarked: 'true', petId: petId || '' } }
  });

  // Append a long-lived signed URL to Firestore
  const file = bucket.file(outPath);
  const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5 });

  if (petId) {
    const db = admin.firestore();
    try {
      await db.collection('pets').doc(petId).update({
        videos: admin.firestore.FieldValue.arrayUnion(signedUrl)
      });
    } catch (e) {
      console.error('firestore update failed:', e);
    }
  }

  try { require('fs').unlinkSync(tmpInput); } catch {}
  try { require('fs').unlinkSync(tmpOutput); } catch {}
});
