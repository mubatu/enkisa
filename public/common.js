// Helpers shared by the home page and /admin.

const $ = (id) => document.getElementById(id);

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

async function api(method, path, body, auth) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) headers["Authorization"] = "Bearer " + auth;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Bir hata oluştu."), { status: res.status });
  return data;
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "Kopyalandı";
    setTimeout(() => (button.textContent = old), 1500);
  } catch {}
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Renders the QR SVG into an <img>.
function renderQr(container, code) {
  const img = el("img", { src: "/api/qr/" + encodeURIComponent(code), alt: "QR kod: " + location.host + "/" + code });
  container.replaceChildren(img);
}
