import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { authStore } from "../Api/Api";
import logo from "../logo/logo.png";
import Tabs from "../Tabs/Tabs";
import { FiEye, FiEyeOff, FiChevronDown } from "react-icons/fi";
import "./Profile.scss";

const ME_URL = "me/";
const PICKUP_POINTS_URL = "pickup-points/";
const LOGOUT_URL = "auth/logout/";

const USER_KEY = "lc_user";

const norm = (s) => String(s ?? "").trim();
const emailRx = /^[^\s@]+@[^\s@]{2,}\.[^\s@]{2,}$/i;

/* ==== ComboPickup (BEM в пределах profile) ==== */
const ComboPickup = ({ value, onChange, error, disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [nextUrl, setNextUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(12);
  const wrapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(PICKUP_POINTS_URL, { params: { search: norm(query) || undefined } });
        const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        if (alive) { setItems(list); setNextUrl(data?.next || null); setVisible(12); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [query]);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchNext = async () => {
    if (!nextUrl || loading) return;
    setLoading(true);
    try {
      const { data } = await api.get(nextUrl);
      const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      setItems((prev) => [...prev, ...list]);
      setNextUrl(data?.next || null);
    } finally { setLoading(false); }
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) {
      if (visible < items.length) setVisible((v) => Math.min(v + 12, items.length));
      else fetchNext();
    }
  };

  const sel = useMemo(() => items.find((r) => String(r?.id) === String(value)) || null, [items, value]);
  const shown = useMemo(() => items.slice(0, visible), [items, visible]);

  return (
    <div className="profile__combo" ref={wrapRef}>
      <button
        type="button"
        className={`profile__combo-control ${error ? "is-invalid" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((s) => !s)}
        disabled={disabled}
      >
        <span className="profile__combo-value">{sel ? `Филиал г. ${sel.name_ru}` : "ПВЗ"}</span>
        <span className="profile__combo-arrow" aria-hidden><FiChevronDown size={16}/></span>
      </button>

      {open && (
        <div className="profile__combo-menu" role="dialog" aria-label="Выбор ПВЗ">
          <div className="profile__combo-search">
            <input
              className="profile__combo-search-input"
              placeholder="Поиск…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              aria-label="Поиск ПВЗ"
            />
          </div>
          <div className="profile__combo-list" role="listbox" onScroll={onScroll}>
            {loading && items.length === 0 && <div className="profile__combo-empty">Загрузка…</div>}
            {!loading && shown.length === 0 && <div className="profile__combo-empty">Ничего не найдено</div>}
            {shown.map((p) => (
              <div
                key={p.id}
                role="option"
                aria-selected={String(p.id) === String(value)}
                className="profile__combo-option"
                onClick={() => { onChange(String(p.id)); setOpen(false); }}
              >
                <div className="profile__combo-option-name">{p.name_ru}</div>
                <div className="profile__combo-option-meta">{p.code_label}{p.address ? ` • ${p.address}` : ""}</div>
              </div>
            ))}
            {loading && items.length > 0 && <div className="profile__combo-empty">Ещё загружаем…</div>}
          </div>
        </div>
      )}
      {error ? <div className="profile__error">{error}</div> : null}
    </div>
  );
};

/* ==== Profile ==== */
const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [seePwd, setSeePwd] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    client_code_display: "",
    phone: "",
    email: "",
    pickup_point_id: null,
    cn_warehouse_address: "",
  });
  const [initial, setInitial] = useState(null);

  const setVal = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const nameRef = useRef(null);
  const pvzRef  = useRef(null);
  const emailRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(ME_URL);
        if (!alive) return;

        try { localStorage.setItem(USER_KEY, JSON.stringify(data || null)); } catch {}

        setForm({
          full_name: data?.full_name || "",
          client_code_display: data?.client_code_display || "",
          phone: data?.phone || "",
          email: data?.email || "",
          pickup_point_id: data?.pickup_point?.id ?? data?.pickup_point_id ?? null,
          cn_warehouse_address: data?.cn_warehouse_address || "",
        });
        setInitial({
          full_name: data?.full_name || "",
          email: data?.email || "",
          pickup_point_id: data?.pickup_point?.id ?? data?.pickup_point_id ?? null,
        });
      } catch (e) {
        const code = e?.response?.status;
        if (code === 401 || code === 403) {
          window.location.replace("/login?reauth=1&next=/profile");
          return;
        }
        setErrors((prev) => ({ ...prev, _: "Не удалось загрузить профиль. Попробуйте позже." }));
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (errors._) setErrors((e) => ({ ...e, _: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.full_name, form.email, form.pickup_point_id]);

  const validate = () => {
    const e = {};
    const name = norm(form.full_name);
    if (!name) e.full_name = "Укажите ФИО.";
    if (name.length > 150) e.full_name = "Максимум 150 символов.";
    if (/\d/.test(name)) e.full_name = "ФИО не должно содержать цифры.";

    const email = norm(form.email || "");
    if (email && !emailRx.test(email)) e.email = "Некорректный e-mail.";

    if (!form.pickup_point_id) e.pickup_point_id = "Выберите ПВЗ.";

    setErrors(e);
    return e;
  };

  const focusFirstError = (e) => {
    if (e.full_name) { nameRef.current?.focus(); return; }
    if (e.pickup_point_id) { pvzRef.current?.focus?.(); return; }
    if (e.email) { emailRef.current?.focus(); return; }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setSuccess("");
    const e = validate();
    if (Object.keys(e).length) { focusFirstError(e); return; }

    const payload = {};
    if (!initial || initial.full_name !== form.full_name) payload.full_name = norm(form.full_name);
    if (!initial || (initial.email || "") !== (form.email || "")) payload.email = form.email ? norm(form.email) : null;
    if (!initial || String(initial.pickup_point_id) !== String(form.pickup_point_id)) {
      payload.pickup_point_id = Number(form.pickup_point_id);
    }
    if (Object.keys(payload).length === 0) {
      setSuccess("Изменений нет.");
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(ME_URL, payload);
      setSuccess("Профиль обновлён.");
      setInitial({
        full_name: norm(form.full_name),
        email: form.email ? norm(form.email) : null,
        pickup_point_id: Number(form.pickup_point_id),
      });
      setErrors({});
    } catch (resp) {
      const res = resp?.response;
      const d = res?.data || resp?.data || {};
      const e2 = {};
      if (d.full_name) e2.full_name = Array.isArray(d.full_name) ? d.full_name[0] : String(d.full_name);
      if (d.email) e2.email = Array.isArray(d.email) ? d.email[0] : String(d.email);
      if (d.pickup_point_id) e2.pickup_point_id = Array.isArray(d.pickup_point_id) ? d.pickup_point_id[0] : String(d.pickup_point_id);
      if (d.detail) e2._ = String(d.detail);

      if (res?.status === 429) e2._ = e2._ || "Слишком много попыток. Попробуйте позже.";
      // eslint-disable-next-line no-undef
      if (res?.status >= 500) e2._ = e2_._ || "Сервис временно недоступен. Попробуйте позже.";
      if (!Object.keys(e2).length) e2._ = "Не удалось сохранить профиль. Проверьте данные и попробуйте ещё раз.";

      setErrors(e2);
      focusFirstError(e2);
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const refresh = authStore.refresh;
      if (refresh) {
        await api.post(LOGOUT_URL, { refresh }).catch(() => {});
      } else {
        await api.post(LOGOUT_URL).catch(() => {});
      }
    } finally {
      try {
        authStore.clear();
        localStorage.removeItem(USER_KEY);
      } catch {}
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("auth");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("auth");
      } catch {}
      window.location.replace("/login?reauth=1");
    }
  };

  const emp = Boolean(JSON.parse(localStorage.getItem(USER_KEY) || "null")?.is_employee);

  return (
    <div className="profile">
      <div className="profile__card">
        <img src={logo} alt="Lider Cargo" className="profile__brand" />

        {loading ? (
          <div className="profile__loading" role="status" aria-live="polite">Загрузка…</div>
        ) : (
          <form className="profile__form" onSubmit={submit} noValidate>
            {success && <div className="profile__success" role="status" aria-live="polite">{success}</div>}
            {errors._ && <div className="profile__error" role="alert">{errors._}</div>}

            <div className="profile__field">
              <label className="profile__label" htmlFor="fn">Фамилия Имя</label>
              <div className="profile__control">
                <input
                  id="fn"
                  ref={nameRef}
                  className={`profile__input ${errors.full_name ? "is-invalid" : ""}`}
                  type="text"
                  maxLength={150}
                  value={form.full_name}
                  onChange={(e) => setVal("full_name", e.target.value)}
                  placeholder="Иванов Иван"
                  autoComplete="name"
                  aria-invalid={!!errors.full_name}
                  aria-describedby={errors.full_name ? "err-fullname" : undefined}
                />
              </div>
              {errors.full_name && <div id="err-fullname" className="profile__error">{errors.full_name}</div>}
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="code">Ваш клиентский код</label>
              <div className="profile__control">
                <input id="code" className="profile__input profile__input--ro" type="text" value={form.client_code_display || ""} readOnly />
              </div>
            </div>

            <div className="profile__field">
              <label className="profile__label">ПВЗ</label>
              <div ref={pvzRef}>
                <ComboPickup
                  value={form.pickup_point_id}
                  onChange={(id) => setVal("pickup_point_id", id)}
                  error={errors.pickup_point_id}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="phone">Телефон</label>
              <div className="profile__control">
                <input id="phone" className="profile__input profile__input--ro" type="tel" value={form.phone || ""} readOnly />
              </div>
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="email">Email</label>
              <div className="profile__control">
                <input
                  id="email"
                  ref={emailRef}
                  className={`profile__input ${errors.email ? "is-invalid" : ""}`}
                  type="email"
                  inputMode="email"
                  maxLength={254}
                  value={form.email || ""}
                  onChange={(e) => setVal("email", e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "err-email" : undefined}
                />
              </div>
              {errors.email && <div id="err-email" className="profile__error">{errors.email}</div>}
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="pwd">Пароль</label>
              <div className="profile__control">
                <input id="pwd" className="profile__input profile__input--ro" type={seePwd ? "text" : "password"} value="********" readOnly />
                <button
                  type="button"
                  className="profile__toggle"
                  aria-label={seePwd ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setSeePwd((s) => !s)}
                >
                  {seePwd ? <FiEyeOff size={18}/> : <FiEye size={18}/>}
                </button>
              </div>
              <div className="profile__hint"><a className="profile__link" href="/password-reset">Сменить пароль</a></div>
            </div>

            <button className="profile__btn" type="submit" disabled={submitting}>
              {submitting ? "Сохраняем…" : "Редактировать профиль"}
            </button>

            <button
              className="profile__btn profile__btn--danger"
              type="button"
              onClick={logout}
              disabled={loggingOut || submitting}
              aria-label="Выйти из аккаунта"
            >
              {loggingOut ? "Выходим…" : "Выйти"}
            </button>

            <button className="profile__btn profile__btn--ghost" type="button" disabled aria-disabled="true" title="Удаление профиля недоступно">
              Удалить профиль
            </button>
          </form>
        )}
      </div>

      {!emp && <Tabs active="profile" />}
    </div>
  );
};

export default Profile;
