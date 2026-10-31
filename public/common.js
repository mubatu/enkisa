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

// Copies text and briefly swaps the button's copy icon for a check mark.
async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  clearTimeout(button._copyTimer);
  button.classList.add("done");
  button._copyTimer = setTimeout(() => button.classList.remove("done"), 1500);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const SVG = (body, extra = "") =>
  `<svg ${extra} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  copy:
    SVG('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', 'class="i-copy"') +
    SVG('<path d="M20 6 9 17l-5-5"/>', 'class="i-check" stroke-width="2.5"'),
  qr: SVG(
    '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  ),
};

function iconButton(name, label) {
  const button = el("button", { type: "button", className: "icon-btn sm", title: label, innerHTML: ICONS[name] });
  button.setAttribute("aria-label", label);
  return button;
}

// Renders the QR SVG into an <img>.
function renderQr(container, code) {
  const img = el("img", { src: "/api/qr/" + encodeURIComponent(code), alt: "QR kod: " + location.host + "/" + code });
  container.replaceChildren(img);
}
