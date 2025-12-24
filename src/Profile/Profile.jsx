import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiEye, FiEyeOff } from "react-icons/fi";
import api, { authStore } from "../Api/Api";
import Tabs from "../Tabs/Tabs";
import "./Profile.scss";

const ME_URL = "me/";
const PICKUP_POINTS_URL = "pickup-points/";
const LOGOUT_URL = "auth/logout/";
const USER_KEY = "lc_user";

const norm = (s) => String(s ?? "").trim();
const emailRx = /^[^\s@]+@[^\s@]{2,}\.[^\s@]{2,}$/i;

/* ===== Searchable Select (Single) для ПВЗ ===== */
const ComboPickup = ({ value, onChange, error, disabled }) => {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [nextUrl, setNextUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(12);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        inputRef.current?.focus();
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(PICKUP_POINTS_URL, {
          params: { search: norm(query) || undefined },
        });

        const list = Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
          ? data
          : [];

        if (!alive) return;
        setItems(list);
        setNextUrl(data?.next || null);
        setVisible(12);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setItems([]);
        setNextUrl(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [query, open]);

  const fetchNext = async () => {
    if (!nextUrl || loading) return;
    setLoading(true);
    try {
      const { data } = await api.get(nextUrl);
      const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
        ? data
        : [];
      setItems((prev) => [...prev, ...list]);
      setNextUrl(data?.next || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) {
      if (visible < items.length) setVisible((v) => Math.min(v + 12, items.length));
      else fetchNext();
    }
  };

  const selected = useMemo(
    () => items.find((r) => String(r?.id) === String(value)) || null,
    [items, value]
  );

  const shown = useMemo(() => items.slice(0, visible), [items, visible]);

  return (
    <div className="profileSelect" ref={wrapRef}>
      <button
        type="button"
        className={`profileSelect__btn ${open ? "is-open" : ""} ${error ? "is-invalid" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`profileSelect__text ${selected ? "" : "is-placeholder"}`}>
          {selected ? `Филиал г. ${selected.name_ru}` : "ПВЗ"}
        </span>
        <span className={`profileSelect__chev ${open ? "is-open" : ""}`} aria-hidden="true">
          <FiChevronDown />
        </span>
      </button>

      {open && (
        <div className="profileSelect__drop" role="dialog" aria-label="Выбор ПВЗ">
          <div className="profileSelect__searchWrap">
            <input
              ref={inputRef}
              className="profileSelect__search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск..."
              autoComplete="off"
            />
          </div>

          <div className="profileSelect__list" role="listbox" onScroll={onScroll}>
            {loading && items.length === 0 ? (
              <div className="profileSelect__empty">Загрузка…</div>
            ) : null}

            {!loading && shown.length === 0 ? (
              <div className="profileSelect__empty">Ничего не найдено</div>
            ) : null}

            {shown.map((p) => {
              const active = String(p?.id) === String(value);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`profileSelect__item ${active ? "is-active" : ""}`}
                  onClick={() => {
                    onChange(String(p.id));
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={active}
                >
                  <div className="profileSelect__itemTitle">{`Филиал г. ${p.name_ru}`}</div>
                  <div className="profileSelect__itemSub">
                    {p.code_label}
                    {p.address ? ` • ${p.address}` : ""}
                  </div>
                </button>
              );
            })}

            {loading && items.length > 0 ? (
              <div className="profileSelect__empty">Ещё загружаем…</div>
            ) : null}
          </div>
        </div>
      )}

      {error ? <div className="profile__error">{error}</div> : null}
    </div>
  );
};

const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [seePwd, setSeePwd] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");

  const nameRef = useRef(null);
  const emailRef = useRef(null);

  const [form, setForm] = useState({
    full_name: "",
    client_code_display: "",
    phone: "",
    email: "",
    pickup_point_id: null,
  });

  const [initial, setInitial] = useState(null);

  const setVal = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(ME_URL);
        if (!alive) return;

        try {
          localStorage.setItem(USER_KEY, JSON.stringify(data || null));
        } catch {}

        const pickupId = data?.pickup_point?.id ?? data?.pickup_point_id ?? null;

        setForm({
          full_name: data?.full_name || "",
          client_code_display: data?.client_code_display || "",
          phone: data?.phone || "",
          email: data?.email || "",
          pickup_point_id: pickupId,
        });

        setInitial({
          full_name: data?.full_name || "",
          email: data?.email || "",
          pickup_point_id: pickupId,
        });

        setErrors({});
        setSuccess("");
      } catch (e) {
        const code = e?.response?.status;
        if (code === 401 || code === 403) {
          window.location.replace("/login?reauth=1&next=/profile");
          return;
        }
        setErrors({ _: "Не удалось загрузить профиль. Попробуйте позже." });
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const validate = () => {
    const e = {};

    const name = norm(form.full_name);
    if (!name) e.full_name = "Укажите ФИО.";
    else {
      if (name.length > 150) e.full_name = "Максимум 150 символов.";
      if (/\d/.test(name)) e.full_name = "ФИО не должно содержать цифры.";
    }

    const email = norm(form.email || "");
    if (email && !emailRx.test(email)) e.email = "Некорректный e-mail.";

    if (!form.pickup_point_id) e.pickup_point_id = "Выберите ПВЗ.";

    setErrors(e);
    return e;
  };

  const focusFirstError = (e) => {
    if (e.full_name) {
      nameRef.current?.focus();
      return;
    }
    if (e.email) {
      emailRef.current?.focus();
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setSuccess("");

    const e = validate();
    if (Object.keys(e).length) {
      focusFirstError(e);
      return;
    }

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
      setErrors({});

      setInitial({
        full_name: norm(form.full_name),
        email: form.email ? norm(form.email) : "",
        pickup_point_id: Number(form.pickup_point_id),
      });
    } catch (err) {
      const res = err?.response;
      const d = res?.data || err?.data || {};

      const e2 = {};
      if (d.full_name) e2.full_name = Array.isArray(d.full_name) ? d.full_name[0] : String(d.full_name);
      if (d.email) e2.email = Array.isArray(d.email) ? d.email[0] : String(d.email);
      if (d.pickup_point_id) e2.pickup_point_id = Array.isArray(d.pickup_point_id) ? d.pickup_point_id[0] : String(d.pickup_point_id);
      if (d.detail) e2._ = String(d.detail);

      if (res?.status === 429) e2._ = e2._ || "Слишком много попыток. Попробуйте позже.";
      if (res?.status >= 500) e2._ = e2._ || "Сервис временно недоступен. Попробуйте позже.";
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
      if (refresh) await api.post(LOGOUT_URL, { refresh }).catch(() => {});
      else await api.post(LOGOUT_URL).catch(() => {});
    } finally {
      try {
        authStore.clear();
      } catch {}
      try {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem("token");
        localStorage.removeItem("auth");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("auth");
      } catch {}
      window.location.replace("/login?reauth=1");
    }
  };

  const isEmployee = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem(USER_KEY) || "null");
      return Boolean(u?.is_employee);
    } catch {
      return false;
    }
  }, []);

  return (
    <div className="profile">
      <div className="profile__card">
        {loading ? (
          <div className="profile__loading" role="status" aria-live="polite">
            Загрузка…
          </div>
        ) : (
          <form className="profile__form" onSubmit={submit} noValidate>
            {success ? (
              <div className="profile__success" role="status" aria-live="polite">
                {success}
              </div>
            ) : null}

            {errors._ ? (
              <div className="profile__alert" role="alert">
                {errors._}
              </div>
            ) : null}

            <div className="profile__field">
              <label className="profile__label" htmlFor="pf_name">
                Фамилия Имя
              </label>
              <div className="profile__control">
                <input
                  id="pf_name"
                  ref={nameRef}
                  className={`profile__input ${errors.full_name ? "is-invalid" : ""}`}
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setVal("full_name", e.target.value)}
                  placeholder="Иванов Иван"
                  autoComplete="name"
                />
              </div>
              {errors.full_name ? <div className="profile__error">{errors.full_name}</div> : null}
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="pf_code">
                Ваш клиентский код
              </label>
              <div className="profile__control">
                <input
                  id="pf_code"
                  className="profile__input profile__input--ro"
                  type="text"
                  value={form.client_code_display || ""}
                  readOnly
                />
              </div>
            </div>

            <div className="profile__field">
              <label className="profile__label">ПВЗ</label>
              <ComboPickup
                value={form.pickup_point_id}
                onChange={(id) => setVal("pickup_point_id", id)}
                error={errors.pickup_point_id}
                disabled={submitting}
              />
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="pf_phone">
                Телефон
              </label>
              <div className="profile__control">
                <input
                  id="pf_phone"
                  className="profile__input profile__input--ro"
                  type="tel"
                  value={form.phone || ""}
                  readOnly
                />
              </div>
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="pf_email">
                Email
              </label>
              <div className="profile__control">
                <input
                  id="pf_email"
                  ref={emailRef}
                  className={`profile__input ${errors.email ? "is-invalid" : ""}`}
                  type="email"
                  inputMode="email"
                  value={form.email || ""}
                  onChange={(e) => setVal("email", e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>
              {errors.email ? <div className="profile__error">{errors.email}</div> : null}
            </div>

            <div className="profile__field">
              <label className="profile__label" htmlFor="pf_pwd">
                Пароль
              </label>
              <div className="profile__control">
                <input
                  id="pf_pwd"
                  className="profile__input profile__input--ro profile__input--withIcon"
                  type={seePwd ? "text" : "password"}
                  value="********"
                  readOnly
                />
                <button
                  type="button"
                  className="profile__toggle"
                  aria-label={seePwd ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setSeePwd((v) => !v)}
                >
                  {seePwd ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            <button className="profile__btn" type="submit" disabled={submitting}>
              {submitting ? "Сохраняем…" : "Редактировать профиль"}
            </button>

            <button
              className="profile__btn profile__btn--outline"
              type="button"
              onClick={logout}
              disabled={loggingOut || submitting}
            >
              {loggingOut ? "Выходим…" : "Выйти"}
            </button>
          </form>
        )}
      </div>

      {!isEmployee ? <Tabs active="profile" /> : null}
    </div>
  );
};

export default Profile;
