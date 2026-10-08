import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BookingManagement from "./pages/BookingManagement";
import BookingHistory from "./pages/BookingHistory";
import Navbar from "./components/Navbar";
import backgroundImage from "./images/background.png";
import Attendance from "./pages/Attendance";

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
          element={
            <MainLayout>
              <Dashboard />
            </MainLayout>
          }
        />

        {/* Booking Management */}
        <Route
          path="/bookings"
          element={
            <MainLayout>
              <BookingManagement />
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
        <Route
  path="/attendance"
  element={
    <MainLayout>
      <Attendance />
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