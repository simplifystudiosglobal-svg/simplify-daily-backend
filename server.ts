import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { seedArticles } from "./data/articles";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Persisted store for admin-synced articles, so they're visible to every visitor
// (not just the admin's own browser via localStorage) across every page. Lives at
// process.cwd() rather than __dirname since esbuild bundles this file into dist/
// and __dirname there wouldn't be a sensible place to keep runtime data.
// Caveat: Render's free tier has no persistent disk, so this file survives normal
// sleep/wake cycles but is wiped on a fresh deploy of this backend. Fine for now;
// upgrade to a real database if that becomes a problem.
const DATA_DIR = path.join(process.cwd(), "data-store");
const PUBLISHED_ARTICLES_FILE = path.join(DATA_DIR, "published-articles.json");

function loadPublishedArticles(): any[] {
  try {
    if (!fs.existsSync(PUBLISHED_ARTICLES_FILE)) return [];
    const raw = fs.readFileSync(PUBLISHED_ARTICLES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read published articles store:", err);
    return [];
  }
}

function savePublishedArticles(articles: any[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PUBLISHED_ARTICLES_FILE, JSON.stringify(articles, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write published articles store:", err);
  }
}

// Only the configured frontend origin(s) may call this API cross-origin. Comma-separated
// for multiple environments (e.g. a preview deploy + the production frontend domain).
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  })
);
app.use(express.json());

// Server-side Secret & Token Verification
// No hardcoded fallback: an unset SERVER_SECRET gets a random per-boot value instead of a
// value anyone reading the (public) source could use to forge admin tokens. The only
// downside is admin sessions won't survive a restart unless SERVER_SECRET is set for real.
const SERVER_SECRET = process.env.SERVER_SECRET || crypto.randomBytes(32).toString("hex");

function generateAdminToken(): string {
  const timestamp = Date.now();
  const signature = crypto.createHmac("sha256", SERVER_SECRET).update(`admin-${timestamp}`).digest("hex");
  return `${timestamp}.${signature}`;
}

function verifyAdminToken(token?: string): boolean {
  if (!token) return false;
  const parts = token.replace("Bearer ", "").trim().split(".");
  if (parts.length !== 2) return false;
  const [timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Re-calculate expected signature
  const expectedSignature = crypto.createHmac("sha256", SERVER_SECRET).update(`admin-${timestamp}`).digest("hex");
  return signature === expectedSignature;
}

// Server-side Admin Auth Endpoints
app.post("/api/admin/login", (req, res) => {
  const { passcode } = req.body || {};
  const input = typeof passcode === "string" ? passcode.trim() : "";
  const validPasscodes = [process.env.ADMIN_PASSCODE].filter(Boolean);

  if (input && validPasscodes.includes(input)) {
    const token = generateAdminToken();
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, error: "Invalid admin passcode" });
});

app.get("/api/admin/verify", (req, res) => {
  const authHeader = req.headers.authorization;
  const isValid = verifyAdminToken(authHeader);
  if (isValid) {
    return res.json({ success: true, authenticated: true });
  }
  return res.status(401).json({ success: false, authenticated: false });
});

// Auto-news fetch endpoint — Protected by Server-Side Admin Token Check
app.get("/api/auto-news", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!verifyAdminToken(authHeader)) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Admin authentication token required to trigger live news sync",
    });
  }

  const categoryReq = (req.query.category as string) || "All";

  let filtered = poolOfStories;
  if (categoryReq !== "All") {
    filtered = poolOfStories.filter((s) => s.category.toLowerCase() === categoryReq.toLowerCase());
  }
  if (filtered.length === 0) filtered = poolOfStories;

  // Pick up to 3 stories with unique timestamps
  const timestamp = Date.now();
  const selected = filtered.slice(0, 3).map((art, idx) => ({
    id: `auto-${timestamp}-${idx}`,
    title: art.title,
    category: art.category,
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    author: art.author,
    meta: art.meta,
    content: art.content,
    views: `${(Math.floor(Math.random() * 30) + 15) / 10}k`,
    tags: art.tags,
    image: art.image,
    thumbnailStyle: art.thumbnailStyle || "breaking",
  }));

  // Persist so these articles are visible to every visitor going forward, not just
  // stored in the syncing admin's own browser localStorage as before.
  const existingPublished = loadPublishedArticles();
  savePublishedArticles([...selected, ...existingPublished]);

  return res.json({ success: true, articles: selected, source: "simplify-independent-news-engine" });
});

// Public — every page (Home, World News, Entertainment) fetches this on load and merges
// the results with its own build-time seed content, so admin-synced articles show up for
// all visitors rather than only the browser that ran the sync.
app.get("/api/articles", (_req, res) => {
  return res.json({ success: true, articles: loadPublishedArticles() });
});

// Admin-only removal, since there's no other way to walk back an article once it's
// been synced and persisted server-side.
app.delete("/api/admin/articles/:id", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!verifyAdminToken(authHeader)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const { id } = req.params;
  const existing = loadPublishedArticles();
  const filtered = existing.filter((a) => a.id !== id);
  savePublishedArticles(filtered);
  return res.json({ success: true, removed: existing.length !== filtered.length });
});

// RSS feed metadata is derived from the same seed article data the frontend renders,
// so the two never drift out of sync. Keep this file's copy of data/articles.ts updated
// alongside the frontend repo's copy if article content changes.
const feedArticles = seedArticles
  .map((a: any) => ({
    id: String(a.id),
    title: a.title,
    category: a.category,
    date: a.date,
    author: a.author,
    meta: a.meta,
  }))
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const escapeXml = (str: string) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

app.get("/rss.xml", (req, res) => {
  const baseUrl = process.env.FRONTEND_ORIGIN?.split(",")[0]?.trim() || `${req.protocol}://${req.get("host")}`;
  const items = feedArticles
    .map((a) => {
      const link = `${baseUrl}/article/${encodeURIComponent(a.id)}`;
      const pubDate = new Date(a.date).toUTCString();
      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <description>${escapeXml(a.meta)}</description>
      <category>${escapeXml(a.category)}</category>
      <author>${escapeXml(a.author)}</author>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Simplify Feed</title>
    <link>${baseUrl}</link>
    <description>News, jobs, entertainment, and verified scholarships from Simplify Feed.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>`;

  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(xml);
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Simplify Feed backend API running on port ${PORT}`);
});

// Static pool of stories the admin "Sync" buttons pick from — kept at the bottom since it's
// long; see the frontend repo's src/data/articles.ts for the full seed article set.
const poolOfStories = seedArticles.map((a: any) => ({
  title: a.title,
  category: a.category,
  author: a.author,
  meta: a.meta,
  content: a.content,
  tags: a.tags,
  image: a.image,
  thumbnailStyle: a.thumbnailStyle,
}));
