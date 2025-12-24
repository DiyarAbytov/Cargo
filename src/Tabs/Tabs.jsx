import React, { useMemo } from "react";
import { FiHome, FiBox, FiUser } from "react-icons/fi";
import "./Tabs.scss";

const detectActiveFromPath = () => {
  try {
    const p = String(window?.location?.pathname || "/").toLowerCase();
    if (p === "/profile" || p.startsWith("/profile/")) return "profile";
    if (p === "/parcels" || p.startsWith("/parcels/")) return "parcels";
    return "home";
  } catch (e) {
    console.error(e);
    return "home";
  }
};

const Tabs = ({ active }) => {
  const current = useMemo(() => active || detectActiveFromPath(), [active]);

  const onClick = (ev, key) => {
    if (key === current) ev.preventDefault();
  };

  return (
    <footer className="tabs" aria-label="Основная навигация">
      <a
        href="/"
        className={`tabs__item ${current === "home" ? "is-active" : ""}`}
        aria-current={current === "home" ? "page" : undefined}
        onClick={(e) => onClick(e, "home")}
      >
        <FiHome className="tabs__icon" aria-hidden="true" />
        <span className="tabs__text">Главное</span>
      </a>

      <a
        href="/parcels"
        className={`tabs__item ${current === "parcels" ? "is-active" : ""}`}
        aria-current={current === "parcels" ? "page" : undefined}
        onClick={(e) => onClick(e, "parcels")}
      >
        <FiBox className="tabs__icon" aria-hidden="true" />
        <span className="tabs__text">Посылки</span>
      </a>

      <a
        href="/profile"
        className={`tabs__item ${current === "profile" ? "is-active" : ""}`}
        aria-current={current === "profile" ? "page" : undefined}
        onClick={(e) => onClick(e, "profile")}
      >
        <FiUser className="tabs__icon" aria-hidden="true" />
        <span className="tabs__text">Профиль</span>
      </a>
    </footer>
  );
};

export default Tabs;
