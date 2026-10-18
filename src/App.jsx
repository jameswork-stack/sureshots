import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";

import { db } from "./firebase";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BookingManagement from "./pages/BookingManagement";
import BookingHistory from "./pages/BookingHistory";
import Navbar from "./components/Navbar";
import backgroundImage from "./images/background.png";
import Attendance from "./pages/Attendance";
import Members from "./pages/Members";
import DashboardRecords from "./pages/DashboardRecords";
import SoldManagement from "./pages/SoldManagement";
import PackageManagement from "./pages/PackageManagement";
import AmmunitionManagement from "./pages/AmmunitionManagement";
import "./styles/dashboardAccess.css";

const pageBackgroundStyle = {
  backgroundImage: `url(${backgroundImage})`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% auto",
  backgroundAttachment: "scroll",
  backgroundColor: "#ffffff",
};

function MainLayout({ children }) {
  return (
    <div className="app-layout">
      <Navbar />

      <main
        className="main-content"
        style={pageBackgroundStyle}
      >
        {children}
      </main>
    </div>
  );
}

function DashboardAccess() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!/^\d+$/.test(code.trim())) {
      setError("Enter the numeric dashboard code.");
      return;
    }

    try {
      setChecking(true);
      const snapshot = await getDocs(collection(db, "authentication"));

      if (snapshot.size !== 1) {
        setError(
          snapshot.empty
            ? "Dashboard code is not configured."
            : "Expected one dashboard code in Authentication."
        );
        return;
      }

      const savedCode = snapshot.docs[0].data().code;
      if (
        typeof savedCode !== "number" ||
        !Number.isSafeInteger(savedCode) ||
        String(savedCode) !== code.trim()
      ) {
        setError("Incorrect dashboard code.");
        return;
      }

      setUnlocked(true);
    } catch (loadError) {
      console.error("Error verifying dashboard code:", loadError);
      setError("Unable to verify the dashboard code. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  if (unlocked) {
    return (
      <MainLayout>
        <Outlet />
      </MainLayout>
    );
  }

  return (
    <div className="dashboard-access-page">
      <form className="dashboard-access-card" onSubmit={handleSubmit}>
        <h1>Dashboard Access</h1>
        <p>Enter the access code to continue to the dashboard.</p>
        <label htmlFor="dashboard-access-code">Access code</label>
        <input
          id="dashboard-access-code"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoFocus
          required
        />
        {error && (
          <p className="dashboard-access-error" role="alert">
            {error}
          </p>
        )}
        <div className="dashboard-access-actions">
          <button
            type="button"
            className="dashboard-access-back"
            onClick={() => navigate("/bookings")}
          >
            Back to Bookings
          </button>
          <button type="submit" disabled={checking}>
            {checking ? "Checking..." : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Login - has its own background */}
        <Route
          path="/"
          element={<Login />}
        />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={<DashboardAccess />}
        >
          <Route index element={<Dashboard />} />
          <Route path="records/:metric" element={<DashboardRecords />} />
        </Route>

        {/* Booking Management */}
        <Route
          path="/bookings"
          element={
            <MainLayout>
              <BookingManagement />
            </MainLayout>
          }
        />

        <Route
          path="/sold-management"
          element={
            <MainLayout>
              <SoldManagement />
            </MainLayout>
          }
        />

        <Route
          path="/package-management"
          element={
            <MainLayout>
              <PackageManagement />
            </MainLayout>
          }
        />

        <Route
          path="/ammunition-management"
          element={
            <MainLayout>
              <AmmunitionManagement />
            </MainLayout>
          }
        />

        {/* Booking History */}
        <Route
          path="/booking-history"
          element={
            <MainLayout>
              <BookingHistory />
            </MainLayout>
          }
        />

        {/* Attendance */}
        <Route
  path="/attendance"
  element={
    <MainLayout>
      <Attendance />
    </MainLayout>
  }
/>

{/* members */}
        <Route
  path="/members"
  element={
    <MainLayout>
      <Members />
    </MainLayout>
  }
/>

        {/* Unknown routes */}
        <Route
          path="*"
          element={<Navigate to="/" />}
        />

      </Routes>
    </BrowserRouter>
  );
}