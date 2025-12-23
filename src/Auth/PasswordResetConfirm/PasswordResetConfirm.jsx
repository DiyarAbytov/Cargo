import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../../Api/Api";
import logo from "../../logo/logo.png";
import { LuEye, LuEyeOff } from "react-icons/lu"; // иконки из react-icons
import "./PasswordResetConfirm.scss";

const RESET_CONFIRM_URL = "auth/password-reset/confirm/";

const getParam = (name) => {
  try { return new URL(window.location.href).searchParams.get(name) || ""; } catch { return ""; }
};

const hasLetter = (s) => /[A-Za-zА-Яа-яЁё]/.test(s);
const hasDigit  = (s) => /\d/.test(s);
const noSpaces  = (s) => !/\s/.test(s);
const norm = (s) => String(s ?? "").trim();

/* Перевод популярных detail-сообщений */
const translateDetailRu = (detail, status) => {
  const d = String(detail || "").trim();
  const low = d.toLowerCase();

  if (status === 429) return "Слишком много попыток. Попробуйте позже.";
  if (status >= 500) return "Сервис временно недоступен. Попробуйте позже.";
  if (!d) return "";

  if (low.includes("invalid token")) return "Токен недействителен. Запросите восстановление ещё раз.";
  if (low.includes("expired"))       return "Ссылка устарела. Запросите восстановление ещё раз.";
  if (low.includes("invalid uid"))   return "Идентификатор (uid) недействителен. Откройте ссылку из письма ещё раз.";
  if (low.includes("not found"))     return "Ссылка недействительна или уже использована. Запросите восстановление ещё раз.";
  if (/[А-Яа-яЁё]/.test(d)) return d;
  return d;
};

const PasswordResetConfirm = () => {
  const uid = useMemo(() => getParam("uid"), []);
  const token = useMemo(() => getParam("token"), []);

  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [see1, setSee1] = useState(false);
  const [see2, setSee2] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const p1Ref = useRef(null);

  useEffect(() => { p1Ref.current?.focus(); }, []);
  useEffect(() => { document.title = "Новый пароль — Lider Cargo"; }, []);
  useEffect(() => { if (errors._) setErrors((e) => ({ ...e, _: undefined })); }, [pwd1, pwd2]); // eslint-disable-line

  const validate = () => {
    const e = {};
    if (!uid) e._ = "Отсутствует идентификатор (uid). Откройте ссылку из письма ещё раз.";
    if (!token) e._ = "Отсутствует токен. Откройте ссылку из письма ещё раз.";

    const p1 = norm(pwd1);
    const p2 = norm(pwd2);

    if (p1.length < 8) e.pwd1 = "Минимум 8 символов.";
    else if (p1.length > 128) e.pwd1 = "Слишком длинный пароль.";
    else if (!noSpaces(p1)) e.pwd1 = "Пароль не должен содержать пробелы.";
    else if (!hasLetter(p1) || !hasDigit(p1)) e.pwd1 = "Пароль должен содержать буквы и цифры.";

    if (p2 !== p1) e.pwd2 = "Пароли не совпадают.";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) { p1Ref.current?.focus(); return; }

    setSubmitting(true);
    try {
      await api.post(RESET_CONFIRM_URL, { uid, token, new_password: pwd1 });
      setDone(true);
    } catch (err) {
      const res = err?.response;
      const d = res?.data || {};
      const e = {};

      if (d.new_password) e.pwd1 = Array.isArray(d.new_password) ? d.new_password[0] : String(d.new_password);
      const translated = translateDetailRu(d.detail, res?.status);
      if (translated) e._ = translated;

      if (d.uid && !e._)   e._ = Array.isArray(d.uid) ? d.uid[0] : String(d.uid);
      if (d.token && !e._) e._ = Array.isArray(d.token) ? d.token[0] : String(d.token);

      if (res?.status === 400 && !Object.keys(e).length)
        e._ = "Ссылка недействительна или устарела. Запросите восстановление ещё раз.";
      if (res?.status >= 500)
        e._ = e._ || "Сервис временно недоступен. Попробуйте позже.";
      if (!Object.keys(e).length)
        e._ = "Не удалось сменить пароль. Попробуйте ещё раз.";

      setErrors(e);
      p1Ref.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="resetc">
      <div className="resetc__card">
        <div className="resetc__logo"><img src={logo} alt="Lider Cargo" /></div>
        <h1 className="resetc__title">Новый пароль</h1>

        {done ? (
          <div className="resetc__notice" role="status" aria-live="polite">
            Пароль успешно изменён.
            <div><a href="/login" className="resetc__link">Войти</a></div>
          </div>
        ) : (
          <form className="resetc__form" onSubmit={submit} noValidate>
            {errors._ && <div className="resetc__error" role="alert">{errors._}</div>}

            <div className="resetc__field">
              <label className="visually-hidden" htmlFor="pwd1">Новый пароль</label>
              <div className="resetc__control">
                <input
                  id="pwd1"
                  ref={p1Ref}
                  className={`resetc__input ${errors.pwd1 ? "is-invalid" : ""}`}
                  type={see1 ? "text" : "password"}
                  value={pwd1}
                  onChange={(e) => setPwd1(e.target.value)}
                  placeholder="Новый пароль"
                  autoComplete="new-password"
                  maxLength={128}
                  aria-invalid={!!errors.pwd1}
                  aria-describedby={errors.pwd1 ? "resetc-err-pwd1" : undefined}
                  onKeyDown={(e) => { if (e.key === "Enter" && !submitting) submit(e); }}
                />
                <button
                  type="button"
                  className="resetc__toggle"
                  aria-label={see1 ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setSee1((s) => !s)}
                >
                  {see1 ? <LuEyeOff /> : <LuEye />}
                </button>
              </div>
              {errors.pwd1 && <div id="resetc-err-pwd1" className="resetc__error">{errors.pwd1}</div>}
              <div className="resetc__hint">Минимум 8 символов, буквы и цифры, без пробелов.</div>
            </div>

            <div className="resetc__field">
              <label className="visually-hidden" htmlFor="pwd2">Подтвердите пароль</label>
              <div className="resetc__control">
                <input
                  id="pwd2"
                  className={`resetc__input ${errors.pwd2 ? "is-invalid" : ""}`}
                  type={see2 ? "text" : "password"}
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  placeholder="Подтвердить пароль"
                  autoComplete="new-password"
                  maxLength={128}
                  aria-invalid={!!errors.pwd2}
                  aria-describedby={errors.pwd2 ? "resetc-err-pwd2" : undefined}
                  onKeyDown={(e) => { if (e.key === "Enter" && !submitting) submit(e); }}
                />
                <button
                  type="button"
                  className="resetc__toggle"
                  aria-label={see2 ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setSee2((s) => !s)}
                >
                  {see2 ? <LuEyeOff /> : <LuEye />}
                </button>
              </div>
              {errors.pwd2 && <div id="resetc-err-pwd2" className="resetc__error">{errors.pwd2}</div>}
            </div>

            <button className="resetc__btn" type="submit" disabled={submitting}>
              {submitting ? "Сохраняем…" : "Сменить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default PasswordResetConfirm;
