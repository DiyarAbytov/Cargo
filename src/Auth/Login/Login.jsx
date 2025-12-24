import React, { useEffect, useMemo, useState } from "react";
import { FiEye, FiEyeOff, FiLoader, FiCheckCircle } from "react-icons/fi";
import api, { authStore } from "../../Api/Api";
import "./Login.scss";

const LOGIN_URL = "auth/login/";
const USER_KEY = "lc_user";

const KG_PREFIX = "+996";
const KG_MAX_LEN = 13; // +996 + 9 цифр
const phoneKG = /^\+996\d{9}$/;

const normalizeKgPhone = (value) => {
  const raw = String(value ?? "");
  const digits = raw.replace(/\D/g, "");
  const tail = digits.startsWith("996") ? digits.slice(3) : digits;
  const tail9 = tail.slice(0, 9);
  return `${KG_PREFIX}${tail9}`;
};

const translateAuthError = (detail) => {
  const d = String(detail || "").toLowerCase();
  if (d.includes("no active") || d.includes("unable") || d.includes("invalid") || d.includes("неверн")) {
    return "Неверный телефон или пароль.";
  }
  if (d.includes("inactive") || d.includes("disabled") || d.includes("not active")) {
    return "Аккаунт не активирован.";
  }
  if (d.includes("too many") || d.includes("throttle") || d.includes("rate limit")) {
    return "Слишком много попыток. Попробуйте позже.";
  }
  return "Не удалось выполнить вход.";
};

const Login = () => {
  const [form, setForm] = useState({ phone: KG_PREFIX, password: "" });
  const [seePwd, setSeePwd] = useState(false);
  const [errors, setErrors] = useState({ _msg: "" });
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);
  const [redirectTo, setRedirectTo] = useState("");

  useEffect(() => {
    setForm((s) => {
      const next = normalizeKgPhone(s.phone);
      return next === s.phone ? s : { ...s, phone: next };
    });
  }, []);

  const phoneTailDigitsCount = useMemo(() => {
    const tail = String(form.phone || "").slice(KG_PREFIX.length);
    return tail.replace(/\D/g, "").length;
  }, [form.phone]);

  const setUserLocal = (u) => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(u || null));
    } catch (e) {
      console.error(e);
    }
  };

  const validate = () => {
    const e = { phone: "", password: "", _msg: "" };

    const phone = normalizeKgPhone(form.phone);
    if (phoneTailDigitsCount === 0) e.phone = "Укажите телефон.";
    else if (!phoneKG.test(phone)) e.phone = "Введите 9 цифр после +996.";

    if (!String(form.password || "").trim()) e.password = "Укажите пароль.";

    setErrors(e);
    return !e.phone && !e.password;
  };

  const onPhoneChange = (ev) => {
    const next = normalizeKgPhone(ev.target.value);
    setForm((s) => ({ ...s, phone: next }));
  };

  const onPhoneKeyDown = (ev) => {
    if (ev.key !== "Backspace" && ev.key !== "Delete") return;

    const el = ev.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;

    if (start <= KG_PREFIX.length) {
      if (ev.key === "Backspace" && start === KG_PREFIX.length && end === KG_PREFIX.length) {
        ev.preventDefault();
        return;
      }
      if (start < KG_PREFIX.length) ev.preventDefault();
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setOk(false);
    setRedirectTo("");
    setErrors({ phone: "", password: "", _msg: "" });

    try {
      const payload = {
        phone: normalizeKgPhone(form.phone),
        password: form.password,
      };

      const { data } = await api.post(LOGIN_URL, payload);

      const access = data?.access || data?.token || data?.access_token || "";
      const refresh = data?.refresh || data?.refresh_token || "";
      authStore.access = access;
      authStore.refresh = refresh;

      const user = data?.user || null;
      setUserLocal(user);

      const nextPath = user?.is_employee ? "/parcelsscan" : "/";
      setRedirectTo(nextPath);
      setOk(true);

      // даём человеку увидеть "Успешно", потом редирект
      window.setTimeout(() => {
        window.location.href = nextPath;
      }, 600);
    } catch (err) {
      const d = err?.response?.data || {};
      const topDetail = d?.detail || d?.non_field_errors?.[0];

      const e = {
        phone: d.phone ? (Array.isArray(d.phone) ? d.phone[0] : String(d.phone)) : "",
        password: d.password ? (Array.isArray(d.password) ? d.password[0] : String(d.password)) : "",
        _msg: translateAuthError(topDetail || err?.message),
      };

      if (e._msg.startsWith("Неверный")) {
        e.phone = e.phone || " ";
        e.password = e.password || " ";
      }

      setErrors(e);
    } finally {
      setSubmitting(false);
    }
  };

  const phoneIsEmpty = phoneTailDigitsCount === 0;
  const disabled = submitting || ok;

  return (
    <div className="login">
      <div className="login__card">
        <form className="login__form" onSubmit={submit} noValidate>
          {errors._msg && <div className="login__alert">{errors._msg}</div>}

          {submitting && !ok && (
            <div className="login__alert login__alert--info">
              <FiLoader className="login__spin" />
              <span>Проверяем данные…</span>
            </div>
          )}

          {ok && (
            <div className="login__alert login__alert--success">
              <FiCheckCircle />
              <span>
                Успешно! Перенаправляем…
              </span>
            </div>
          )}

          <div className="login__field">
            <div className="login__control">
              <input
                className={[
                  "login__input",
                  phoneIsEmpty ? "is-muted" : "",
                  errors.phone ? "is-invalid" : "",
                ].join(" ").trim()}
                type="tel"
                inputMode="numeric"
                maxLength={KG_MAX_LEN}
                value={form.phone}
                onChange={onPhoneChange}
                onKeyDown={onPhoneKeyDown}
                placeholder={KG_PREFIX}
                autoComplete="tel"
                disabled={disabled}
              />
            </div>
            {errors.phone && errors.phone !== " " && <div className="login__error">{errors.phone}</div>}
          </div>

          <div className="login__field">
            <div className="login__control">
              <input
                className={[
                  "login__input",
                  "login__input--withIcon",
                  errors.password ? "is-invalid" : "",
                ].join(" ").trim()}
                type={seePwd ? "text" : "password"}
                maxLength={128}
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                placeholder="Пароль"
                autoComplete="current-password"
                disabled={disabled}
              />

              <button
                type="button"
                className="login__toggle"
                aria-label={seePwd ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setSeePwd((v) => !v)}
                disabled={disabled}
              >
                {seePwd ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {errors.password && errors.password !== " " && <div className="login__error">{errors.password}</div>}
          </div>

          <button className={`login__btn ${ok ? "is-ok" : ""}`} type="submit" disabled={disabled}>
            {ok ? (
              <>
                <FiCheckCircle />
                <span>Успешно</span>
              </>
            ) : submitting ? (
              <>
                <FiLoader className="login__spin" />
                <span>Входим…</span>
              </>
            ) : (
              "Войти"
            )}
          </button>

          {submitting && <div className="login__progress" aria-hidden="true" />}

          <div className="login__links">
            <a href="/password-reset" className="login__forgot">
              Забыли пароль?
            </a>
            <a href="/register" className="login__register">
              Зарегистрироваться
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
