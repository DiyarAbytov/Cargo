import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiEye, FiEyeOff, FiLoader, FiCheckCircle } from "react-icons/fi";
import api, { authStore } from "../../Api/Api";
import "./Register.scss";

const REGISTER_URL = "auth/register/";
const LOGIN_URL = "auth/login/";
const PICKUP_POINTS_URL = "pickup-points/";

const USER_KEY = "lc_user";
const KG_PREFIX = "+996";
const KG_MAX_LEN = 13;
const phoneKG = /^\+996\d{9}$/;

const norm = (s) => String(s ?? "").trim();
const lower = (s) => norm(s).toLowerCase();

const normalizeKgPhone = (value) => {
  const raw = String(value ?? "");
  const digits = raw.replace(/\D/g, "");
  const tail = digits.startsWith("996") ? digits.slice(3) : digits;
  const tail9 = tail.slice(0, 9);
  return `${KG_PREFIX}${tail9}`;
};

const hasLetter = (s) => /[A-Za-zА-Яа-яЁё]/.test(String(s ?? ""));
const hasDigit = (s) => /\d/.test(String(s ?? ""));
const hasSpace = (s) => /\s/.test(String(s ?? ""));

const pickFirstString = (...vals) => {
  for (const v of vals) {
    const s = norm(v);
    if (s) return s;
  }
  return "";
};

const buildAddress = (p) => {
  const direct = pickFirstString(
    p?.address,
    p?.full_address,
    p?.fullAddress,
    p?.location,
    p?.desc,
    p?.description
  );
  if (direct) return direct;

  const street = pickFirstString(p?.street, p?.street_name, p?.streetName);
  const house = pickFirstString(p?.house, p?.house_number, p?.houseNumber);
  const note = pickFirstString(p?.note, p?.landmark);

  let s = "";
  if (street) s += street;
  if (house) s += (s ? " " : "") + house;
  if (note) s += (s ? " (" : "(") + note + ")";

  return norm(s);
};

const fromAnyString = (v) => {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object") return "";

  const preferred = ["name", "title", "label", "ru", "kg", "display", "text", "value"];
  for (const k of preferred) {
    if (typeof v?.[k] === "string" && norm(v[k])) return v[k];
  }
  for (const val of Object.values(v)) {
    if (typeof val === "string" && norm(val)) return val;
  }
  return "";
};

const parseCityFromAddress = (addr) => {
  const a = norm(addr);
  if (!a) return "";

  const bulletSplit = a
    .split("•")
    .map((x) => norm(x))
    .filter(Boolean);

  if (bulletSplit.length >= 2) {
    const left = bulletSplit[0];
    if (left && !/\d/.test(left) && left.length <= 40) return left;
  }

  const dashCandidates = [" — ", " - ", " – "];
  for (const d of dashCandidates) {
    if (a.includes(d)) {
      const left = norm(a.split(d)[0]);
      if (left && !/\d/.test(left) && left.length <= 40) return left;
    }
  }
  return "";
};

const isBadCity = (s) => {
  const t = lower(s);
  return !t || t === "пункт выдачи" || t === "пункт выдачи заказов";
};

const findKnownCityDeep = (obj) => {
  const wanted = ["Бишкек", "Ош"];
  const seen = new Set();
  const q = [obj];
  let steps = 0;

  while (q.length && steps < 250) {
    const cur = q.shift();
    steps += 1;

    if (!cur) continue;

    if (typeof cur === "string") {
      const s = norm(cur);
      if (s) {
        for (const w of wanted) {
          if (s.toLowerCase() === w.toLowerCase()) return w;
        }
      }
      continue;
    }

    if (typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    for (const val of Object.values(cur)) {
      if (typeof val === "string") {
        const s = norm(val);
        if (s) {
          for (const w of wanted) {
            if (s.toLowerCase() === w.toLowerCase()) return w;
          }
        }
      } else if (val && typeof val === "object") {
        q.push(val);
      }
    }
  }

  return "";
};

const extractCity = (p, address) => {
  const candidates = [];

  candidates.push(
    fromAnyString(p?.city),
    fromAnyString(p?.city_name),
    fromAnyString(p?.cityName),
    fromAnyString(p?.city_title),
    fromAnyString(p?.cityTitle),
    fromAnyString(p?.town),
    fromAnyString(p?.settlement),
    fromAnyString(p?.region_name),
    fromAnyString(p?.region)
  );

  const obj = p && typeof p === "object" ? p : {};
  for (const [k, v] of Object.entries(obj)) {
    if (String(k).toLowerCase().includes("city")) candidates.push(fromAnyString(v));
  }

  candidates.push(parseCityFromAddress(address));

  const direct = candidates.map(norm).find((s) => s && !isBadCity(s));
  if (direct) return direct;

  const deep = findKnownCityDeep(p);
  if (deep) return deep;

  return "";
};

/* ===== Searchable Select (Single) ===== */
const SearchableSelect = ({ value, options, placeholder, onChange, disabled = false }) => {
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const close = () => {
    setOpen(false);
    setQ("");
  };

  useEffect(() => {
    const onDown = (ev) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(ev.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        searchRef.current?.focus();
      } catch (e) {
        console.error(e);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const query = lower(q);
    if (!query) return options;
    return options.filter(
      (o) => lower(o.title).includes(query) || lower(o.subtitle).includes(query)
    );
  }, [options, q]);

  return (
    <div className="registerSelect" ref={rootRef} onKeyDown={(ev) => ev.key === "Escape" && close()}>
      <button
        type="button"
        className={`registerSelect__btn ${open ? "is-open" : ""}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className={`registerSelect__text ${value ? "" : "is-placeholder"}`}>
          {value ? value.title : placeholder}
        </span>
        <span className="registerSelect__icon" aria-hidden="true">
          <FiChevronDown className={open ? "is-open" : ""} />
        </span>
      </button>

      {open && (
        <div className="registerSelect__drop">
          <input
            ref={searchRef}
            className="registerSelect__search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск..."
            autoComplete="off"
          />

          <div className="registerSelect__list">
            {filtered.length === 0 ? (
              <div className="registerSelect__empty">Ничего не найдено</div>
            ) : (
              filtered.map((opt, idx) => (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  className={`registerSelect__item ${value?.value === opt.value ? "is-active" : ""}`}
                  onClick={() => {
                    onChange(opt);
                    close();
                  }}
                >
                  <div className="registerSelect__itemTitle">{opt.title}</div>
                  {opt.subtitle ? <div className="registerSelect__itemSub">{opt.subtitle}</div> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Register = () => {
  const [form, setForm] = useState({
    fullName: "",
    phone: KG_PREFIX,
    password: "",
    password2: "",
  });

  const [seePwd, setSeePwd] = useState(false);
  const [seePwd2, setSeePwd2] = useState(false);

  const [points, setPoints] = useState([]);
  const [pointLoading, setPointLoading] = useState(false);
  const [pointValue, setPointValue] = useState(null);

  const [errors, setErrors] = useState({});
  const [topError, setTopError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);
  const [phase, setPhase] = useState(""); // "register" | "login"
  const [redirectTo, setRedirectTo] = useState("");

  useEffect(() => {
    setForm((s) => {
      const next = normalizeKgPhone(s.phone);
      return next === s.phone ? s : { ...s, phone: next };
    });
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setPointLoading(true);
      try {
        const { data } = await api.get(PICKUP_POINTS_URL);
        const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
        if (alive) setPoints(list);
      } catch (e) {
        console.error(e);
        if (alive) setPoints([]);
      } finally {
        if (alive) setPointLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  const pointOptions = useMemo(() => {
    const arr = Array.isArray(points) ? points : [];

    return arr
      .map((p) => {
        const id = p?.id ?? p?.uuid ?? p?.pk ?? null;
        if (id === null || id === undefined) return null;

        const address = buildAddress(p);
        const city = extractCity(p, address);
        const safeCity = city || "Пункт выдачи";

        const subtitle = address
          ? safeCity && !lower(address).includes(lower(safeCity))
            ? `${safeCity} • ${address}`
            : address
          : "";

        return {
          value: String(id),
          title: safeCity,
          subtitle,
          raw: p,
        };
      })
      .filter(Boolean);
  }, [points]);

  const setUserLocal = (u) => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(u || null));
    } catch (e) {
      console.error(e);
    }
  };

  const setVal = (k, v) => {
    setForm((s) => ({ ...s, [k]: k === "phone" ? normalizeKgPhone(v) : v }));
  };

  const validate = () => {
    const e = {};

    const fullName = norm(form.fullName);
    const phone = norm(form.phone);
    const pwd = String(form.password || "");
    const pwd2 = String(form.password2 || "");

    if (!fullName) e.fullName = "Укажите ФИО.";
    if (!phone) e.phone = "Укажите телефон.";
    else if (!phoneKG.test(phone)) e.phone = "Введите 9 цифр после +996.";

    if (!pointValue) e.point = "Выберите пункт выдачи заказов.";

if (!pwd) e.password = "Укажите пароль.";

    if (!pwd2) e.password2 = "Подтвердите пароль.";
    else if (pwd2 !== pwd) e.password2 = "Пароли не совпадают.";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const disabled = submitting || ok;

  const tryAutoLogin = async (phone, password) => {
    setPhase("login");
    const { data } = await api.post(LOGIN_URL, { phone, password });

    const access = data?.access || data?.token || data?.access_token || "";
    const refresh = data?.refresh || data?.refresh_token || "";

    authStore.access = access;
    authStore.refresh = refresh;

    const user = data?.user || null;
    if (user) setUserLocal(user);

    const nextPath = user?.is_employee ? "/parcelsscan" : "/";
    setRedirectTo(nextPath);

    setOk(true);
    window.setTimeout(() => {
      window.location.href = nextPath;
    }, 700);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting) return;

    setTopError("");
    setOk(false);
    setPhase("");
    setRedirectTo("");

    if (!validate()) return;

    setSubmitting(true);
    setPhase("register");

    try {
      const payload = {
        full_name: norm(form.fullName),
        phone: normalizeKgPhone(form.phone),
        pickup_point_id: Number(pointValue?.value),
        password: form.password,
      };

      await api.post(REGISTER_URL, payload);

      // регистрация успешна — показываем успех и сразу логинимся
      await tryAutoLogin(payload.phone, payload.password);
    } catch (err) {
      const d = err?.response?.data || {};
      const detail = d?.detail || d?.non_field_errors?.[0] || "Не удалось зарегистрироваться.";
      setTopError(String(detail));

      const e = {};
      if (d.full_name) e.fullName = Array.isArray(d.full_name) ? d.full_name[0] : String(d.full_name);
      if (d.phone) e.phone = Array.isArray(d.phone) ? d.phone[0] : String(d.phone);
      if (d.pickup_point_id) e.point = Array.isArray(d.pickup_point_id) ? d.pickup_point_id[0] : String(d.pickup_point_id);
      if (d.pickup_point) e.point = e.point || (Array.isArray(d.pickup_point) ? d.pickup_point[0] : String(d.pickup_point));
      if (d.password) e.password = Array.isArray(d.password) ? d.password[0] : String(d.password);

      setErrors((prev) => ({ ...prev, ...e }));
    } finally {
      setSubmitting(false);
      setPhase("");
    }
  };

  return (
    <div className="register">
      <div className="register__card">
        <form className="register__form" onSubmit={submit} noValidate>
          {topError && <div className="register__alert">{topError}</div>}

          {submitting && !ok && (
            <div className="register__alert register__alert--info">
              <FiLoader className="register__spin" />
              <span>{phase === "login" ? "Входим…" : "Регистрируем…"}</span>
            </div>
          )}

          {ok && (
            <div className="register__alert register__alert--success">
              <FiCheckCircle />
              <span>
                Успешно! Перенаправляем…
              </span>
            </div>
          )}

          <div className="register__field">
            <input
              className={`register__input ${errors.fullName ? "is-invalid" : ""}`}
              type="text"
              value={form.fullName}
              onChange={(e) => setVal("fullName", e.target.value)}
              placeholder="ФИО"
              autoComplete="name"
              disabled={disabled}
            />
            {errors.fullName && <div className="register__error">{errors.fullName}</div>}
          </div>

          <div className="register__field">
            <input
              className={`register__input ${form.phone === KG_PREFIX ? "is-muted" : ""} ${
                errors.phone ? "is-invalid" : ""
              }`}
              type="tel"
              inputMode="numeric"
              maxLength={KG_MAX_LEN}
              value={form.phone}
              onChange={(e) => setVal("phone", e.target.value)}
              placeholder={KG_PREFIX}
              autoComplete="tel"
              disabled={disabled}
            />
            {errors.phone && <div className="register__error">{errors.phone}</div>}
          </div>

          <div className="register__field">
            <SearchableSelect
              value={pointValue}
              options={pointOptions}
              placeholder="Пункт выдачи заказов"
              onChange={setPointValue}
              disabled={pointLoading || disabled}
            />
            {errors.point && <div className="register__error">{errors.point}</div>}
          </div>

          <div className="register__field">
            <div className="register__control">
              <input
                className={`register__input register__input--withIcon ${errors.password ? "is-invalid" : ""}`}
                type={seePwd ? "text" : "password"}
                value={form.password}
                onChange={(e) => setVal("password", e.target.value)}
                placeholder="Пароль"
                autoComplete="new-password"
                disabled={disabled}
              />
              <button
                type="button"
                className="register__toggle"
                aria-label={seePwd ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setSeePwd((v) => !v)}
                disabled={disabled}
              >
                {seePwd ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>

            <div className="register__hint">Введите пароль</div>
            {errors.password && <div className="register__error">{errors.password}</div>}
          </div>

          <div className="register__field">
            <div className="register__control">
              <input
                className={`register__input register__input--withIcon ${errors.password2 ? "is-invalid" : ""}`}
                type={seePwd2 ? "text" : "password"}
                value={form.password2}
                onChange={(e) => setVal("password2", e.target.value)}
                placeholder="Подтверждение пароля"
                autoComplete="new-password"
                disabled={disabled}
              />
              <button
                type="button"
                className="register__toggle"
                aria-label={seePwd2 ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setSeePwd2((v) => !v)}
                disabled={disabled}
              >
                {seePwd2 ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {errors.password2 && <div className="register__error">{errors.password2}</div>}
          </div>

          <button className={`register__btn ${ok ? "is-ok" : ""}`} type="submit" disabled={disabled}>
            {ok ? (
              <>
                <FiCheckCircle />
                <span>Успешно</span>
              </>
            ) : submitting ? (
              <>
                <FiLoader className="register__spin" />
                <span>Обработка…</span>
              </>
            ) : (
              "Зарегистрироваться"
            )}
          </button>

          {submitting && !ok && <div className="register__progress" aria-hidden="true" />}

          <div className="register__bottom">
            <span className="register__bottomText">Уже есть аккаунт? </span>
            <a href="/login" className="register__bottomLink">
              Войти
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
