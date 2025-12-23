import React, { useMemo } from "react";
import logo from "../logo/logo.png";
import { isAuthed } from "../Api/Api";
import "./SiteShell.scss";

/** Активная вкладка из pathname (устойчиво к /login/, /register?next=...) */
const getActive = () => {
  try {
    const p = String(window?.location?.pathname || "").toLowerCase();
    if (p.startsWith("/login")) return "login";
    if (p.startsWith("/register")) return "register";
  } catch {}
  return "";
};

const SiteShell = ({ children }) => {
  const active = useMemo(getActive, []);
  // после входа шапку не показываем
  let showHeader = true;
  try { showHeader = !isAuthed(); } catch { showHeader = true; }

  return (
    <div className={`site ${showHeader ? "" : "site--no-header"}`}>
      {/* skip-link для клавиатуры/скринридеров */}
      <a href="#main" className="site__skip">Перейти к содержимому</a>

      {showHeader && (
        <header className="site__header" role="banner">
          <div className="site__container site__header-row">
            <a href="/" className="site__brand" aria-label="Lider Cargo">
              <img src={logo} alt="Lider Cargo" />
            </a>

            <nav className="site__nav" aria-label="Навигация">
              <a
                href="/login"
                className={`site__nav-link ${active === "login" ? "is-active" : ""}`}
                aria-current={active === "login" ? "page" : undefined}
              >
                Вход
              </a>
              <a
                href="/register"
                className={`site__nav-link ${active === "register" ? "is-active" : ""}`}
                aria-current={active === "register" ? "page" : undefined}
              >
                Регистрация
              </a>
            </nav>
          </div>
        </header>
      )}

      <main id="main" className="site__main" role="main">
        <div className="site__container">{children}</div>
      </main>
    </div>
  );
};

export default SiteShell;
