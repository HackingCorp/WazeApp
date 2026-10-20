#!/usr/bin/env node
/**
 * Baileys 7.0.0-rc13: media sent to WhatsApp channels never shows up.
 *
 * Channel media must be uploaded through the /newsletter/newsletter-* CDN
 * paths (with server-side thumbnail generation) and sent without a `url`,
 * carrying the thumbnail the CDN returns; the plaintext node also needs a
 * `mediatype` attribute. Baileys uses the regular /mms/* paths, WhatsApp
 * answers ACK 479 and the post stays invisible. Upstream fix: PR #2434
 * (issue #2199), not released yet.
 *
 * Runs as npm postinstall. Every replacement is anchored on the exact rc13
 * text: a Baileys upgrade that changes it makes this script fail loudly,
 * which is the point — better a broken install than silent channel posts.
 */
const fs = require("fs");
const path = require("path");

const lib = path.join(__dirname, "..", "node_modules", "@whiskeysockets", "baileys", "lib");
if (!fs.existsSync(lib)) {
  console.log("[baileys-newsletter-media] Baileys not installed, nothing to patch");
  process.exit(0);
}

let patched = 0;
let skipped = 0;
let failed = 0;

function patch(file, label, already, from, to) {
  const p = path.join(lib, file);
  let s = fs.readFileSync(p, "utf8");
  if (s.includes(already)) {
    skipped++;
    return;
  }
  if (!s.includes(from)) {
    failed++;
    console.error(`[baileys-newsletter-media] ANCHOR NOT FOUND for "${label}" in ${file}`);
    return;
  }
  s = s.replace(from, to);
  fs.writeFileSync(p, s, "utf8");
  patched++;
  console.log(`[baileys-newsletter-media] patched: ${label}`);
}

// 1) CDN paths for channel media
patch(
  "Defaults/index.js",
  "NEWSLETTER_MEDIA_PATH_MAP",
  "NEWSLETTER_MEDIA_PATH_MAP",
  `    'biz-cover-photo': '/pps/biz-cover-photo'
};`,
  `    'biz-cover-photo': '/pps/biz-cover-photo'
};
export const NEWSLETTER_MEDIA_PATH_MAP = {
    image: '/newsletter/newsletter-image',
    video: '/newsletter/newsletter-video',
    document: '/newsletter/newsletter-document',
    audio: '/newsletter/newsletter-audio',
    gif: '/newsletter/newsletter-gif',
    ptt: '/newsletter/newsletter-ptt',
    ptv: '/newsletter/newsletter-ptv',
    sticker: '/newsletter/newsletter-sticker-pack',
    'thumbnail-link': '/newsletter/newsletter-image'
};`,
);

// 2) upload: use those paths when asked, ask for a server thumbnail, return it
patch(
  "Utils/messages-media.js",
  "import NEWSLETTER_MEDIA_PATH_MAP",
  "NEWSLETTER_MEDIA_PATH_MAP } from '../Defaults/index.js'",
  "import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP } from '../Defaults/index.js';",
  "import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP } from '../Defaults/index.js';",
);
patch(
  "Utils/messages-media.js",
  "upload signature accepts newsletter flag",
  "timeoutMs, newsletter }",
  "    return async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) => {",
  "    return async (filePath, { mediaType, fileEncSha256B64, timeoutMs, newsletter }) => {",
);
patch(
  "Utils/messages-media.js",
  "upload URL per channel paths + server_thumb_gen",
  "server_thumb_gen",
  "            const url = `https://${hostname}${MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;",
  "            const mediaPath = newsletter ? (NEWSLETTER_MEDIA_PATH_MAP[mediaType] || MEDIA_PATH_MAP[mediaType]) : MEDIA_PATH_MAP[mediaType];\n            const url = `https://${hostname}${mediaPath}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}${newsletter ? '&server_thumb_gen=1' : ''}`;",
);
patch(
  "Utils/messages-media.js",
  "upload returns thumbnail info",
  "thumbnail_direct_path",
  `                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        meta_hmac: result.meta_hmac,
                        fbid: result.fbid,
                        ts: result.ts
                    };`,
  `                    urls = {
                        mediaUrl: result.url,
                        directPath: result.direct_path,
                        meta_hmac: result.meta_hmac,
                        fbid: result.fbid,
                        ts: result.ts
                    };
                    if (newsletter && result.thumbnail_info) {
                        urls.thumbnailDirectPath = result.thumbnail_info.thumbnail_direct_path;
                        urls.thumbnailSha256 = result.thumbnail_info.thumbnail_sha256;
                    }`,
);

// 3) message building for channels: upload as newsletter, no url, thumbnail from CDN
patch(
  "Utils/messages.js",
  "channel media upload flagged as newsletter",
  "newsletter: true",
  `        const { mediaUrl, directPath } = await options.upload(filePath, {
            fileEncSha256B64: fileSha256B64,
            mediaType: mediaType,
            timeoutMs: options.mediaUploadTimeoutMs
        });`,
  `        const uploadResult = await options.upload(filePath, {
            fileEncSha256B64: fileSha256B64,
            mediaType: mediaType,
            timeoutMs: options.mediaUploadTimeoutMs,
            newsletter: true
        });
        const directPath = uploadResult.directPath;
        const thumbnailDirectPath = uploadResult.thumbnailDirectPath;
        const thumbnailSha256 = uploadResult.thumbnailSha256;`,
);
patch(
  "Utils/messages.js",
  "channel media message without url, with thumbnail",
  "thumbnailDirectPath && { thumbnailDirectPath }",
  `            [\`\${mediaType}Message\`]: MessageTypeProto[mediaType].fromObject({
                url: mediaUrl,
                directPath,
                fileSha256,
                fileLength,
                ...uploadData,
                media: undefined
            })`,
  `            [\`\${mediaType}Message\`]: MessageTypeProto[mediaType].fromObject({
                url: null,
                directPath,
                fileSha256,
                fileEncSha256: fileSha256,
                fileLength,
                ...(thumbnailDirectPath && { thumbnailDirectPath }),
                ...(thumbnailSha256 && { thumbnailSha256 }),
                ...uploadData,
                media: undefined
            })`,
);

// 4) stanza: tell WhatsApp what kind of media the plaintext carries
patch(
  "Socket/messages-send.js",
  "plaintext node carries mediatype",
  "attrs: mediaType ? { mediatype: mediaType } : {}",
  `                    tag: 'plaintext',
                    attrs: {},
                    content: bytes`,
  `                    tag: 'plaintext',
                    attrs: mediaType ? { mediatype: mediaType } : {},
                    content: bytes`,
);

console.log(`[baileys-newsletter-media] ${patched} patched, ${skipped} already applied, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
