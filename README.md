# enkisa

[enkisa.tr](https://enkisa.tr) — a minimal URL shortener running on Cloudflare Workers + D1.

- Anyone can shorten links without an account (rate limited to 10 links per minute per IP).
- Codes are sequential and start at two characters: `aa`, `ab`, … `99`, then `aaa`, … Lowercase letters and digits only.
- Optional custom aliases such as `/cv` or `/menu`.
- A QR code for every link, downloadable as PNG.
- Password-protected admin at `/admin`: list links, see click counts, edit targets, delete.
- Deleted codes are never reused, so an old link can't silently point somewhere new.
