import React, { useMemo, useState } from "react";
import api, { authStore } from "../../Api/Api";
import logo from "../../logo/logo.png";

const LOGIN_URL = "auth/login/";
const USER_KEY = "lc_user";

const norm = (s) => String(s ?? "").trim();
const phoneKG = /^\+996\d{9}$/;

/* icons */
const Eye = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOff = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M3 3l18 18M10.6 10.6a3 3 0 104.24 4.24M9.9 4.24A11.1 11.1 0 0123 12c0 1.63-4 7-11 7a12.4 12.4 0 01-4.2-.72M5.13 5.13A12 12 0 001 12c0 1.63 4 7 11 7"/>
  </svg>
);

/* qs utils */
const getQS = () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const safeNext = (emp) => {
  const allowed = ["/", "/parcels", "/profile"];
  if (emp) allowed.push("/parcelsscan");
  const q = getQS().get("next") || "";
  return allowed.includes(q) ? q : "";
};

/* phone normalize */
const sanitizePhone = (v) => {
  let s = String(v).replace(/[^\d+]/g, "");
  if (!s.startsWith("+")) s = `+${s}`;
  if (!s.startsWith("+996")) {
    const digits = s.replace(/\D/g, "");
    const tail = digits.replace(/^996/, "");
    s = `+996${tail}`;
  }
  if (s.length > 13) s = s.slice(0, 13);
  return s;
};

const translateAuthError = (detail) => {
  const d = String(detail || "").toLowerCase();
  if (d.includes("no active account") || d.includes("unable to log in") || d.includes("invalid credentials") || d.includes("неверн"))
    return "Неверный телефон или пароль.";
  if (d.includes("inactive") || d.includes("disabled") || d.includes("not active"))
    return "Аккаунт не активирован.";
  if (d.includes("too many") || d.includes("throttle") || d.includes("rate limit"))
    return "Слишком много попыток. Попробуйте позже.";
  return detail || "Не удалось выполнить вход.";
};

const Login = () => {
  const [form, setForm] = useState({ phone: "+996", password: "" });
  const [seePwd, setSeePwd] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  const setUserLocal = (u) => {
    try { localStorage.setItem(USER_KEY, JSON.stringify(u || null)); } catch {}
  };

  const setVal = (k, v) => setForm((s) => ({ ...s, [k]: k === "phone" ? sanitizePhone(v) : v }));

  const validate = () => {
    const e = {};
    const phone = norm(form.phone);
    if (!phone) e.phone = "Укажите телефон.";
    else if (!phoneKG.test(phone)) e.phone = "Формат: +996XXXXXXXXX.";
    if (!form.password) e.password = "Укажите пароль.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const redirect = (to) => { if (typeof window !== "undefined") window.location.href = to; };

  const submit = async (ev) => {
    ev.preventDefault();
    setSuccess("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      // запрос логина
      const { data } = await api.post(LOGIN_URL, {
        phone: norm(form.phone),
        password: form.password,
      });

      // сохраняем токены
      const access = data?.access || data?.token || data?.access_token || "";
      const refresh = data?.refresh || data?.refresh_token || "";
      if (access) authStore.access = access;
      if (refresh) authStore.refresh = refresh;

      // сохраняем пользователя из ответа
      const user = data?.user || null;
      if (user) setUserLocal(user);

      setSuccess("Вход выполнен.");

      // правило редиректа:
      // если is_employee === true -> /parcelsscan (всегда приоритетно)
      const emp = Boolean(user?.is_employee);
      if (emp) {
        redirect("/parcelsscan");
        return;
      }

      // иначе уважаем безопасный next или ведём на /
      const next = safeNext(false);
      redirect("/");
    } catch (err) {
      const d = err?.response?.data || {};
      const topDetail = d?.detail || d?.non_field_errors?.[0];

      const e = {};
      if (d.phone) e.phone = Array.isArray(d.phone) ? d.phone[0] : String(d.phone);
      if (d.password) e.password = Array.isArray(d.password) ? d.password[0] : String(d.password);

      if (topDetail) {
        const ru = translateAuthError(topDetail);
        e._ = ru;
        if (ru.startsWith("Неверный")) {
          e.phone = e.phone || "";
          e.password = e.password || "";
        }
      }
      if (!Object.keys(e).length) e._ = translateAuthError(err?.message);
      setErrors(e);
    } finally {
      setSubmitting(false);
    }
  };

  // reauth заметка (чисто информативно)
  const reauth = useMemo(() => getQS().get("reauth") === "1", []);

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__logo"><img src={logo} alt="Lider Cargo" /></div>

        <form className="login__form" onSubmit={submit} noValidate>
          {reauth && <div className="login__muted" style={{marginBottom: 8}}>Пожалуйста, войдите снова.</div>}
          {success && <div className="login__success">{success}</div>}
          {errors._ && <div className="login__alert">{errors._}</div>}

          {/* phone */}
          <div className="login__field">
            <div className="login__control">
              <input
                className={`login__input ${(errors.phone || errors._?.startsWith?.("Неверный")) ? "is-invalid" : ""}`}
                type="tel"
                inputMode="tel"
                maxLength={13}
                value={form.phone}
                onChange={(e) => setVal("phone", e.target.value)}
                placeholder="Телефон"
                autoComplete="tel"
              />
            </div>
            {errors.phone && <div className="login__error">{errors.phone}</div>}
          </div>

          {/* password */}
          <div className="login__field">
            <div className="login__control">
              <input
                className={`login__input ${(errors.password || errors._?.startsWith?.("Неверный")) ? "is-invalid" : ""}`}
                type={seePwd ? "text" : "password"}
                maxLength={128}
                value={form.password}
                onChange={(e) => setVal("password", e.target.value)}
                autoComplete="current-password"
                placeholder="Пароль"
              />
              <button
                type="button"
                className="login__toggle"
                aria-label={seePwd ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setSeePwd((s) => !s)}
              >
                {seePwd ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {errors.password && <div className="login__error">{errors.password}</div>}
          </div>

          <button className="login__btn" type="submit" disabled={submitting}>Войти</button>

          <div className="login__links">
            <a href="/password-reset" className="login__link login__link--muted">Забыли пароль?</a>
            <span className="login__sep" />
            <span className="login__muted">Нет аккаунта? </span>
            <a href="/register" className="login__link">Зарегистрироваться</a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
