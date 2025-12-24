import React from "react";
import logo from "../logo/logo.png";
import { isAuthed } from "../Api/Api";
import "./SiteShell.scss";

const getActive = () => {
  try {
    const p = String(window?.location?.pathname || "").toLowerCase();
    if (p.startsWith("/login")) return "login";
    if (p.startsWith("/register")) return "register";
  } catch (e) {
    console.error(e);
  }
  return "";
};

const SiteShell = ({ children }) => {
  const active = getActive();

  let showHeader = true;
  try {
    showHeader = !isAuthed();
  } catch (e) {
    console.error(e);
    showHeader = true;
  }

  return (
    <div className={`site ${showHeader ? "" : "site--no-header"}`}>
      <a href="#main" className="site__skip">
        Перейти к содержимому
      </a>

      {showHeader && (
        <header className="site__header" role="banner">
          <div className="site__container site__headerRow">
            <a href="/" className="site__brand" aria-label="Lider Cargo">
              <img className="site__brandImg" src={logo} alt="Lider Cargo" />
            </a>

            <nav className="site__nav" aria-label="Навигация">
              <a
                href="/login"
                className={`site__navLink ${active === "login" ? "is-active" : ""}`}
                aria-current={active === "login" ? "page" : undefined}
              >
                Вход
              </a>

              <a
                href="/register"
                className={`site__navLink ${active === "register" ? "is-active" : ""}`}
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
