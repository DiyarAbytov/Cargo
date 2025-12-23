import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { authStore } from "../Api/Api";
import logo from "../logo/logo.png";

/* ==== API ==== */
const SCAN_URL   = "orders/scan/";   // POST { tracking_number }
const FIND_URL   = "orders/find/";   // GET   ?q=<string>
const LOGOUT_URL = "auth/logout/";

/* ==== limits ==== */
const TN_MIN = 1;
const TN_MAX = 32;

/* ==== utils ==== */
const norm   = (s) => String(s ?? "").trim();
const uniq   = (arr) => Array.from(new Set(arr.map(String)));
const clamp  = (n, a, b) => Math.max(a, Math.min(b, n));
const clearSpaces = (s) => String(s).replace(/\s+/g, "");
const sanitizeTN  = (s) => norm(clearSpaces(s)); // убрать пробелы внутри

/* локальное хранилище для подсказок */
const LS_TRACKS = "lc_tracks";
const USER_KEY  = "lc_user";

/* ================== Typeahead (ComboBox) ================== */
const TrackInput = ({ value, onChange, pool, hasError, onEnter, fieldRef, autoFocus = false }) => {
  const [open, setOpen] = useState(false);
  const [serverHints, setServerHints] = useState([]);
  const [visible, setVisible] = useState(12);
  const wrapRef  = useRef(null);
  const innerRef = useRef(null);
  const listRef  = useRef(null);

  // пробрасываем ref наружу + (опционально) автофокус
  useEffect(() => {
    const el = innerRef.current;
    if (fieldRef) fieldRef.current = el;
    if (autoFocus && el) el.focus();
  }, [autoFocus, fieldRef]);

  // если поле очистилось — закрыть меню
  useEffect(() => {
    if (!norm(value)) setOpen(false);
  }, [value]);

  // клик снаружи / Esc — закрыть меню
  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  // серверные подсказки (тихий режим)
  useEffect(() => {
    let alive = true;
    const q = norm(value);
    if (!q) { setServerHints([]); setVisible(12); return; }
    (async () => {
      try {
        const { data } = await api.get(FIND_URL, { params: { q } });
        if (!alive) return;
        const raw = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
        const hints = raw
          .map((x) => (typeof x === "string" ? x : x?.tracking_number))
          .filter(Boolean)
          .map(clearSpaces);
        setServerHints(hints);
        setVisible(12);
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
  }, [value]);

  const suggestions = useMemo(() => {
    const base = uniq([...(pool || []), ...(serverHints || [])]).map(clearSpaces);
    const q = norm(value).toLowerCase();
    return q ? base.filter((t) => String(t).toLowerCase().includes(q)) : base;
  }, [pool, serverHints, value]);

  const shown = useMemo(() => suggestions.slice(0, visible), [suggestions, visible]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) {
      setVisible((v) => clamp(v + 12, 0, suggestions.length));
    }
  };

  return (
    <div className="parcelsscan__combo" ref={wrapRef}>
      <input
        ref={innerRef}
        className={`parcelsscan__input ${hasError ? "is-invalid" : ""}`}
        placeholder="Трек-номер"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          // открываем меню только когда есть текст
          const hasText = !!norm(v);
          if (hasText && !open) setOpen(true);
          if (!hasText && open) setOpen(false);
        }}
        onFocus={() => {
          // не открываем список на пустом поле — чтобы не перекрывать сообщения
          if (norm(value)) setOpen(true);
        }}
        onKeyDown={(e) => {
          // если поле в фокусе и сканер шлёт Enter — отправим ОДИН раз
          if (e.key === "Enter" || e.key === "NumpadEnter") {
            e.preventDefault();
            setOpen(false);   // закрыть меню при отправке
            onEnter?.();
          }
        }}
        onPaste={() => setTimeout(() => { setOpen(false); onEnter?.(); }, 50)}
        autoComplete="off"
        inputMode="text"
        maxLength={TN_MAX}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="parcelsscan-combobox-list"
        aria-invalid={!!hasError}
      />

      {open && norm(value) && (
        <div className="parcelsscan__menu" role="listbox" id="parcelsscan-combobox-list">
          <div className="parcelsscan__list" onScroll={onScroll} ref={listRef}>
            {shown.length === 0 ? (
              <div className="parcelsscan__empty">Нет подсказок</div>
            ) : (
              shown.map((s, i) => (
                <div
                  key={`${s}-${i}`}
                  className="parcelsscan__option"
                  role="option"
                  onMouseDown={() => {
                    onChange(String(s));
                    setOpen(false);
                    innerRef.current?.focus();
                  }}
                >
                  {s}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ================== Главный компонент (Скан) ================== */
const Parcelsscan = () => {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [createdEvent, setCreatedEvent] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const fieldRef = useRef(null);          // ref к инпуту

  // ====== Глобальный ловец сканера (работает без фокуса поля) ======
  const bufRef = useRef("");
  const lastTsRef = useRef(0);
  const finTimerRef = useRef(null);
  const submitLockRef = useRef(false);

  const SCAN_NEW_GAP_MS = 120;
  const SCAN_FINISH_MS  = 90;

  // хелпер: элемент редактируемый?
  const isEditable = (el) => {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return el.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
  };

  const finishScan = () => {
    clearTimeout(finTimerRef.current);
    finTimerRef.current = null;

    const raw = bufRef.current;
    bufRef.current = "";
    if (!raw) return;
    const tn = sanitizeTN(raw);
    if (!tn) return;
    setValue(tn);         // показать в поле
    submitScan(tn);       // сразу отправить
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const ae = document.activeElement;

      // если фокус в редактируемом элементе — глобальный ловец не работает
      if (isEditable(ae)) return;

      if (e.key === "Enter" || e.key === "NumpadEnter") {
        if (bufRef.current) {
          e.preventDefault();
          finishScan();
        }
        return;
      }

      if (e.key && e.key.length === 1 && !/\s/.test(e.key)) {
        const now = Date.now();
        const gap = now - (lastTsRef.current || 0);

        if (gap > SCAN_NEW_GAP_MS) {
          bufRef.current = "";
        }

        bufRef.current += e.key;
        lastTsRef.current = now;

        const live = sanitizeTN(bufRef.current);
        setValue(live);

        clearTimeout(finTimerRef.current);
        finTimerRef.current = setTimeout(finishScan, SCAN_FINISH_MS);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(finTimerRef.current);
    };
  }, []); // один раз

  // ====== История из LS ======
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TRACKS);
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      setHistory(arr.map(clearSpaces));
    } catch { setHistory([]); }
  }, []);

  // ====== ?track=... ======
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tn = norm(params.get("track"));
    if (tn) setValue(tn);
  }, []);

  const authRedirect = () => {
    window.location.replace("/login?reauth=1&next=/parcelsscan");
  };

  const pool = useMemo(() => history, [history]);

  const validateTN = (tn) => {
    if (!tn) return "Введите трек-номер.";
    if (tn.length < TN_MIN || tn.length > TN_MAX) {
      return `Длина трек-номера должна быть от ${TN_MIN} до ${TN_MAX} символов.`;
    }
    return "";
  };

  const submitScan = async (tnArg) => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    if (submitting) { submitLockRef.current = false; return; }

    setMsg(""); setErr(""); setCreatedEvent(null);

    const tn = sanitizeTN(tnArg ?? value);
    const vErr = validateTN(tn);
    if (vErr) { setErr(vErr); submitLockRef.current = false; return; }

    setSubmitting(true);
    try {
      const { data } = await api.post(SCAN_URL, { tracking_number: tn });

      setMsg("Скан успешно добавлен.");
      if (data?.created_event) {
        setCreatedEvent({
          status: data.created_event.status || "",
          location: data.created_event.location || "",
          timestamp: data.created_event.timestamp || ""
        });
      }

      // сохранить в историю
      try {
        const raw = localStorage.getItem(LS_TRACKS);
        const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
        const next = uniq([tn, ...arr]).slice(0, 200).map(clearSpaces);
        localStorage.setItem(LS_TRACKS, JSON.stringify(next));
        setHistory(next);
      } catch {}

      // очистить поле и сфокусировать (меню не откроется — пусто)
      setValue("");
      fieldRef.current?.focus();
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401 || status === 403) { authRedirect(); return; }

      const d = e?.response?.data || {};
      let text =
        d?.detail ||
        (Array.isArray(d?.tracking_number) && d.tracking_number[0]) ||
        (typeof d?.error === "string" && d.error) ||
        "";

      if (status === 429) text = text || "Слишком много попыток. Попробуйте позже.";
      if (status >= 500) text = text || "Сервис временно недоступен. Попробуйте позже.";
      if (!text) text = "Не удалось добавить скан. Проверьте трек-номер и повторите.";

      setErr(text);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const onSubmit = (e) => { e.preventDefault(); submitScan(); };

  // безопасный выход
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

  return (
    <div className="parcelsscan">
      <div className="parcelsscan__card">
        {/* Шапка */}
        <div className="parcelsscan__top">
          <div className="parcelsscan__logo">
            <img src={logo} alt="Lider Cargo" />
          </div>
          <button
            type="button"
            className="parcelsscan__logout"
            onClick={logout}
            disabled={loggingOut}
            aria-label="Выйти из аккаунта"
          >
            {loggingOut ? "Выходим…" : "Выйти"}
          </button>
        </div>

        {/* Форма */}
        <form className="parcelsscan__block" onSubmit={onSubmit} noValidate>
          <div className="parcelsscan__block-title">Добавить трек-номер</div>

          <div className="parcelsscan__inputs" aria-live="polite">
            <TrackInput
              value={value}
              onChange={(v) => { setValue(v); if (err) setErr(""); }}
              pool={pool}
              hasError={!!err}
              onEnter={() => submitScan()}  // если поле в фокусе и пришёл Enter
              fieldRef={fieldRef}
              autoFocus={false}            // глобальный ловец работает без фокуса
            />
          </div>

          <button className="parcelsscan__btn" type="submit" disabled={submitting}>
            Добавить
          </button>

          <div className="parcelsscan__hint">
            Длина трек-номера {TN_MIN}–{TN_MAX} символов, без пробелов.
          </div>

          {msg && <div className="parcelsscan__success" aria-live="polite">{msg}</div>}
          {err && <div className="parcelsscan__error" aria-live="polite">{err}</div>}

          {/* Результат из created_event */}
          {createdEvent && (
            <div className="parcelsscan__results" style={{ marginTop: 8 }}>
              <div className="parcelsscan__results-title">Создано событие</div>
              <div className="parcelsscan__bucket">
                <div className="parcelsscan__bucket-list">
                  <span className="parcelsscan__tag"><b>Статус:</b>&nbsp;{createdEvent.status || "—"}</span>
                  {createdEvent.location ? (
                    <span className="parcelsscan__tag"><b>Локация:</b>&nbsp;{createdEvent.location}</span>
                  ) : null}
                  {createdEvent.timestamp ? (
                    <span className="parcelsscan__tag"><b>Время:</b>&nbsp;{createdEvent.timestamp}</span>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Parcelsscan;
