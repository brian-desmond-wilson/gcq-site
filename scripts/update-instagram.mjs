// Copies the team's newest Instagram posts into the site.
//
// Reads the Behold feed (BEHOLD_FEED_URL, e.g. https://feeds.behold.so/<id>), saves each post's
// picture under assets/instagram/ and writes data/instagram.json, which the home page reads.
// Run once a day by .github/workflows/instagram.yml, so the site asks Behold once a day however
// many people visit (Behold's free plan counts every feed request against 1,200 a month), and
// the pictures keep showing even if Behold is down or paused.
//
// Leaves everything as it was when the feed can't be read or has no posts.
// Usage: BEHOLD_FEED_URL=https://feeds.behold.so/<id> node scripts/update-instagram.mjs

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FEED_URL = process.env.BEHOLD_FEED_URL;
const MAX_POSTS = 6;
const ROOT = new URL("..", import.meta.url).pathname;
const DATA_FILE = join(ROOT, "data/instagram.json");
const IMAGE_DIR = join(ROOT, "assets/instagram");
const PROFILE_URL = "https://www.instagram.com/gymclassqueeroes/";

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!FEED_URL) {
  // Not set up yet: the home page shows only the Follow card until the secret is added.
  console.log("BEHOLD_FEED_URL isn't set; nothing to do.");
  process.exit(0);
}
if (!/^https:\/\/feeds\.behold\.so\/[A-Za-z0-9]+\/?$/.test(FEED_URL)) {
  fail("Set BEHOLD_FEED_URL to the feed's https://feeds.behold.so/... address.");
}

const response = await fetch(FEED_URL, { headers: { Accept: "application/json" } });
if (!response.ok) fail(`Behold answered ${response.status}; keeping the current posts.`);
const feed = await response.json();
if (!Array.isArray(feed.posts) || feed.posts.length === 0) {
  fail("The feed has no posts; keeping the current posts.");
}

const typeOf = (post) =>
  post.mediaType === "VIDEO" ? "video" : post.mediaType === "CAROUSEL_ALBUM" ? "carousel" : "image";
const safeId = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, "");
const trim = (text, max) => {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
};

await mkdir(IMAGE_DIR, { recursive: true });
const posts = [];
for (const post of feed.posts) {
  if (posts.length === MAX_POSTS) break;
  if (!/^https:\/\/www\.instagram\.com\//.test(post.permalink ?? "")) continue;
  // Medium is up to 700 pixels, plenty for a third of the page.
  const size = post.sizes?.medium ?? post.sizes?.large ?? post.sizes?.small;
  if (!size?.mediaUrl) continue;
  const id = safeId(post.id);
  const ext = new URL(size.mediaUrl).pathname.match(/\.(webp|jpe?g|png)$/i)?.[1]?.toLowerCase() ?? "webp";
  const file = `${id}.${ext}`;
  const picture = await fetch(size.mediaUrl);
  if (!picture.ok) {
    console.warn(`Skipping ${post.permalink}: picture answered ${picture.status}.`);
    continue;
  }
  await writeFile(join(IMAGE_DIR, file), Buffer.from(await picture.arrayBuffer()));
  posts.push({
    permalink: post.permalink,
    type: typeOf(post),
    is_reel: Boolean(post.isReel),
    timestamp: post.timestamp,
    image: `/assets/instagram/${file}`,
    width: size.width,
    height: size.height,
    alt: trim(post.altText, 200) || `${typeOf(post) === "video" ? "Video" : "Photo"} by Gym Class Queeroes`,
    caption: trim(post.prunedCaption ?? post.caption, 160),
  });
}
if (posts.length === 0) fail("No post had a usable picture; keeping the current posts.");

// Pictures for posts that dropped off the feed go, so the folder holds only what's shown.
const keep = new Set(posts.map((post) => post.image.split("/").pop()));
for (const name of await readdir(IMAGE_DIR)) {
  if (!keep.has(name)) await rm(join(IMAGE_DIR, name));
}

// Only rewrite the file when the posts changed, so a quiet day makes no commit.
let previous = null;
try {
  previous = JSON.parse(await readFile(DATA_FILE, "utf8"));
} catch {}
if (previous?.source === "behold" && JSON.stringify(previous.posts) === JSON.stringify(posts)) {
  console.log("No new posts.");
  process.exit(0);
}

await mkdir(join(ROOT, "data"), { recursive: true });
await writeFile(
  DATA_FILE,
  JSON.stringify(
    { source: "behold", updated_at: new Date().toISOString(), profile_url: PROFILE_URL, posts },
    null,
    2,
  ) + "\n",
);
console.log(`Saved ${posts.length} posts.`);
