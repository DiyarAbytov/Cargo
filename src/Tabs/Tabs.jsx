import React from "react";
import "./Tabs.scss";

/* ПОДСТАВЬ СВОИ ПУТИ К PNG */
import iconHome from "../logo/Главная.png";
// import iconHomeActive from "../logo/home-active.png";
import iconBox from "../logo/Посылки.png";
// import iconBoxActive from "../logo/boxes-active.png";
import iconUser from "../logo/Профиль.png";
// import iconUserActive from "../logo/profile-active.png";

/** Определяем активный таб по текущему pathname */
const detectActiveFromPath = () => {
  const p = (typeof window !== "undefined" ? window.location.pathname : "/") || "/";
  if (/^\/profile\/?$/i.test(p)) return "profile";
  if (/^\/parcels\/?$/i.test(p)) return "parcels";
  return "home";
};

/** Фиксированная нижняя панель с активным индикатором */
const Tabs = ({ active }) => {
  const current = active || detectActiveFromPath();

  const handleClick = (e, key) => {
    // не перезагружаем страницу, если клик по уже активной вкладке
    if (key === current) e.preventDefault();
  };

  return (
    <footer className="tabs" aria-label="Основная навигация по приложению">
      <a
        className={`tabs__item ${current === "home" ? "is-active" : ""}`}
        href="/"
        aria-current={current === "home" ? "page" : undefined}
        aria-label="Главное"
        title="Главное"
        onClick={(e) => handleClick(e, "home")}
      >
        <img
          className="tabs__icon"
          src={
            // current === "home" ? iconHomeActive :
            iconHome
          }
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <span className="tabs__text">Главное</span>
        {current === "home" && <span className="tabs__indicator" aria-hidden="true" />}
      </a>

      <a
        className={`tabs__item ${current === "parcels" ? "is-active" : ""}`}
        href="/parcels"
        aria-current={current === "parcels" ? "page" : undefined}
        aria-label="Посылки"
        title="Посылки"
        onClick={(e) => handleClick(e, "parcels")}
      >
        <img
          className="tabs__icon"
          src={
            // current === "parcels" ? iconBoxActive :
            iconBox
          }
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <span className="tabs__text">Посылки</span>
        {current === "parcels" && <span className="tabs__indicator" aria-hidden="true" />}
      </a>

      <a
        className={`tabs__item ${current === "profile" ? "is-active" : ""}`}
        href="/profile"
        aria-current={current === "profile" ? "page" : undefined}
        aria-label="Профиль"
        title="Профиль"
        onClick={(e) => handleClick(e, "profile")}
      >
        <img
          className="tabs__icon"
          src={
            // current === "profile" ? iconUserActive :
            iconUser
          }
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <span className="tabs__text">Профиль</span>
        {current === "profile" && <span className="tabs__indicator" aria-hidden="true" />}
      </a>
    </footer>
  );
};

export default Tabs;
