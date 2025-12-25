// src/Pages/Parcels.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { authStore } from "../Api/Api";
import "./Parcels.scss";

/** ===== API ===== */
const ORDERS_URL = "orders/";
const FIND_URL = "orders/find/";
const CLAIM_URL = "orders/claim/";
const SCAN_URL = "orders/scan/";
const TRACK_URL = (tn) => `orders/track/${encodeURIComponent(tn)}/`;

/** ===== utils ===== */
const norm = (s) => String(s ?? "").trim();
const uniq = (arr) => Array.from(new Set((arr || []).map((x) => String(x))));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const stripSpaces = (s) => String(s ?? "").replace(/\s+/g, ""); // API — без пробелов
const sanitizeTN = (s) => norm(String(s ?? "")); // UI — как ввёл
const TN_MIN = 1;
const TN_MAX = 32;
const LS_TRACKS = "lc_tracks";

/** ===== задержки синтетических событий ===== */
const STORAGE_DELAY_MS = 10_000; // +10 секунд после «поступил на склад»
const TRUCK_DELAY_MS = 24 * 60 * 60 * 1000; // +1 день после «отправлен со склада»

/** карточки-счётчики (как на фото) */
const STAGES = [
  { key: "accepted", label: "Принят на склад в Китае", tone: "primary" },
  { key: "sent", label: "Отправлен из Китая", tone: "accent" },
  { key: "arrived", label: "Прибыл в пункт выдачи", tone: "primary" },
  { key: "done", label: "Получен", tone: "success" },
];

/** нормализация статуса из объекта заказа */
function extractStatus(order) {
  let s =
    (order?.last_status ??
      order?.status ??
      (Array.isArray(order?.events) && order.events.length
        ? order.events[order.events.length - 1]?.status
        : "")) || "";

  s = String(s).toLowerCase();
  const compact = s.replace(/\s+/g, "_");
  const plain = s.replace(/[^a-zа-яё]+/gi, " ");

  if (/accepted_in_china|accepted|принят/.test(compact) || /склад.*кита/.test(plain)) return "accepted";
  if (/sent_from_china|sent|отправлен/.test(compact) || /отправлен.*кита/.test(plain)) return "sent";
  if (/arrived_to_pvz|arrived/.test(compact) || /прибыл.*пункт.*выда/.test(plain)) return "arrived";
  if (/received|delivered|получен/.test(compact)) return "done";
  return null;
}

/** формат даты-времени с секундами */
const fmtDT = (isoish) => {
  if (!isoish) return "";
  try {
    const d = new Date(isoish);
    const pad = (n) => String(n).padStart(2, "0");
    const dd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const tt = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${dd} ${tt}`;
  } catch {
    return String(isoish);
  }
};

/** красиво переносим подробности в скобках на новые строки */
function renderSmartStatus(status) {
  const text = String(status || "");
  const m = text.match(/^(.*?)(?:\s*\[([^]*?)\])\s*$/);
  if (!m) return text;

  const before = m[1].trim();
  const inside = m[2].trim();

  let parts = inside
    .replace(/\s*,\s*(?=(трек-номер|адрес|телефон|индекс|получатель)\s*:)/gi, "\u0000")
    .split("\u0000");

  if (parts.length === 1) {
    const tmp = inside.split(/\s*,\s*/);
    if (tmp.length >= 3) parts = [tmp[0], tmp[1], tmp.slice(2).join(", ")];
  }

  return (
    <>
      {before} [
      {parts.map((seg, i) => (
        <React.Fragment key={i}>
          {i === 0 ? seg : (
            <>
              <br />
              {seg}
            </>
          )}
          {i < parts.length - 1 ? "," : ""}
        </React.Fragment>
      ))}
      ]
    </>
  );
}

/** ===== Typeahead (один инпут как на фото) ===== */
const TrackInput = ({ value, onChange, suggestionsPool }) => {
  const [open, setOpen] = useState(false);
  const [serverHints, setServerHints] = useState([]);
  const [visible, setVisible] = useState(12);

  const wrapRef = useRef(null);
  const inputId = "parcels-track-input";

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const q = norm(value);
    if (!q) {
      setServerHints([]);
      setVisible(12);
      return;
    }

    (async () => {
      try {
        const { data } = await api.get(FIND_URL, { params: { tracking_number: q } });
        if (!alive) return;

        const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
        const hints = list
          .map((x) => (typeof x === "string" ? x : x?.tracking_number))
          .filter(Boolean);

        setServerHints(hints);
        setVisible(12);
      } catch {
        // silent
      }
    })();

    return () => {
      alive = false;
    };
  }, [value]);

  const suggestions = useMemo(() => {
    const base = uniq([...(suggestionsPool || []), ...(serverHints || [])]);
    const q = norm(value).toLowerCase();
    return q ? base.filter((t) => String(t).toLowerCase().includes(q)) : base;
  }, [suggestionsPool, serverHints, value]);

  const shown = useMemo(() => suggestions.slice(0, visible), [suggestions, visible]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) {
      setVisible((v) => clamp(v + 12, 0, suggestions.length));
    }
  };

  return (
    <div className="parcels__trackWrap" ref={wrapRef}>
      <label htmlFor={inputId} className="parcels__visuallyHidden">
        Трек-номер
      </label>

      <input
        id={inputId}
        className="parcels__input"
        placeholder="Трек-номер"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={TN_MAX}
        aria-haspopup="listbox"
        aria-expanded={open}
      />

      {open && (
        <div className="parcels__menu" role="listbox" onMouseLeave={() => setOpen(false)}>
          <div className="parcels__list" onScroll={onScroll}>
            {shown.length === 0 ? (
              <div className="parcels__empty">Нет подсказок</div>
            ) : (
              shown.map((s, i) => (
                <div
                  key={`${s}-${i}`}
                  className="parcels__option"
                  role="option"
                  onMouseDown={() => {
                    onChange(String(s));
                    setOpen(false);
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

/* ===== Автособытия (строго по времени появления) ===== */
const normStatusText = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();

function withSyntheticEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return events || [];
  const base = events.slice();
  const now = Date.now();

  const findLastIdx = (arr, pred) => {
    for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i], i)) return i;
    return -1;
  };

  const hasStorage = base.some((e) => normStatusText(e.status).includes("отправлен на хранение"));
  if (!hasStorage) {
    const idxAccepted = findLastIdx(base, (e) => /поступил.*склад|accepted.*china/i.test(String(e?.status)));
    if (idxAccepted >= 0) {
      const src = base[idxAccepted];
      const t = src?.timestamp || src?.created_at || src?.date;
      const appearAt = (t ? new Date(t).getTime() : now) + STORAGE_DELAY_MS;
      if (now >= appearAt) {
        base.splice(idxAccepted + 1, 0, {
          id: `storage_${src?.id ?? idxAccepted}`,
          status: "Товар отправлен на хранение",
          timestamp: new Date(appearAt).toISOString(),
        });
      }
    }
  }

  const hasTruck = base.some((e) => /грузовик|уже в пути/i.test(normStatusText(e.status)));
  if (!hasTruck) {
    const idxSentFromWh = findLastIdx(base, (e) => /отправлен\s+со\s+склада/i.test(String(e?.status)));
    if (idxSentFromWh >= 0) {
      const src = base[idxSentFromWh];
      const t = src?.timestamp || src?.created_at || src?.date;
      const appearAt = (t ? new Date(t).getTime() : now) + TRUCK_DELAY_MS;
      if (now >= appearAt) {
        base.splice(idxSentFromWh + 1, 0, {
          id: `truck_${src?.id ?? idxSentFromWh}`,
          status: "Товар отправлен грузовиком и уже в пути",
          timestamp: new Date(appearAt).toISOString(),
        });
      }
    }
  }

  return base;
}

/* ===== Timeline ===== */
const Timeline = ({ order }) => {
  const rawEvents = Array.isArray(order?.events) ? order.events : [];
  const enriched = withSyntheticEvents(rawEvents);

  const sorted = [...enriched]
    .map((e, i) => ({
      ...e,
      _i: i,
      _ts: new Date(e.timestamp || e.created_at || e.date || 0).getTime() || 0,
    }))
    .sort((a, b) => b._ts - a._ts || b._i - a._i);

  const items = sorted.length
    ? sorted.map((e, i) => ({
        id: e.id ?? i,
        title: String(e.status || "").trim() || "Статус",
        time: fmtDT(e.timestamp || e.created_at || e.date || ""),
      }))
    : [
        {
          id: "only",
          title: String(order?.last_status || order?.status || "Статус недоступен"),
          time: fmtDT(order?.updated_at || order?.timestamp || ""),
        },
      ];

  return (
    <div className="timeline" role="list">
      {items.map((it, i) => (
        <div key={it.id} className="timeline__item" role="listitem">
          <div className={`timeline__dot ${i === 0 ? "is-current" : ""}`} aria-hidden />
          <div className="timeline__content">
            <div className="timeline__title">{renderSmartStatus(it.title)}</div>
            {it.time ? <div className="timeline__time">{it.time}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ===== Modal ===== */
const Modal = ({ open, title, loading, error, items, onClose }) => {
  const [detail, setDetail] = useState(null);
  const [dLoading, setDLoading] = useState(false);
  const [dError, setDError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setDError("");
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const openDetail = async (tnApi, tnDisplay) => {
    setDError("");
    setDLoading(true);
    try {
      const { data } = await api.get(TRACK_URL(tnApi));
      const order = data?.order || data || {};
      if (!order || Object.keys(order).length === 0) setDError("История не найдена.");
      else setDetail({ ...order, _display_tn: tnDisplay || order.tracking_number });
    } catch {
      setDError("История не найдена.");
    } finally {
      setDLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__dialog">
        <div className="modal__header">
          <div className="modal__title">{detail ? "Детали трека" : title}</div>
          <div className="modal__actions">
            {detail ? (
              <button type="button" className="modal__action" onClick={() => setDetail(null)} aria-label="Назад">
                ←
              </button>
            ) : null}
            <button className="modal__close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>

        <div className="modal__body">
          {!detail ? (
            <>
              {loading ? <div className="modal__muted">Загрузка…</div> : null}
              {error ? <div className="modal__error">{error}</div> : null}

              {!loading && !error && (items || []).length === 0 ? (
                <div className="modal__muted">Нет заказов с этим статусом.</div>
              ) : null}

              {!loading && !error && (items || []).length > 0 ? (
                <div className="modal__list">
                  {items.map((o) => {
                    const tn = o.tracking_number || "—";
                    const cur = o.last_status || o.status || "—";
                    return (
                      <button
                        type="button"
                        key={o.id ?? tn}
                        className="modalcard"
                        onClick={() => openDetail(tn, tn)}
                        aria-label={`Открыть историю трека ${tn}`}
                      >
                        <div className="modalcard__row">
                          <div className="modalcard__key">Трек:</div>
                          <div className="modalcard__val">{tn}</div>
                        </div>
                        <div className="modalcard__row">
                          <div className="modalcard__key">Статус:</div>
                          <div className="modalcard__val">{renderSmartStatus(cur)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {dLoading ? <div className="modal__muted">Загрузка…</div> : null}
              {dError ? <div className="modal__error">{dError}</div> : null}
              {!dLoading && !dError ? <Timeline order={detail} /> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ===== Stage card (как на фото) ===== */
const StageCard = ({ label, count, tone, onClick }) => {
  // Добавляем условие для скрытия количества в карточке "Получен"
  const hideCount = label === "Получен"; // если статус "Получен", скрываем количество

  return (
    <button
      type="button"
      className={`parcels__stage parcels__stage--${tone}`}
      onClick={onClick}
      aria-label={label}
    >
      <div className="parcels__stageLabel">{label}</div>
      {/* Скрываем количество, если это "Получен" */}
      {!hideCount && <span className="parcels__badge" aria-hidden>{count ?? 0}</span>}
    </button>
  );
};


/* ===== Main ===== */
const Parcels = () => {
  const [globalCounts, setGlobalCounts] = useState({ accepted: 0, sent: 0, arrived: 0, done: 0 });

  const [track, setTrack] = useState("");
  const [history, setHistory] = useState([]);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [mOpen, setMOpen] = useState(false);
  const [mTitle, setMTitle] = useState("");
  const [mLoading, setMLoading] = useState(false);
  const [mError, setMError] = useState("");
  const [mItems, setMItems] = useState([]);

  // scroll lock for modal
  useEffect(() => {
    if (!mOpen) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    try {
      const scrollBarW = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollBarW > 0) document.body.style.paddingRight = `${scrollBarW}px`;
    } catch {}

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [mOpen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TRACKS);
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      setHistory(arr);
    } catch {
      setHistory([]);
    }
  }, []);

  const accumulate = (acc, results) => {
    (results || []).forEach((o) => {
      const key = extractStatus(o);
      if (key && acc[key] !== undefined) acc[key] += 1;
    });
  };

  const fetchCounters = async () => {
    const totals = { accepted: 0, sent: 0, arrived: 0, done: 0 };
    let url = ORDERS_URL;
    let guard = 0;

    try {
      while (url && guard < 100) {
        const { data } = await api.get(url);
        const pageResults = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        accumulate(totals, pageResults);
        url = data?.next || null;
        guard += 1;
      }
      setGlobalCounts(totals);
    } catch (e) {
      const code = e?.response?.status;
      if (code === 401) {
        authStore.clear();
        window.location.replace("/login");
        return;
      }
      if (code === 403) setError("Требуется вход в аккаунт, чтобы увидеть ваши заказы.");
      else console.error(e);
    }
  };

  useEffect(() => {
    fetchCounters();
  }, []);

  const validateTN = (tnClean) => {
    if (!tnClean) return "Введите трек-номер.";
    if (tnClean.length < TN_MIN || tnClean.length > TN_MAX) return `Длина трек-номера: ${TN_MIN}-${TN_MAX} символов.`;
    return "";
  };

  const claimOrCreate = async (tnClean) => {
    try {
      const res = await api.post(CLAIM_URL, { tracking_number: tnClean });
      return { ok: true, data: res.data };
    } catch (e1) {
      const status = e1?.response?.status;
      if (status === 409 || status === 403) return { ok: false, reason: "conflict" };

      try {
        await api.post(SCAN_URL, { tracking_number: tnClean });
      } catch {
        return { ok: false, reason: "create_failed" };
      }

      try {
        const res2 = await api.post(CLAIM_URL, { tracking_number: tnClean });
        return { ok: true, data: res2.data };
      } catch {
        return { ok: false, reason: "claim_after_create_failed" };
      }
    }
  };

  const openTrackModal = async (tnApi, tnDisplay) => {
    setMTitle(`Трек: ${tnDisplay}`);
    setMItems([]);
    setMError("");
    setMLoading(true);
    setMOpen(true);

    try {
      const { data } = await api.get(TRACK_URL(tnApi));
      const order = data?.order || data;
      if (!order || Object.keys(order).length === 0) setMError("Это не ваш товар или товар не найден.");
      else {
        const normalized = {
          tracking_number: tnDisplay || order.tracking_number || tnApi,
          last_status: order.last_status || order.status || "",
          ...order,
        };
        setMItems([normalized]);
      }
    } catch {
      setMError("Это не ваш товар или товар не найден.");
    } finally {
      setMLoading(false);
    }
  };

  const openStageModal = async (key) => {
    const stage = STAGES.find((s) => s.key === key);
    setMTitle(stage ? stage.label : "Детали");
    setMItems([]);
    setMError("");
    setMLoading(true);
    setMOpen(true);

    let url = ORDERS_URL;
    let guard = 0;
    const matched = [];

    try {
      while (url && guard < 60 && matched.length < 300) {
        const { data } = await api.get(url);
        const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        for (const o of list) if (extractStatus(o) === key) matched.push(o);
        url = data?.next || null;
        guard += 1;
      }
      setMItems(matched);
    } catch {
      setMError("Не удалось загрузить заказы. Попробуйте позже.");
    } finally {
      setMLoading(false);
    }
  };

  // поддержка ?track=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tn = norm(params.get("track"));
    if (!tn) return;

    try {
      const raw = localStorage.getItem(LS_TRACKS);
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      const next = uniq([tn, ...arr]).slice(0, 200);
      localStorage.setItem(LS_TRACKS, JSON.stringify(next));
      setHistory(next);
    } catch {}

    setTrack(tn);
    openTrackModal(stripSpaces(tn), tn);
  }, []);

  const suggestionsPool = useMemo(() => history, [history]);

  const submit = async (ev) => {
    ev.preventDefault();
    setMessage("");
    setError("");

    const raw = sanitizeTN(track);
    const clean = stripSpaces(raw);

    const vErr = validateTN(clean);
    if (vErr) {
      setError(vErr);
      return;
    }

    setSubmitting(true);

    const res = await claimOrCreate(clean);

    if (!res.ok) {
      setSubmitting(false);
      setError("Не удалось присвоить/создать товар. Возможно, трек уже принадлежит другому аккаунту.");
      return;
    }

    try {
      const savedRaw = localStorage.getItem(LS_TRACKS);
      const arr = Array.isArray(JSON.parse(savedRaw)) ? JSON.parse(savedRaw) : [];
      const next = uniq([raw, ...arr]).slice(0, 200);
      localStorage.setItem(LS_TRACKS, JSON.stringify(next));
      setHistory(next);
    } catch {}

    await fetchCounters();
    setMessage("Добавлено в ваш аккаунт: 1.");
    setTrack("");
    setSubmitting(false);

    openTrackModal(clean, raw);
  };

  return (
    <div className="parcels">
      <div className="parcels__container">
        <div className="parcels__card">
          <div className="parcels__title">Добавить трек-номер</div>

          <form className="parcels__form" onSubmit={submit} noValidate>
            <TrackInput value={track} onChange={setTrack} suggestionsPool={suggestionsPool} />

            <div className="parcels__hint">
              Длина трек-номера {TN_MIN}-{TN_MAX} символов.
            </div>

            <button className="parcels__btn" type="submit" disabled={submitting}>
              Добавить
            </button>

            {message ? <div className="parcels__success">{message}</div> : null}
            {error ? <div className="parcels__error">{error}</div> : null}
          </form>

          <div className="parcels__grid" aria-live="polite">
            <StageCard
              label={STAGES[0].label}
              count={globalCounts.accepted}
              tone={STAGES[0].tone}
              onClick={() => openStageModal("accepted")}
            />
            <StageCard
              label={STAGES[1].label}
              count={globalCounts.sent}
              tone={STAGES[1].tone}
              onClick={() => openStageModal("sent")}
            />
            <StageCard
              label={STAGES[2].label}
              count={globalCounts.arrived}
              tone={STAGES[2].tone}
              onClick={() => openStageModal("arrived")}
            />
            <StageCard
              label={STAGES[3].label}
              count={globalCounts.done}
              tone={STAGES[3].tone}
              onClick={() => openStageModal("done")}
            />
          </div>
        </div>
      </div>

      <Modal open={mOpen} title={mTitle} loading={mLoading} error={mError} items={mItems} onClose={() => setMOpen(false)} />
    </div>
  );
};

export default Parcels;
