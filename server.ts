import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { seedArticles } from "./data/articles";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

  return res.json({ success: true, articles: selected, source: "simplify-independent-news-engine" });
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
    <title>Simplify Daily</title>
    <link>${baseUrl}</link>
    <description>News, jobs, entertainment, and verified scholarships from Simplify Daily.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>`;

  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(xml);
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Simplify Daily backend API running on port ${PORT}`);
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
