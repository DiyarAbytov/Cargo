import React, { useMemo, useRef, useState, useEffect } from "react";
import api, { authStore } from "../../Api/Api";
import logo from "../../logo/logo.png";

const REGISTER_URL = "auth/register/";
const LOGIN_URL = "auth/login/";
const PICKUP_POINTS_URL = "pickup-points/";

/* ===== utils ===== */
const norm = (s) => String(s ?? "").trim();
const collapseSpaces = (s) => norm(String(s).replace(/\s+/g, " "));
const phoneKG = /^\+996\d{9}$/; // +996 и ровно 9 цифр
const passMin = 8;
const passMax = 128;
const passHasLetter = /[A-Za-zА-Яа-яЁё]/;
const passHasDigit = /\d/;
const passNoSpaces = /^\S+$/;

/* локальный переводчик общих ошибок */
const translateDetailRu = (detail) => {
  const d = String(detail || "").trim();
  const low = d.toLowerCase();
  if (!d) return "";

  if (
    low.includes("no active account found") ||
    low.includes("invalid credentials") ||
    low.includes("unable to log in")
  )
    return "Неверный телефон или пароль.";

  if (low.includes("user not found") || low.includes("account not found"))
    return "Пользователь не найден.";

  if (low.includes("not active") || low.includes("inactive") || low.includes("disabled"))
    return "Аккаунт не активирован. Обратитесь в поддержку.";

  if (low.includes("throttle") || low.includes("too many") || low.includes("rate limit"))
    return "Слишком много попыток. Попробуйте позднее.";

  // частая англ. формулировка валидаторов Django
  if (low.includes("password is too common") || low.includes("too common"))
    return "Введённый пароль слишком широко распространён.";

  if (/[А-Яа-яЁё]/.test(d)) return d;
  return d || "Произошла ошибка.";
};

const extractApiErrors = (err) => {
  const data = err?.response?.data || err?.data || {};
  const e = {};

  const common =
    data?.detail ||
    (Array.isArray(data?.non_field_errors) ? data.non_field_errors[0] : "");

  if (common) {
    const msg = translateDetailRu(common);

    // если это явно про пароль — показываем под полем password
    if (/парол/i.test(msg) || /password/i.test(String(common))) e.password = msg;
    else e._ = msg;
  }

  const take = (k) => {
    if (data[k]) e[k] = Array.isArray(data[k]) ? data[k][0] : String(data[k]);
  };

  ["phone", "password", "full_name", "pickup_point_id", "new_password", "uid", "token", "tracking_number"].forEach(
    take
  );

  if (!Object.keys(e).length && err?.message) e._ = translateDetailRu(err.message);
  return e;
};

/* ===== icons ===== */
const Eye = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOff = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M3 3l18 18M10.6 10.6a3 3 0 104.24 4.24M9.9 4.24A11.1 11.1 0 0123 12c0 1.63-4 7-11 7a12.4 12.4 0 01-4.2-.72M5.13 5.13A12 12 0 001 12c0 1.63 4 7 11 7" />
  </svg>
);
const ChevronDown = (p) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/* ===== ComboPickup ===== */
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

    const fetchFirst = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(PICKUP_POINTS_URL, {
          params: { search: norm(query) || undefined },
        });

        const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        if (alive) {
          setItems(list);
          setNextUrl(data?.next || null);
          setVisible(12);
        }
      } catch {
        if (alive) {
          setItems([]);
          setNextUrl(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchFirst();
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
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

  const sel = useMemo(
    () => items.find((r) => String(r?.id) === String(value)) || null,
    [items, value]
  );
  const shown = useMemo(() => items.slice(0, visible), [items, visible]);

  return (
    <div className="combo" ref={wrapRef}>
      <button
        type="button"
        className={`combo__control ${error ? "is-invalid" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((s) => !s)}
        disabled={disabled}
      >
        <span className="combo__value">{sel ? sel.name_ru : "Пункт выдачи заказов"}</span>
        <span className="combo__arrow" aria-hidden>
          <ChevronDown />
        </span>
      </button>

      {open && (
        <div className="combo__menu" role="dialog" aria-label="Выбор ПВЗ">
          <div className="combo__search">
            <input
              className="combo__search-input"
              placeholder="Поиск…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="combo__list" role="listbox" onScroll={onScroll}>
            {loading && items.length === 0 && <div className="combo__empty">Загрузка…</div>}
            {!loading && shown.length === 0 && <div className="combo__empty">Ничего не найдено</div>}

            {shown.map((p) => (
              <div
                key={p.id}
                role="option"
                aria-selected={String(p.id) === String(value)}
                className="combo__option"
                onClick={() => {
                  onChange(String(p.id));
                  setOpen(false);
                }}
              >
                <div className="combo__option-name">{p.name_ru}</div>
                <div className="combo__option-meta">
                  {p.code_label}
                  {p.address ? ` • ${p.address}` : ""}
                </div>
              </div>
            ))}

            {loading && items.length > 0 && <div className="combo__empty">Ещё загружаем…</div>}
          </div>
        </div>
      )}

      {error ? <div className="register__error">{error}</div> : null}
    </div>
  );
};

/* ===== Register ===== */
const Register = () => {
  const [form, setForm] = useState({
    full_name: "",
    phone: "+996",
    pickup_point_id: null,
    password: "",
    confirm: "",
  });

  const [seePwd, setSeePwd] = useState(false);
  const [seePwd2, setSeePwd2] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const setVal = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const setTouch = (k) => setTouched((t) => ({ ...t, [k]: true }));

  /* ФИО */
  const validateName = (value) => {
    const name = collapseSpaces(value);
    if (!name) return "Укажите ФИО.";
    if (name.length > 150) return "Максимум 150 символов.";
    if (/\d/.test(name)) return "ФИО не должно содержать цифры.";
    return null;
  };

  /* Телефон */
  const sanitizePhone = (v) => {
    let s = String(v).replace(/[^\d+]/g, "");
    if (!s.startsWith("+")) s = `+${s}`;

    if (!s.startsWith("+996")) {
      // аккуратно приводим к +996xxxxxxxxx
      const digits = s.replace(/\D/g, "");
      const tail = digits.replace(/^996/, "");
      s = `+996${tail}`;
    }

    if (s.length > 13) s = s.slice(0, 13);
    if (s === "+") s = "+996";
    return s;
  };

  const validatePhone = (value) => {
    const phone = norm(value);
    if (!phone) return "Укажите телефон.";
    if (!phoneKG.test(phone)) return "Формат: +996XXXXXXXXX.";
    return null;
  };

  /* Пароли */
  const validatePassword = (value) => {
    const p = String(value);
    if (!p) return "Укажите пароль.";
    if (p.length < passMin) return `Минимум ${passMin} символов.`;
    if (p.length > passMax) return "Слишком длинный пароль.";
    if (!passNoSpaces.test(p)) return "Пароль не должен содержать пробелы.";
    if (!passHasLetter.test(p)) return "Нужна хотя бы одна буква.";
    if (!passHasDigit.test(p)) return "Нужна хотя бы одна цифра.";
    return null;
  };

  const validateConfirm = (confirm, password) =>
    String(confirm) !== String(password) ? "Пароли не совпадают." : null;

  /* ПВЗ */
  const validatePickup = (id) => (id ? null : "Выберите ПВЗ.");

  /* Общая валидация */
  const validateAll = (f) => {
    const e = {};
    const nameErr = validateName(f.full_name);
    if (nameErr) e.full_name = nameErr;

    const phoneErr = validatePhone(f.phone);
    if (phoneErr) e.phone = phoneErr;

    const pvzErr = validatePickup(f.pickup_point_id);
    if (pvzErr) e.pickup_point_id = pvzErr;

    const passErr = validatePassword(f.password);
    if (passErr) e.password = passErr;

    const confErr = validateConfirm(f.confirm, f.password);
    if (confErr) e.confirm = confErr;

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* live-валидация */
  useEffect(() => {
    const e = { ...errors };

    if (touched.full_name) e.full_name = validateName(form.full_name) || null;
    if (touched.phone) e.phone = validatePhone(form.phone) || null;
    if (touched.pickup_point_id) e.pickup_point_id = validatePickup(form.pickup_point_id) || null;
    if (touched.password) e.password = validatePassword(form.password) || null;
    if (touched.confirm) e.confirm = validateConfirm(form.confirm, form.password) || null;

    Object.keys(e).forEach((k) => e[k] === null && delete e[k]);
    setErrors(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, touched]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;

    // жестко проверяем валидность, а не “просто заполнено”
    if (validateName(form.full_name)) return false;
    if (validatePhone(form.phone)) return false;
    if (validatePickup(form.pickup_point_id)) return false;
    if (validatePassword(form.password)) return false;
    if (validateConfirm(form.confirm, form.password)) return false;

    return true;
  }, [submitting, form]);

  /* авто-логин после регистрации */
  const tryAutoLogin = async (phone, password) => {
    try {
      const { data } = await api.post(LOGIN_URL, { phone, password });
      const access = data?.access || data?.token || data?.access_token || "";
      const refresh = data?.refresh || data?.refresh_token || "";
      if (access) authStore.access = access;
      if (refresh) authStore.refresh = refresh;
      window.location.replace("/profile");
      return true;
    } catch (e) {
      const ex = extractApiErrors(e);
      setErrors({
        _: ex._ || "Зарегистрировано, но не удалось автоматически войти. Попробуйте войти вручную.",
      });
      return false;
    }
  };

  const submit = async (ev) => {
    ev.preventDefault();

    setTouched({
      full_name: true,
      phone: true,
      pickup_point_id: true,
      password: true,
      confirm: true,
    });

    setSubmitting(true);

    if (!validateAll(form)) {
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        full_name: collapseSpaces(form.full_name),
        phone: norm(form.phone),
        pickup_point_id: Number(form.pickup_point_id),
        password: form.password,
      };

      await api.post(REGISTER_URL, payload);
      await tryAutoLogin(payload.phone, payload.password);
    } catch (resp) {
      setErrors(extractApiErrors(resp));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="register">
      <div className="register__card">
        <div className="register__logo">
          <img src={logo} alt="Lider Cargo" />
        </div>

        {errors._ && <div className="register__error">{errors._}</div>}

        <form className="register__form" onSubmit={submit} noValidate>
          {/* ФИО */}
          <div className="register__field">
            <div className="register__control">
              <input
                className={`register__input ${errors.full_name ? "is-invalid" : ""}`}
                type="text"
                maxLength={150}
                value={form.full_name}
                onChange={(e) => setVal("full_name", e.target.value)}
                onBlur={() => setTouch("full_name")}
                autoComplete="name"
                placeholder="ФИО"
                aria-invalid={!!errors.full_name}
                disabled={submitting}
              />
            </div>
            {errors.full_name && <div className="register__error">{errors.full_name}</div>}
          </div>

          {/* Телефон */}
          <div className="register__field">
            <div className="register__control">
              <input
                className={`register__input ${errors.phone ? "is-invalid" : ""}`}
                type="tel"
                inputMode="tel"
                maxLength={13}
                value={form.phone}
                onChange={(e) => setVal("phone", sanitizePhone(e.target.value))}
                onBlur={() => setTouch("phone")}
                placeholder="Телефон"
                autoComplete="tel"
                aria-invalid={!!errors.phone}
                disabled={submitting}
              />
            </div>
            <div className="register__hint">Формат: +996XXXXXXXXX</div>
            {errors.phone && <div className="register__error">{errors.phone}</div>}
          </div>

          {/* ПВЗ */}
          <div className="register__field">
            <ComboPickup
              value={form.pickup_point_id}
              onChange={(id) => {
                setVal("pickup_point_id", id);
                setTouch("pickup_point_id");
              }}
              error={errors.pickup_point_id}
              disabled={submitting}
            />
          </div>

          {/* Пароль */}
          <div className="register__field">
            <div className="register__control">
              <input
                className={`register__input ${errors.password ? "is-invalid" : ""}`}
                type={seePwd ? "text" : "password"}
                maxLength={passMax}
                value={form.password}
                onChange={(e) => setVal("password", e.target.value)}
                onBlur={() => setTouch("password")}
                autoComplete="new-password"
                placeholder="Пароль"
                aria-invalid={!!errors.password}
                disabled={submitting}
              />
              <button
                type="button"
                className="register__toggle"
                aria-label={seePwd ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setSeePwd((s) => !s)}
                disabled={submitting}
              >
                {seePwd ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <div className="register__hint">
              Минимум {passMin} символов, буква и цифра, без пробелов
            </div>
            {errors.password && <div className="register__error">{errors.password}</div>}
          </div>

          {/* Подтверждение */}
          <div className="register__field">
            <div className="register__control">
              <input
                className={`register__input ${errors.confirm ? "is-invalid" : ""}`}
                type={seePwd2 ? "text" : "password"}
                maxLength={passMax}
                value={form.confirm}
                onChange={(e) => setVal("confirm", e.target.value)}
                onBlur={() => setTouch("confirm")}
                autoComplete="new-password"
                placeholder="Подтверждение пароля"
                aria-invalid={!!errors.confirm}
                disabled={submitting}
              />
              <button
                type="button"
                className="register__toggle"
                aria-label={seePwd2 ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setSeePwd2((s) => !s)}
                disabled={submitting}
              >
                {seePwd2 ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {errors.confirm && <div className="register__error">{errors.confirm}</div>}
          </div>

          <button className="register__btn" type="submit" disabled={!canSubmit}>
            {submitting ? "Отправка…" : "Зарегистрироваться"}
          </button>
        </form>

        <div className="register__footer">
          Уже есть аккаунт?{" "}
          <a href="/login" className="register__link">
            Войти
          </a>
        </div>
      </div>
    </div>
  );
};

export default Register;
