import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import "../styles/navbar.css";
import logo from "../images/logo.jpg";

export default function Navbar() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      closeMenu();
      navigate("/");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <aside className={`sidebar${isMenuOpen ? " menu-open" : ""}`}>

      <div className="sidebar-logo">
        <div className="wrapper">
          <img className="nav-logo" src={logo} alt="SureShots" />
        </div>
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <nav className="sidebar-nav" id="primary-navigation">

        <NavLink
          to="/dashboard"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/bookings"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Booking Management
        </NavLink>

        <NavLink
          to="/sold-management"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Sold Management
        </NavLink>

        <NavLink
          to="/package-management"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Package Management
        </NavLink>

        <NavLink
          to="/ammunition-management"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Ammunition Management
        </NavLink>

        
        <NavLink
          to="/members"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Members
        </NavLink>

        <NavLink
          to="/booking-history"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Booking History
        </NavLink>

        <NavLink
          to="/attendance"
          onClick={closeMenu}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          Attendance
        </NavLink>

        

      </nav>

      <div className="sidebar-bottom">

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          Logout
        </button>

      </div>
      <div className="software-info">
        <p>Booking Management System Ver 1.0.0.1</p>
        <p>Developed by James Francis Rodriguez</p>
      </div>

    </aside>
  );
}