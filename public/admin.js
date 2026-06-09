const statusLabels = {
  available: "現貨",
  reserved: "保留",
  sold: "完售"
};

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

let items = [];
let authenticated = false;

function formatPrice(value) {
  return `NT$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
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
  renderAdminList();
}

async function checkLogin() {
  const data = await api("/api/me");
  authenticated = data.authenticated;
  renderAuthState();
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
    await loadItems();
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
  setMessage(loginMessage, error.message, "error");
});
