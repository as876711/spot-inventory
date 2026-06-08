const lineUrl = "https://line.me/R/ti/p/@yourline";

const statusLabels = {
  available: "可售",
  reserved: "保留",
  sold: "售出"
};

const grid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const filterButtons = document.querySelectorAll(".filter");
const lineLinks = ["#heroLineLink", "#tradeLineLink", "#footerLineLink"]
  .map((selector) => document.querySelector(selector))
  .filter(Boolean);

let activeFilter = "all";
let items = [];

lineLinks.forEach((link) => {
  link.href = lineUrl;
});

function formatPrice(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(value);
}

function buildLineLink(itemName) {
  const message = encodeURIComponent(`你好，我想詢問「${itemName}」是否還在。`);
  return `${lineUrl}?text=${message}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "伺服器發生錯誤");
  return data;
}

async function loadItems() {
  const data = await api("/api/items");
  items = data.items;
  renderProducts();
}

function getVisibleItems() {
  const query = searchInput.value.trim().toLowerCase();
  const sorted = [...items].filter((item) => {
    const matchFilter = activeFilter === "all" || item.category === activeFilter;
    const haystack = `${item.name} ${item.category} ${item.condition} ${statusLabels[item.status]}`.toLowerCase();
    return matchFilter && haystack.includes(query);
  });

  if (sortSelect.value === "priceAsc") sorted.sort((a, b) => a.price - b.price);
  if (sortSelect.value === "priceDesc") sorted.sort((a, b) => b.price - a.price);
  if (sortSelect.value === "newest") sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sorted;
}

function renderProducts() {
  const visibleItems = getVisibleItems();
  grid.innerHTML = visibleItems.map((item) => {
    const isUnavailable = item.status !== "available";
    return `
      <article class="product-card">
        <div class="product-image">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">
          <span class="status ${item.status}">${statusLabels[item.status]}</span>
        </div>
        <div class="product-body">
          <div class="product-meta">
            <span>${escapeHtml(item.category)}</span>
          </div>
          <h3 class="product-title">${escapeHtml(item.name)}</h3>
          <p class="condition">${escapeHtml(item.condition)}</p>
          <div class="price-row">
            <span class="price">${formatPrice(Number(item.price))}</span>
            <a class="line-link ${isUnavailable ? "disabled" : ""}" href="${buildLineLink(item.name)}" target="_blank" rel="noreferrer">${isUnavailable ? "已不可售" : "LINE 詢問"}</a>
          </div>
        </div>
      </article>
    `;
  }).join("");

  emptyState.hidden = visibleItems.length > 0;
  updateCounts();
}

function updateCounts() {
  document.querySelector("#countAvailable").textContent = items.filter((item) => item.status === "available").length;
  document.querySelector("#countReserved").textContent = items.filter((item) => item.status === "reserved").length;
  document.querySelector("#countSold").textContent = items.filter((item) => item.status === "sold").length;
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderProducts();
  });
});

searchInput.addEventListener("input", renderProducts);
sortSelect.addEventListener("change", renderProducts);

loadItems().catch((error) => {
  emptyState.hidden = false;
  emptyState.textContent = error.message;
});
