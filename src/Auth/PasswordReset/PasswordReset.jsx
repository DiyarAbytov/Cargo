// src/components/Auth/PasswordReset/PasswordReset.jsx
import React, { useEffect, useRef, useState } from "react";
import api from "../../Api/Api";
import logo from "../../logo/logo.png";

const RESET_URL = "auth/password-reset/";
const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const norm = (s) => String(s ?? "").trim();

/* локальный перевод популярных серверных сообщений на русский */
const translateDetailRu = (detail, status) => {
  const d = String(detail || "").trim();
  const low = d.toLowerCase();

  if (status === 429) return "Слишком много попыток. Попробуйте позже.";
  if (status >= 500) return "Сервис временно недоступен. Попробуйте позже.";

  if (!d) return "";

  if (
    low.includes("user") && low.includes("not found") ||
    low.includes("no user") ||
    low.includes("email does not exist") ||
    low.includes("not registered")
  ) {
    return "Пользователь с таким e-mail не найден.";
  }
  if (low.includes("invalid email")) return "Некорректный e-mail.";
  if (/[А-Яа-яЁё]/.test(d)) return d; // уже по-русски

  return d; // по умолчанию показываем как есть
};

const PasswordReset = () => {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // убирать общий алерт при изменении поля
  useEffect(() => {
    if (errors._) setErrors((e) => ({ ...e, _: undefined }));
  }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    const e = {};
    const v = norm(email);
    if (!v) e.email = "Укажите e-mail.";
    else if (!emailRx.test(v)) e.email = "Некорректный e-mail.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      if (errors.email) inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await api.post(RESET_URL, { email: norm(email) });
      setDone(true);
    } catch (err) {
      const res = err?.response;
      const d = res?.data || {};
      const e = {};

      // field-ошибка по email
      if (d.email) e.email = Array.isArray(d.email) ? d.email[0] : String(d.email);

      // общий detail — переводим
      const translated = translateDetailRu(d.detail, res?.status);
      if (translated) e._ = translated;

      // если сервер ничего не прислал — ставим понятный дефолт
      if (!Object.keys(e).length) {
        e._ = translateDetailRu("", res?.status) || "Не удалось отправить письмо. Проверьте e-mail и попробуйте ещё раз.";
      }

      setErrors(e);
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="reset">
      <div className="reset__card">
        <div className="reset__logo"><img src={logo} alt="Lider Cargo" /></div>
        <h1 className="reset__title">Восстановление пароля</h1>

        {done ? (
          <div className="reset__notice" role="status" aria-live="polite">
            Ссылка для восстановления отправлена.<br />
            Проверьте почту <b>{email}</b>.
            <div className="reset__back"><a className="reset__link" href="/login">Вернуться ко входу</a></div>
          </div>
        ) : (
          <form className="reset__form" onSubmit={submit} noValidate>
            {errors._ && <div className="reset__error" role="alert">{errors._}</div>}

            <div className="reset__hint-top">Введите e-mail, на который зарегистрирован аккаунт.</div>

            <div className="reset__field">
              <label className="visually-hidden" htmlFor="reset-email">E-mail</label>
              <div className="reset__control">
                <input
                  id="reset-email"
                  ref={inputRef}
                  className={`reset__input ${errors.email ? "is-invalid" : ""}`}
                  type="email"
                  inputMode="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value.replace(/\s+/g, " ").trimStart())}
                  placeholder="Email"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "reset-err-email" : undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !submitting) submit(e);
                  }}
                />
              </div>
              {errors.email && <div id="reset-err-email" className="reset__error">{errors.email}</div>}
            </div>

            <button className="reset__btn" type="submit" disabled={submitting}>
              {submitting ? "Отправляем…" : "Отправить"}
            </button>

            <div className="reset__footer"><a href="/login" className="reset__link">Назад ко входу</a></div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PasswordReset;
