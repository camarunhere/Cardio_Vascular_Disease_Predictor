const TOKEN_KEY = "cvd_token";
const USER_KEY = "cvd_user";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};
export const storeSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export async function api(path, { method = "GET", body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // Session expired or invalid: clear it and return to the login page.
    if (res.status === 401 && token) {
      clearSession();
      window.location.reload();
      return new Promise(() => {}); // never resolves — page is reloading
    }
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail) && data.detail[0]?.msg)
        detail = data.detail[0].msg;
    } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json();
}

export async function downloadPdf(path, filename) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (res.status === 401) {
    clearSession();
    window.location.reload();
    return;
  }
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
