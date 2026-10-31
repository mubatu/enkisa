# enkisa

[enkisa.tr](https://enkisa.tr) — minimal link kısaltıcı. Cloudflare Workers + D1 üzerinde çalışır, ücretsiz katman bu kullanım için fazlasıyla yeterli.

- Herkes şifresiz link kısaltabilir (IP başına dakikada 10 link).
- Kodlar sıralı, iki haneden başlar: `aa`, `ab`, … `99`, sonra `aaa`, … Sadece küçük harf ve rakam.
- İstersen özel ad: `/cv`, `/menu`.
- Her link için QR kod (PNG indirilebilir).
- Yönetim (liste, tıklama sayıları, hedefi düzenleme, silme) yönetici şifresiyle.
- Silinen otomatik kodlar bir daha verilmez, eski bir link yanlışlıkla başka yere gitmez.

## Yerelde çalıştırma

```bash
npm install
cp .dev.vars.example .dev.vars   # içindeki şifreyi değiştir
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

## Yayına alma (ilk sefer)

```bash
npx wrangler login
npx wrangler d1 create enkisa
```

Son komutun verdiği `database_id` değerini `wrangler.jsonc` içindeki `database_id` alanına yaz. Sonra:

```bash
npm run db:migrate
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

Servis `https://enkisa.tr` adresinde açılır. `workers.dev` adresi `wrangler.jsonc` içinde kapalı; domain bağlamadan denemek için `workers_dev` değerini `true` yap.

## Domain bağlama (enkisa.tr)

`.tr` Cloudflare'den satılmıyor, domain bir Türk kayıt kuruluşundan alınıyor. DNS'i Cloudflare'e taşımak için:

1. Cloudflare panelinde **Add a domain** → `enkisa.tr` → Free plan.
2. Cloudflare'in verdiği iki nameserver adresini kayıt kuruluşunun panelinde domain'in DNS sunucuları olarak gir.
3. Cloudflare domain'i "Active" gösterince `wrangler.jsonc` içine ekle ve deploy et:

```jsonc
"routes": [{ "pattern": "enkisa.tr", "custom_domain": true }]
```

## Güncellemeler

Yayına alma GitHub üzerinden yapılır: `main` dalına push edilen her commit Cloudflare Workers Builds tarafından otomatik olarak deploy edilir. Elle `npm run deploy` kullanma, yoksa canlıdaki sürüm GitHub'dakinden farklı olur.

Workers Builds ayarları (Cloudflare panelinde **Workers & Pages → enkisa → Settings → Build**):

| Ayar | Değer |
| --- | --- |
| Repository | `mubatu/enkisa` |
| Production branch | `main` |
| Build command | boş |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

Veritabanı şeması değişirse migration otomatik uygulanmaz: `migrations/` altına yeni dosyayı ekle, push etmeden önce `npm run db:migrate` çalıştır.

## Yapı

| Dosya | İçerik |
| --- | --- |
| `src/index.js` | Yönlendirme, API, kod üretimi, QR |
| `public/index.html` | Arayüz (tek dosya) |
| `migrations/` | D1 şeması |
| `wrangler.jsonc` | Cloudflare ayarları |
