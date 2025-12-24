import React from "react";
import "./AppHeader.scss";

import logo from "../logo/logo.png";

const AppHeader = () => {
  return (
    <header className="appHeader" role="banner">
      <div className="appHeader__inner">
        <img className="appHeader__logo" src={logo} alt="Lider Cargo" />
      </div>
    </header>
  );
};

export default AppHeader;
