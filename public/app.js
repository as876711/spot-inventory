const lineId = "@334lnlsn";
const lineUrl = `https://line.me/R/oaMessage/${encodeURIComponent(lineId)}`;

const sampleItems = [
  {
    id: "sample-1",
    name: "三麗鷗造型吊飾",
    category: "三麗鷗",
    status: "available",
    price: 180,
    image: "./images/item-1.jpg",
    tags: ["吊飾", "可售", "近新"],
    condition: "近新品況，外觀乾淨，無明顯污漬或破損。",
    createdAt: "2026-06-01T10:00:00+08:00"
  },
  {
    id: "sample-2",
    name: "吉伊卡哇小物收納包",
    category: "吉伊卡哇",
    status: "available",
    price: 220,
    image: "./images/item-2.jpg",
    tags: ["收納", "小物", "現貨"],
    condition: "少量使用痕跡，拉鍊正常，適合收納鑰匙或耳機。",
    createdAt: "2026-05-28T14:30:00+08:00"
  },
  {
    id: "sample-3",
    name: "寶可夢迷你公仔",
    category: "寶可夢",
    status: "reserved",
    price: 150,
    image: "./images/item-3.jpg",
    tags: ["公仔", "保留中"],
    condition: "展示品，底部有輕微使用痕跡，整體保存良好。",
    createdAt: "2026-05-22T09:15:00+08:00"
  },
  {
    id: "sample-4",
    name: "角色貼紙組",
    category: "其他",
    status: "available",
    price: 80,
    image: "./images/item-4.jpg",
    tags: ["貼紙", "全新"],
    condition: "未使用，外包裝完整，適合手帳或卡片裝飾。",
    createdAt: "2026-05-18T18:20:00+08:00"
  },
  {
    id: "sample-5",
    name: "毛絨玩偶吊牌款",
    category: "其他",
    status: "sold",
    price: 320,
    image: "./images/item-5.jpg",
    tags: ["玩偶", "已售出"],
    condition: "已售出，保留紀錄供參考，可詢問是否有類似商品。",
    createdAt: "2026-05-12T11:40:00+08:00"
  },
  {
    id: "sample-6",
    name: "小卡與明信片套組",
    category: "其他",
    status: "available",
    price: 120,
    image: "./images/item-6.jpg",
    tags: ["小卡", "紙品", "可售"],
    condition: "收藏保存，邊角平整，套組不拆售。",
    createdAt: "2026-05-04T16:00:00+08:00"
  }
];

const statusLabels = {
  available: "可售",
  reserved: "保留",
  sold: "售出"
};

const grid = document.querySelector("#productGrid");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const filterButtons = document.querySelectorAll("[data-filter]");
const lineLinks = ["#heroLineLink", "#tradeLineLink", "#footerLineLink"]
  .map((selector) => document.querySelector(selector))
  .filter(Boolean);

let activeFilter = "all";
let items = [];

lineLinks.forEach((link) => {
  link.href = buildLineLink("現貨商品");
});

function formatPrice(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(value);
}

function buildLineLink(itemName) {
  const message = encodeURIComponent(`你好，我想詢問「${itemName}」是否還有現貨，請問可以保留嗎？`);
  return `${lineUrl}/?${message}`;
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
  try {
    const data = await api("/api/items");
    items = Array.isArray(data.items) && data.items.length > 0 ? data.items : sampleItems;
  } catch (error) {
    items = sampleItems;
  }
  renderProducts();
}

function getVisibleItems() {
  const query = searchInput.value.trim().toLowerCase();
  const sorted = [...items].filter((item) => {
    const matchFilter = activeFilter === "all" || item.category === activeFilter;
    const haystack = `${item.name} ${item.category} ${(item.tags || []).join(" ")} ${item.condition} ${statusLabels[item.status]}`.toLowerCase();
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
    const tags = (item.tags || [])
      .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
      .join("");
    return `
      <article class="product-card ${item.status === "sold" ? "is-sold" : ""}">
        <div class="product-image">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">
          <span class="status ${item.status}">${statusLabels[item.status]}</span>
        </div>
        <div class="product-body">
          <div class="product-meta">
            <span>${escapeHtml(item.category)}</span>
          </div>
          <h3 class="product-title">${escapeHtml(item.name)}</h3>
          ${tags ? `<div class="tag-list">${tags}</div>` : ""}
          <p class="condition">${escapeHtml(item.condition)}</p>
          <div class="price-row">
            <span class="price">${formatPrice(Number(item.price))}</span>
            <a class="line-link ${isUnavailable ? "secondary" : ""}" href="${buildLineLink(item.name)}" target="_blank" rel="noreferrer">LINE 詢問這件</a>
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

loadItems();
