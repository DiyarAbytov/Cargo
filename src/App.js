import React, { useMemo } from "react";
import SiteShell from "./Layout/SiteShell.jsx";
import "./Layout/SiteShell.scss";

/* Header */
import AppHeader from "./AppHeader/AppHeader.jsx";
import "./AppHeader/AppHeader.scss";

/* Pages */
import Home from "./Home/Home.jsx";
import "./Home/Home.scss";
import Parcels from "./Parcels/Parcels.jsx";
import "./Parcels/Parcels.scss";
import Profile from "./Profile/Profile.jsx";
import "./Profile/Profile.scss";

/* Scan */
import Parcelsscan from "../src/Parcelsscan/Parcelsscan.jsx";
import "../src/Parcelsscan/parcelsscan.scss";

/* Auth pages */
import Login from "./Auth/Login/Login.jsx";
import "./Auth/Login/Login.scss";
import Register from "./Auth/Register/Register.jsx";
import "./Auth/Register/Register.scss";
import PasswordReset from "./Auth/PasswordReset/PasswordReset.jsx";
import "./Auth/PasswordReset/PasswordReset.scss";
import PasswordResetConfirm from "./Auth/PasswordResetConfirm/PasswordResetConfirm.jsx";
import "./Auth/PasswordResetConfirm/PasswordResetConfirm.scss";

/* Tabs */
import Tabs from "./Tabs/Tabs.jsx";
import "./Tabs/Tabs.scss";

/* Auth utils */
import { isAuthed } from "./Api/Api";

/* ===== helpers ===== */
const USER_KEY = "lc_user";
const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
};
const isEmployee = () => Boolean(getUser()?.is_employee);

const getPath = () =>
  (typeof window !== "undefined"
    ? window.location.pathname.replace(/\/+$/, "") || "/"
    : "/");

const getQS = () =>
  new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

const redirect = (to) => {
  if (typeof window !== "undefined") window.location.replace(to);
};

const GUARDED = ["/", "/parcels", "/parcelsscan", "/profile"];

const App = () => {
  const path = getPath();
  const qs = getQS();

  const authed = isAuthed();
  const emp = isEmployee();

  // 1) Неавторизован — на /login?next=...
  if (!authed && GUARDED.includes(path)) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  // 2) Авторизован сотрудник: доступна ТОЛЬКО /parcelsscan
  if (authed && emp && !/^\/parcelsscan\/?$/i.test(path) && !/^\/login\/?$/i.test(path)) {
    redirect("/parcelsscan");
  }

  // 3) Авторизован НЕ сотрудник: запрет на /parcelsscan
  if (authed && !emp && /^\/parcelsscan\/?$/i.test(path)) {
    redirect("/");
  }

  // 4) Уже авторизован и пришёл на /login без reauth — ведём на профильную страницу по роли
  if (authed && /^\/login\/?$/i.test(path) && qs.get("reauth") !== "1") {
    redirect(emp ? "/parcelsscan" : "/");
  }

  /* ==== Роутинг ==== */
  const page = useMemo(() => {
    if (path === "/") return <Home />;
    if (/^\/parcels\/?$/i.test(path)) return <Parcels />;
    if (/^\/parcelsscan\/?$/i.test(path)) return <Parcelsscan />;
    if (/^\/profile\/?$/i.test(path)) return <Profile />;
    if (/^\/login\/?$/i.test(path)) return <Login />;
    if (/^\/register\/?$/i.test(path)) return <Register />;
    if (/^\/password-reset\/confirm\/?$/i.test(path)) return <PasswordResetConfirm />;
    if (/^\/password-reset\/?$/i.test(path)) return <PasswordReset />;
    return <Login />;
  }, [path]);

  const tabsActive = useMemo(() => {
    if (path === "/") return "home";
    if (/^\/parcels\/?$/i.test(path)) return "parcels";
    if (/^\/parcelsscan\/?$/i.test(path)) return "parcels";
    if (/^\/profile\/?$/i.test(path)) return "profile";
    return null;
  }, [path]);

  // табы скрываем у сотрудников на всех страницах
  const showTabs = !emp && Boolean(tabsActive);

  // хедер показываем только на 3 табах (как на скрине)
  const showHeader = !emp && Boolean(tabsActive);

  return (
    <SiteShell>
      {showHeader && <AppHeader />}
      {page}
      {showTabs && <Tabs active={tabsActive} />}
    </SiteShell>
  );
};

export default App;
