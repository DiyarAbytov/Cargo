// src/Pages/Home/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { authStore } from "../Api/Api";
import "./Home.scss";

const ME_URL = "me/";
const WHS_URL = "warehouses/";
const TRACK_URL = "orders/track/"; // GET orders/track/{tn}/

const LS_TRACKS = "lc_tracks";
const norm = (s) => String(s ?? "").trim();
const clearSpaces = (s) => String(s ?? "").replace(/\s+/g, "");
const sanitizeTrack = (s) => norm(clearSpaces(s));
const TN_MIN = 1;
const TN_MAX = 32;

/* === задержки синтетических событий (как в Parcels) === */
const STORAGE_DELAY_MS = 10_000; // +10с после «поступил на склад»
const TRUCK_DELAY_MS = 24 * 60 * 60 * 1000; // +1 день после «отправлен со склада»

const joinOneLine = (...parts) => parts.map(norm).filter(Boolean).join(" ");
const toDate = (v) => (v ? new Date(v) : null);

/* YYYY-MM-DDTHH:mm:ss */
const fmtTsSec = (v) => {
  if (!v) return "";
  const s = String(v).replace(" ", "T");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}` : s;
};

const normStatusText = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
const findLastIdx = (arr, pred) => {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i], i)) return i;
  return -1;
};

function withSyntheticEventsAscending(evsAsc) {
  if (!Array.isArray(evsAsc) || evsAsc.length === 0) return evsAsc || [];
  const base = evsAsc.slice();
  const now = Date.now();

  // 1) «на хранение»
  const hasStorage = base.some((e) => normStatusText(e.status).includes("отправлен на хранение"));
  if (!hasStorage) {
    const iAccepted = findLastIdx(base, (e) => /поступил.*склад|accepted.*china/i.test(String(e?.status)));
    if (iAccepted >= 0) {
      const src = base[iAccepted];
      const t = src?.timestamp || src?.time || src?.created_at || src?.date;
      const appearAt = (t ? new Date(t).getTime() : now) + STORAGE_DELAY_MS;
      if (now >= appearAt) {
        base.splice(iAccepted + 1, 0, {
          status: "Товар отправлен на хранение",
          location: "",
          timestamp: new Date(appearAt).toISOString(),
        });
      }
    }
  }

  // 2) «грузовик в пути»
  const hasTruck = base.some((e) => /грузовик|уже в пути/i.test(normStatusText(e.status)));
  if (!hasTruck) {
    const iSentFromWh = findLastIdx(base, (e) => /отправлен\s+со\s+склада/i.test(String(e?.status)));
    if (iSentFromWh >= 0) {
      const src = base[iSentFromWh];
      const t = src?.timestamp || src?.time || src?.created_at || src?.date;
      const appearAt = (t ? new Date(t).getTime() : now) + TRUCK_DELAY_MS;
      if (now >= appearAt) {
        base.splice(iSentFromWh + 1, 0, {
          status: "Товар отправлен грузовиком и уже в пути",
          location: "",
          timestamp: new Date(appearAt).toISOString(),
        });
      }
    }
  }

  return base;
}

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

/* icons */
const CopyIco = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const SearchIco = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-3.5-3.5" />
  </svg>
);

const EyeIco = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const XIco = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const Home = () => {
  const [loading, setLoading] = useState(true);

  const [clientCodeDisplay, setClientCodeDisplay] = useState("");
  const [clientCodeShort, setClientCodeShort] = useState("");

  const [cnAddress, setCnAddress] = useState("");
  const [cnContact, setCnContact] = useState("");
  const [cnPhone, setCnPhone] = useState("");
  const [pickupText, setPickupText] = useState("");

  // трек-номер
  const [track, setTrack] = useState("");
  const [open, setOpen] = useState(false);
  const [suggest, setSuggest] = useState([]);
  const [visible, setVisible] = useState(12);
  const [error, setError] = useState("");

  // модалки
  const [addrOpen, setAddrOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);

  // статусы
  const [selectedTrack, setSelectedTrack] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [events, setEvents] = useState([]);

  // тост
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(""), 1600);
  };

  // copied states
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAddrBtn, setCopiedAddrBtn] = useState(false);
  const [copiedModalAddrBtn, setCopiedModalAddrBtn] = useState(false);

  const codeBlink = useRef(null);
  const addrBlink = useRef(null);
  const addrModalBlink = useRef(null);

  const flash = (setter, ref, ms = 1500) => {
    setter(true);
    window.clearTimeout(ref.current);
    ref.current = window.setTimeout(() => setter(false), ms);
  };

  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // scroll lock for modals
  useEffect(() => {
    const shouldLock = addrOpen || trackOpen;
    if (!shouldLock) return;

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
  }, [addrOpen, trackOpen]);

  useEffect(() => {
    let alive = true;

    const extractShort = (display) => {
      const m = String(display || "").match(/(\d{2}-\d{2}\([^)]+\))/);
      return m ? m[1] : "";
    };

    const load = async () => {
      setLoading(true);
      try {
        const { data: me } = await api.get(ME_URL);

        const displayCode = me?.client_code_display || me?.client_code || "";
        setClientCodeDisplay(String(displayCode || ""));
        setClientCodeShort(extractShort(displayCode));

        const pp = me?.pickup_point || null;
        if (pp) {
          const line1 = `LIDER CARGO ${String(pp.code_label || "").toUpperCase()} ${pp.region_code || ""}-${pp.branch_code || ""}`.trim();
          const line2 = String(pp.address || "").trim();
          setPickupText([line1, line2].filter(Boolean).join("\n"));
        } else {
          setPickupText("");
        }

        const whId = pp?.default_cn_warehouse?.id || me?.pickup_point?.default_cn_warehouse?.id;
        if (whId) {
          const { data } = await api.get(`${WHS_URL}${whId}/`);
          if (!alive) return;
          setCnAddress(data?.address_cn || "");
          setCnContact(data?.contact_name || "");
          setCnPhone(data?.contact_phone || "");
        } else {
          const { data } = await api.get(WHS_URL, { params: { is_active: true } });
          const first = Array.isArray(data?.results) ? data.results[0] : null;
          if (!alive) return;
          setCnAddress(first?.address_cn || "");
          setCnContact(first?.contact_name || "");
          setCnPhone(first?.contact_phone || "");
        }
      } catch (e) {
        if (e?.response?.status === 401) {
          authStore.clear();
          window.location.replace("/login");
          return;
        }
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(codeBlink.current);
      window.clearTimeout(addrBlink.current);
      window.clearTimeout(addrModalBlink.current);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TRACKS);
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      setSuggest(arr.map(clearSpaces));
    } catch {
      setSuggest([]);
    }
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAddrOpen(false);
        setTrackOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = norm(track).toLowerCase();
    if (!q) return suggest;
    return suggest.filter((s) => String(s).toLowerCase().includes(q));
  }, [suggest, track]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  useEffect(() => setVisible(12), [track, open]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) {
      setVisible((v) => Math.min(v + 12, filtered.length));
    }
  };

  const validateTrack = (t) => {
    if (!t) return "Введите трек-номер.";
    if (t.length < TN_MIN || t.length > TN_MAX) return `Длина трек-номера: ${TN_MIN}-${TN_MAX} символов.`;
    return "";
  };

  const uniqEvents = (evs) => {
    const seen = new Set();
    const out = [];
    for (const e of evs) {
      const k = [norm(e.status), norm(e.location), norm(e.timestamp)].join("|");
      if (!seen.has(k)) {
        seen.add(k);
        out.push(e);
      }
    }
    return out;
  };

  const normalizeEvents = (data) => {
    const src =
      (Array.isArray(data?.events) && data.events) ||
      (Array.isArray(data?.history) && data.history) ||
      (Array.isArray(data?.results) && data.results) ||
      (Array.isArray(data) && data) ||
      [];

    const evs = src
      .map((e) => ({
        status: e?.status ?? e?.event ?? e?.title ?? e?.name ?? "",
        location: e?.location ?? e?.place ?? e?.city ?? "",
        timestamp: e?.timestamp ?? e?.time ?? e?.created_at ?? e?.date ?? "",
      }))
      .filter((e) => e.status || e.location || e.timestamp);

    evs.sort((a, b) => {
      const da = toDate(a.timestamp)?.getTime() ?? 0;
      const db = toDate(b.timestamp)?.getTime() ?? 0;
      return da - db;
    });

    return uniqEvents(evs);
  };

  const loadTrack = async (t) => {
    setTrackLoading(true);
    setTrackError("");
    setEvents([]);
    try {
      const { data } = await api.get(`${TRACK_URL}${encodeURIComponent(t)}/`);
      setEvents(normalizeEvents(data));
    } catch (e) {
      if (e?.response?.status === 401) {
        authStore.clear();
        window.location.replace("/login");
        return;
      }
      const d = e?.response?.data || {};
      const msg =
        d?.detail ||
        (Array.isArray(d?.tracking_number) && d.tracking_number[0]) ||
        d?.error ||
        "Не удалось получить статусы. Попробуйте позже.";
      setTrackError(String(msg));
    } finally {
      setTrackLoading(false);
    }
  };

  const goCheck = (e) => {
    e.preventDefault();
    const t = sanitizeTrack(track);
    const err = validateTrack(t);
    setError(err);
    if (err) {
      inputRef.current?.focus();
      return;
    }

    try {
      const raw = localStorage.getItem(LS_TRACKS);
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      const next = [t, ...arr.filter((x) => x !== t)].slice(0, 200);
      localStorage.setItem(LS_TRACKS, JSON.stringify(next));
    } catch {}

    setSelectedTrack(t);
    setTrackOpen(true);
    loadTrack(t);
  };

  const clipClientCode = async () => {
    try {
      await navigator.clipboard.writeText(clientCodeDisplay || "");
      showToast("Код скопирован");
      flash(setCopiedCode, codeBlink);
    } catch {}
  };

  const clipAddressLine = async () => {
    const line = joinOneLine(cnAddress, clientCodeShort || clientCodeDisplay, cnContact, cnPhone);
    try {
      await navigator.clipboard.writeText(line);
      showToast("Адрес + код скопированы");
      flash(setCopiedAddrBtn, addrBlink);
    } catch {}
  };

  const clipAddressOnly = async () => {
    try {
      await navigator.clipboard.writeText(cnAddress || "");
      showToast("Адрес скопирован");
      flash(setCopiedModalAddrBtn, addrModalBlink);
    } catch {}
  };

  const enrichedAsc = useMemo(() => withSyntheticEventsAscending(events), [events]);
  const timeline = useMemo(() => [...enrichedAsc].reverse(), [enrichedAsc]);
  const current = timeline[0];

  return (
    <div className="home">
      <div className="home__container">
        {/* CARD 1: клиентский код */}
        <div className="home__card home__card--code">
          <div className="home__kLabel">Ваш клиентский код</div>

          <div className="home__kRow">
            <div className="home__kValue">{clientCodeDisplay || "—"}</div>

            <button
              className={`home__kCopy ${copiedCode ? "is-copied" : ""}`}
              type="button"
              onClick={clipClientCode}
              aria-label="Скопировать код"
              title="Скопировать"
            >
              <CopyIco />
            </button>
          </div>
        </div>

        {/* CARD 2: трек + адрес */}
        <div className="home__card home__card--main">
          {/* Track */}
          <form className="home__track" onSubmit={goCheck} autoComplete="off" ref={wrapRef}>
            <div className="home__title">Отследить товар</div>

            <div className="home__trackWrap">
              <label className="home__visuallyHidden" htmlFor="home-track">
                Трек-номер
              </label>

              <input
                id="home-track"
                ref={inputRef}
                className={`home__input ${error ? "is-invalid" : ""}`}
                placeholder="Введите трек-номер"
                value={track}
                onChange={(e) => {
                  const v = clearSpaces(e.target.value);
                  setTrack(v);
                  if (error) setError("");
                }}
                onFocus={() => setOpen(true)}
                maxLength={TN_MAX}
                aria-invalid={!!error}
                aria-describedby={error ? "home-track-err" : undefined}
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />

              <button className="home__searchBtn" type="submit" aria-label="Проверить">
                <SearchIco />
              </button>

              {open && (
                <div className="home__menu" role="listbox">
                  <div className="home__list" onScroll={onScroll}>
                    {shown.length === 0 ? (
                      <div className="home__empty">Нет подсказок</div>
                    ) : (
                      shown.map((s, i) => (
                        <div
                          key={`${s}-${i}`}
                          className="home__option"
                          role="option"
                          onMouseDown={() => {
                            setTrack(String(s));
                            setOpen(false);
                            setError("");
                            inputRef.current?.focus();
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

            <div className="home__hint">
              Длина трек-номера {TN_MIN}-{TN_MAX} символов, без пробелов.
            </div>

            {error ? (
              <div id="home-track-err" className="home__error" role="alert" aria-live="polite">
                {error}
              </div>
            ) : null}
          </form>

          {/* Address */}
          <div className="home__title home__title--space">Адрес</div>

          {loading ? (
            <div className="home__loading">Загрузка…</div>
          ) : (
            <div className="home__addrStack">
              <div className="home__addrBox">
                <div className="home__addrLabel">Адрес склада в Китае</div>

                <button
                  type="button"
                  className="home__addrEye"
                  onClick={() => setAddrOpen(true)}
                  aria-label="Показать адрес полностью"
                  title="Показать"
                >
                  <EyeIco />
                </button>

                <div className="home__addrValue">{cnAddress || "—"}</div>
              </div>

              <div className="home__addrBox">
                <div className="home__addrLabel">Пункты самовывоза</div>
                <div className="home__addrValue">{pickupText || "—"}</div>
              </div>
            </div>
          )}

          <button className={`home__btn ${copiedAddrBtn ? "is-copied" : ""}`} type="button" onClick={clipAddressLine}>
            {copiedAddrBtn ? "Скопировано" : "Скопировать"}
          </button>
        </div>
      </div>

      {/* модалка адреса */}
      {addrOpen && (
        <div className="home__modal" role="dialog" aria-modal="true" onClick={() => setAddrOpen(false)}>
          <div className="home__modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="home__modalHead">
              <div className="home__modalTitle">Адрес склада</div>
              <button className="home__close" type="button" onClick={() => setAddrOpen(false)} aria-label="Закрыть">
                <XIco />
              </button>
            </div>

            <div className="home__modalBody">
              <div className="home__pair">
                <div className="home__pairKey">Адрес (CN)</div>
                <div className="home__pairVal">{cnAddress || "—"}</div>
              </div>

              <div className="home__pair">
                <div className="home__pairKey">Контакт (CN)</div>
                <div className="home__pairVal">{cnContact || "—"}</div>
              </div>

              <div className="home__pair">
                <div className="home__pairKey">Телефон (CN)</div>
                <div className="home__pairVal">{cnPhone || "—"}</div>
              </div>
            </div>

            <div className="home__modalActions">
              <button className={`home__btn ${copiedModalAddrBtn ? "is-copied" : ""}`} type="button" onClick={clipAddressOnly}>
                {copiedModalAddrBtn ? "Скопировано" : "Скопировать адрес"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* модалка статусов трека */}
      {trackOpen && (
        <div className="home__modal" role="dialog" aria-modal="true" onClick={() => setTrackOpen(false)}>
          <div className="home__modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="home__modalHead">
              <div className="home__modalTitle">Статусы по треку</div>
              <button className="home__close" type="button" onClick={() => setTrackOpen(false)} aria-label="Закрыть">
                <XIco />
              </button>
            </div>

            <div className="home__modalBody">
              <div className="home__pair" style={{ marginBottom: 4 }}>
                <div className="home__pairKey">Трек-номер</div>
                <div className="home__pairVal">{selectedTrack}</div>
              </div>

              {trackLoading ? <div className="home__loading" style={{ marginTop: 8 }}>Загрузка статусов…</div> : null}

              {trackError && !trackLoading ? (
                <div className="home__error" style={{ marginTop: 8 }}>{trackError}</div>
              ) : null}

              {!trackLoading && !trackError ? (
                timeline.length > 0 ? (
                  <>
                    <div className="home__pair" style={{ marginTop: 8 }}>
                      <div className="home__pairKey">Текущий статус</div>
                      <div className="home__pairVal">
                        <b>{renderSmartStatus(current?.status || "—")}</b>
                        {current?.location ? <> — {current.location}</> : null}
                        {current?.timestamp ? <> • {fmtTsSec(current.timestamp)}</> : null}
                      </div>
                    </div>

                    <div className="home__timeline timeline" style={{ marginTop: 12 }}>
                      {timeline.map((ev, i) => (
                        <div className="timeline__item" key={i}>
                          <div className={`timeline__dot ${i === 0 ? "is-current" : ""}`} />
                          <div className="timeline__content">
                            <div className="timeline__title">{renderSmartStatus(ev.status || "—")}</div>
                            {(ev.location || ev.timestamp) ? (
                              <div className="timeline__meta">
                                {ev.location ? <span className="timeline__loc">{ev.location}</span> : null}
                                {ev.timestamp ? <span className="timeline__time">{fmtTsSec(ev.timestamp)}</span> : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="home__empty" style={{ marginTop: 8 }}>Событий пока нет</div>
                )
              ) : null}
            </div>

            <div className="home__modalActions">
              <button className="home__btn" type="button" onClick={() => setTrackOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* тост */}
      <div className={`home__toast ${toast ? "is-show" : ""}`} role="status" aria-live="polite">
        {toast || ""}
      </div>
    </div>
  );
};

export default Home;