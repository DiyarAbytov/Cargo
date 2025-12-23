// import axios from "axios";

// /** База API — у тебя префикс именно /api/users/ */
// const BASE = (process.env.REACT_APP_API_BASE || "https://lidercargo.kg/v1/api/users/")
//   .replace(/\/+$/, "/");

// const ACCESS_KEY = "lc_access";
// const REFRESH_KEY = "lc_refresh";

// export const authStore = {
//   get access() { return localStorage.getItem(ACCESS_KEY) || ""; },
//   set access(v) { v ? localStorage.setItem(ACCESS_KEY, v) : localStorage.removeItem(ACCESS_KEY); },
//   get refresh() { return localStorage.getItem(REFRESH_KEY) || ""; },
//   set refresh(v) { v ? localStorage.setItem(REFRESH_KEY, v) : localStorage.removeItem(REFRESH_KEY); },
//   clear() {
//     localStorage.removeItem(ACCESS_KEY);
//     localStorage.removeItem(REFRESH_KEY);
//   },
// };

// export const isAuthed = () => !!authStore.access || !!authStore.refresh;

// const api = axios.create({
//   baseURL: BASE,
//   withCredentials: false, // JWT без кук
//   timeout: 20000,
// });

// /** Подставляем Bearer */
// api.interceptors.request.use((config) => {
//   const token = authStore.access;
//   if (token) {
//     config.headers = config.headers || {};
//     if (!config.headers.Authorization) {
//       config.headers.Authorization = `Bearer ${token}`;
//     }
//   }
//   return config;
// });

// /** Короткий лог ошибок */
// function logAxiosError(error) {
//   try {
//     const m = (error?.config?.method || "").toUpperCase();
//     const u = error?.config?.url || "";
//     const s = error?.response?.status;
//     const d = error?.response?.data;
//     const msg =
//       (typeof d === "string" && d) ||
//       d?.detail ||
//       (d && Object.values(d).flat().find((v) => typeof v === "string")) ||
//       error?.message ||
//       "Неизвестная ошибка";
//     // eslint-disable-next-line no-console
//     console.error(`API error ${m} ${u}${s ? ` — ${s}` : ""}: ${msg}`);
//   } catch {
//     // eslint-disable-next-line no-console
//     console.error("API error");
//   }
// }

// /** Обновление access по refresh */
// let refreshing = null;
// async function refreshAccess() {
//   if (!authStore.refresh) throw new Error("No refresh token");
//   if (!refreshing) {
//     refreshing = api
//       .post("auth/token/refresh/", { refresh: authStore.refresh })
//       .then((r) => {
//         const newAccess = r?.data?.access || r?.data?.token || "";
//         if (!newAccess) throw new Error("No access in refresh response");
//         authStore.access = newAccess;
//         return newAccess;
//       })
//       .catch((e) => {
//         authStore.clear(); // refresh протух
//         throw e;
//       })
//       .finally(() => { refreshing = null; });
//   }
//   return refreshing;
// }

// api.interceptors.response.use(
//   (r) => r,
//   async (err) => {
//     const original = err?.config || {};
//     const status = err?.response?.status;

//     // Рефрешим только 401, не для самого refresh-эндпойнта, и один раз
//     if (
//       status === 401 &&
//       !original._retry &&
//       !/auth\/token\/refresh\/?$/i.test(original.url || "") &&
//       authStore.refresh
//     ) {
//       try {
//         original._retry = true;
//         const newAccess = await refreshAccess();
//         original.headers = original.headers || {};
//         original.headers.Authorization = `Bearer ${newAccess}`;
//         return api.request(original);
//       } catch {
//         // упадём ниже, почистим и пробросим ошибку
//       }
//     }

//     logAxiosError(err);
//     return Promise.reject(err);
//   }
// );

// export default api;




import axios from "axios";

/** База API — префикс /v1/api/users/ */
const BASE = (process.env.REACT_APP_API_BASE || "https://lidercargo.kg/v1/api/users/")
  .replace(/\/+$/, "/");

const ACCESS_KEY = "lc_access";
const REFRESH_KEY = "lc_refresh";

export const authStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY) || "";
  },
  set access(v) {
    v ? localStorage.setItem(ACCESS_KEY, v) : localStorage.removeItem(ACCESS_KEY);
  },

  get refresh() {
    return localStorage.getItem(REFRESH_KEY) || "";
  },
  set refresh(v) {
    v ? localStorage.setItem(REFRESH_KEY, v) : localStorage.removeItem(REFRESH_KEY);
  },

  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const isAuthed = () => !!authStore.access || !!authStore.refresh;

const api = axios.create({
  baseURL: BASE,
  withCredentials: false, // JWT без кук
  timeout: 20000,
});

/** Подставляем Bearer */
api.interceptors.request.use((config) => {
  const token = authStore.access;
  if (token) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/** Короткий лог ошибок */
function logAxiosError(error) {
  try {
    const m = (error?.config?.method || "").toUpperCase();
    const u = error?.config?.url || "";
    const s = error?.response?.status;
    const d = error?.response?.data;
    const msg =
      (typeof d === "string" && d) ||
      d?.detail ||
      (d && Object.values(d).flat().find((v) => typeof v === "string")) ||
      error?.message ||
      "Неизвестная ошибка";

    // eslint-disable-next-line no-console
    console.error(`API error ${m} ${u}${s ? ` — ${s}` : ""}: ${msg}`);
  } catch {
    // eslint-disable-next-line no-console
    console.error("API error");
  }
}

/** Обновление access по refresh */
let refreshing = null;

async function refreshAccess() {
  if (!authStore.refresh) throw new Error("No refresh token");

  if (!refreshing) {
    refreshing = api
      .post("auth/token/refresh/", { refresh: authStore.refresh })
      .then((r) => {
        const newAccess = r?.data?.access || r?.data?.token || "";
        if (!newAccess) throw new Error("No access in refresh response");
        authStore.access = newAccess;
        return newAccess;
      })
      .catch((e) => {
        authStore.clear(); // refresh протух
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }

  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err?.config || {};
    const status = err?.response?.status;

    // Рефрешим только 401, не для самого refresh-эндпойнта, и один раз
    if (
      status === 401 &&
      !original._retry &&
      !/auth\/token\/refresh\/?$/i.test(original.url || "") &&
      authStore.refresh
    ) {
      try {
        original._retry = true;
        const newAccess = await refreshAccess();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api.request(original);
      } catch {
        // упадём ниже
      }
    }

    logAxiosError(err);
    return Promise.reject(err);
  }
);

export default api;
