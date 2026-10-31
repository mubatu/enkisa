import qrcode from "qrcode-generator";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MIN_LENGTH = 2;
const CODE_RE = /^[a-z0-9-]{1,32}$/;
const MAX_URL_LENGTH = 2048;

// Static assets and API paths that a short code must never shadow.
const RESERVED = new Set(["admin", "api", "index", "favicon", "robots"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith("/api/")) return await handleApi(request, env, url);
      if (request.method === "GET" || request.method === "HEAD") {
        return await handleRedirect(request, env, path);
      }
      return json({ error: "İzin verilmeyen istek." }, 405);
    } catch (err) {
      console.error(err);
      return json({ error: "Sunucu hatası." }, 500);
    }
  },
};

// ---------- Redirect ----------

async function handleRedirect(request, env, path) {
  const code = path.slice(1).replace(/\/$/, "").toLowerCase();
  if (!CODE_RE.test(code)) return notFound();

  // HEAD requests (link previews, uptime checks) don't count as clicks.
  const row =
    request.method === "GET"
      ? await env.DB.prepare("UPDATE links SET clicks = clicks + 1 WHERE code = ? RETURNING url")
          .bind(code)
          .first()
      : await env.DB.prepare("SELECT url FROM links WHERE code = ?").bind(code).first();

  if (!row) return notFound();

  // 302 instead of 301 so browsers don't cache it: edits and click counts keep working.
  return new Response(null, {
    status: 302,
    headers: { Location: row.url, "Cache-Control": "no-store" },
  });
}

// ---------- API ----------

async function handleApi(request, env, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const resource = parts[1];
  const code = parts[2]?.toLowerCase();

  if (resource === "qr" && code && request.method === "GET") {
    return qrSvg(`${url.origin}/${code}`);
  }

  if (resource !== "links") return json({ error: "Bulunamadı." }, 404);

  if (!code && request.method === "POST") return createLink(request, env, url);

  // Everything else is admin-only.
  const denied = await checkAdmin(request, env);
  if (denied) return denied;

  if (!code && request.method === "GET") return listLinks(env);
  if (code && request.method === "PATCH") return updateLink(request, env, url, code);
  if (code && request.method === "DELETE") return deleteLink(env, code);

  return json({ error: "İzin verilmeyen istek." }, 405);
}

async function createLink(request, env, url) {
  if (env.CREATE_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const { success } = await env.CREATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Çok fazla istek. Biraz bekleyip tekrar dene." }, 429);
  }

  const body = await readJson(request);
  if (!body) return json({ error: "Geçersiz istek." }, 400);

  const target = validateUrl(body.url, url);
  if (target.error) return json({ error: target.error }, 400);

  const custom = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";

  if (custom) {
    if (!CODE_RE.test(custom)) {
      return json({ error: "Özel ad sadece küçük harf, rakam ve tire içerebilir (en fazla 32 karakter)." }, 400);
    }
    if (RESERVED.has(custom)) return json({ error: "Bu ad kullanılamaz." }, 400);

    const { meta } = await env.DB.prepare(
      "INSERT INTO links (code, url, custom) VALUES (?, ?, 1) ON CONFLICT (code) DO NOTHING",
    )
      .bind(custom, target.url)
      .run();
    if (!meta.changes) return json({ error: "Bu ad zaten alınmış." }, 409);

    return json(linkResponse(url, custom, target.url), 201);
  }

  // Same URL shortened before: hand back the existing code instead of using up a new one.
  const existing = await env.DB.prepare("SELECT code FROM links WHERE url = ? AND custom = 0 LIMIT 1")
    .bind(target.url)
    .first();
  if (existing) return json(linkResponse(url, existing.code, target.url), 200);

  // Take the next sequence number; skip codes already taken by a custom name or reserved.
  for (let attempt = 0; attempt < 100; attempt++) {
    const { value } = await env.DB.prepare(
      "UPDATE counter SET value = value + 1 WHERE id = 1 RETURNING value - 1 AS value",
    ).first();
    const code = encode(value);
    if (RESERVED.has(code)) continue;

    const { meta } = await env.DB.prepare(
      "INSERT INTO links (code, url) VALUES (?, ?) ON CONFLICT (code) DO NOTHING",
    )
      .bind(code, target.url)
      .run();
    if (meta.changes) return json(linkResponse(url, code, target.url), 201);
  }

  return json({ error: "Kod üretilemedi, tekrar dene." }, 500);
}

async function listLinks(env) {
  const { results } = await env.DB.prepare(
    "SELECT code, url, clicks, custom, created_at FROM links ORDER BY created_at DESC, rowid DESC",
  ).all();
  return json({ links: results });
}

async function updateLink(request, env, url, code) {
  const body = await readJson(request);
  if (!body) return json({ error: "Geçersiz istek." }, 400);

  const target = validateUrl(body.url, url);
  if (target.error) return json({ error: target.error }, 400);

  const { meta } = await env.DB.prepare("UPDATE links SET url = ? WHERE code = ?").bind(target.url, code).run();
  if (!meta.changes) return json({ error: "Link bulunamadı." }, 404);

  return json(linkResponse(url, code, target.url));
}

async function deleteLink(env, code) {
  // Deleted auto codes are never handed out again: the counter only moves forward.
  const { meta } = await env.DB.prepare("DELETE FROM links WHERE code = ?").bind(code).run();
  if (!meta.changes) return json({ error: "Link bulunamadı." }, 404);
  return json({ ok: true });
}

// ---------- Helpers ----------

// Bijective numbering by length: 0 → "aa", 1295 → "99", 1296 → "aaa", …
function encode(n) {
  let length = MIN_LENGTH;
  let block = ALPHABET.length ** length;
  while (n >= block) {
    n -= block;
    length++;
    block *= ALPHABET.length;
  }

  let code = "";
  for (let i = 0; i < length; i++) {
    code = ALPHABET[n % ALPHABET.length] + code;
    n = Math.floor(n / ALPHABET.length);
  }
  return code;
}

function validateUrl(raw, self) {
  if (typeof raw !== "string" || !raw.trim()) return { error: "Bir link gir." };

  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  if (value.length > MAX_URL_LENGTH) return { error: "Link çok uzun." };

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "Geçerli bir link değil." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Sadece http ve https linkleri kısaltılabilir." };
  }
  if (parsed.host === self.host) return { error: "Zaten kısa bir link." };

  return { url: parsed.href };
}

async function checkAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return json({ error: "Yönetim kapalı: ADMIN_PASSWORD tanımlı değil." }, 403);

  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";

  // Compare hashes so lengths match and the comparison is constant-time.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(env.ADMIN_PASSWORD)),
  ]);
  if (!crypto.subtle.timingSafeEqual(a, b)) return json({ error: "Şifre yanlış." }, 401);

  return null;
}

function linkResponse(self, code, url) {
  return { code, url, short: `${self.origin}/${code}` };
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return new Response(qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true }), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function notFound() {
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>Bulunamadı · enkısa</title><link rel="icon" type="image/png" sizes="64x64" href="/favicon.png"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cascadia+Code:wght@400;600&display=swap">
<link rel="stylesheet" href="/style.css"></head>
<body><main class="notfound"><div><a class="brand small" href="/"><span>enkısa</span></a>
<p>Bu link bulunamadı.</p><a href="/">Yeni link kısalt</a></div></main></body></html>`;
  return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
