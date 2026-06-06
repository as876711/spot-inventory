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
const form = document.querySelector("#itemForm");
const adminList = document.querySelector("#adminList");
const cancelEditButton = document.querySelector("#cancelEditButton");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const adminPanel = document.querySelector("#adminPanel");
const logoutButton = document.querySelector("#logoutButton");
const uploadInput = document.querySelector("#uploadInput");
const imageInput = document.querySelector("#imageInput");
const formMessage = document.querySelector("#formMessage");
const lineLinks = ["#heroLineLink", "#tradeLineLink", "#footerLineLink"].map((selector) => document.querySelector(selector));

let activeFilter = "all";
let items = [];
let authenticated = false;

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
  render();
}

async function checkLogin() {
  const data = await api("/api/me");
  authenticated = data.authenticated;
  renderAuthState();
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
            <span>${escapeHtml(item.createdAt)}</span>
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

function renderAdminList() {
  if (!authenticated) {
    adminList.innerHTML = "";
    return;
  }
  adminList.innerHTML = items.map((item) => `
    <article class="admin-item">
      <img src="${escapeHtml(item.image)}" alt="">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.category)} · ${statusLabels[item.status]} · ${formatPrice(Number(item.price))}</p>
      </div>
      <div class="admin-actions">
        <button class="icon-button" type="button" title="編輯 ${escapeHtml(item.name)}" data-edit="${item.id}">✎</button>
        <button class="icon-button danger" type="button" title="刪除 ${escapeHtml(item.name)}" data-delete="${item.id}">×</button>
      </div>
    </article>
  `).join("");
}

function renderAuthState() {
  loginForm.hidden = authenticated;
  adminPanel.hidden = !authenticated;
  logoutButton.hidden = !authenticated;
  renderAdminList();
}

function clearForm() {
  form.reset();
  document.querySelector("#itemId").value = "";
  document.querySelector("#statusInput").value = "available";
  formMessage.textContent = "";
  formMessage.className = "form-message";
}

function setMessage(element, message, type) {
  element.textContent = message;
  element.className = `form-message ${type || ""}`.trim();
}

function render() {
  renderProducts();
  renderAdminList();
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

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "登入中...", "");
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#usernameInput").value,
        password: document.querySelector("#passwordInput").value
      })
    });
    authenticated = true;
    setMessage(loginMessage, "", "");
    renderAuthState();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: JSON.stringify({}) });
  authenticated = false;
  clearForm();
  renderAuthState();
});

uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files[0];
  if (!file) return;
  const payload = new FormData();
  payload.append("image", file);
  setMessage(formMessage, "圖片上傳中...", "");
  try {
    const data = await api("/api/upload", { method: "POST", body: payload });
    imageInput.value = data.url;
    setMessage(formMessage, "圖片已上傳", "success");
  } catch (error) {
    setMessage(formMessage, error.message, "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.querySelector("#itemId").value;
  const item = {
    name: document.querySelector("#nameInput").value.trim(),
    category: document.querySelector("#categoryInput").value,
    status: document.querySelector("#statusInput").value,
    price: Number(document.querySelector("#priceInput").value),
    image: imageInput.value.trim(),
    condition: document.querySelector("#conditionInput").value.trim()
  };

  try {
    await api(id ? `/api/items/${id}` : "/api/items", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(item)
    });
    clearForm();
    await loadItems();
    setMessage(formMessage, "商品已儲存", "success");
  } catch (error) {
    setMessage(formMessage, error.message, "error");
  }
});

adminList.addEventListener("click", async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;

  if (editId) {
    const item = items.find((entry) => entry.id === editId);
    document.querySelector("#itemId").value = item.id;
    document.querySelector("#nameInput").value = item.name;
    document.querySelector("#categoryInput").value = item.category;
    document.querySelector("#statusInput").value = item.status;
    document.querySelector("#priceInput").value = item.price;
    imageInput.value = item.image;
    document.querySelector("#conditionInput").value = item.condition;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (deleteId) {
    const item = items.find((entry) => entry.id === deleteId);
    const confirmed = window.confirm(`確定刪除「${item.name}」？`);
    if (!confirmed) return;
    await api(`/api/items/${deleteId}`, { method: "DELETE" });
    await loadItems();
  }
});

cancelEditButton.addEventListener("click", clearForm);

Promise.all([loadItems(), checkLogin()]).catch((error) => {
  emptyState.hidden = false;
  emptyState.textContent = error.message;
});
