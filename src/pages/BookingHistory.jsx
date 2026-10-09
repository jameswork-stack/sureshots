import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/bookingHistory.css";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
} from "firebase/firestore";

const RANGE_PACKAGE_CATEGORY_LABELS = {
  "Range Fee Rates": "Range Fee",
  "Ammunition Corkage": "Ammunition Corkage Fee",
  "Ammunition Prices": "Ammunition Fee",
};

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingBooking, setViewingBooking] = useState(null);
  const [printingBooking, setPrintingBooking] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);

  const fetchBookingHistory = async () => {
    try {
      setLoading(true);

      const bookingsRef = collection(db, "bookings");
      const q = query(bookingsRef, orderBy("createdAt", "desc"));

      const snapshot = await getDocs(q);

      const history = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter(
          (booking) =>
            booking.status === "Completed" ||
            booking.status === "Cancelled"
        );

      setBookings(history);
    } catch (error) {
      console.error("Error fetching booking history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookingHistory();
  }, []);

  useEffect(() => {
    if (!openMenuId) {
      return;
    }

    const closeMenu = () => setOpenMenuId(null);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);

    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!printingBooking) {
      return;
    }

    const originalTitle = document.title;
    document.title = `Booking - ${printingBooking.bookName || "Details"}`;

    const handleAfterPrint = () => {
      document.title = originalTitle;
      setPrintingBooking(null);
    };

    window.addEventListener("afterprint", handleAfterPrint);
    const printTimeout = window.setTimeout(() => window.print(), 100);

    return () => {
      window.clearTimeout(printTimeout);
      window.removeEventListener("afterprint", handleAfterPrint);
      document.title = originalTitle;
    };
  }, [printingBooking]);

  const formatPrice = (price) => {
    return `₱${Number(price || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getPackageItemRate = (item) =>
    item.pricing === "corkage-flat"
      ? `${formatPrice(item.unitPrice)} flat rate`
      : `${formatPrice(item.unitPrice)} per ${item.unit}`;

  const selectedBooking = bookings.find((booking) => booking.id === openMenuId);

  const handleDeleteBooking = async (id) => {
  const confirmed = window.confirm(
    "Are you sure you want to permanently delete this booking history?"
  );

  if (!confirmed) return;

  try {
    setOpenMenuId(null);
    setMenuPosition(null);
    await deleteDoc(doc(db, "bookings", id));

    setViewingBooking(null);

    await fetchBookingHistory();
  } catch (error) {
    console.error("Error deleting booking history:", error);
    alert("Failed to delete booking history.");
  }
};

  return (
    <div className="booking-history-page">

      <div className="booking-history-header">
        <div>
          <h1>Booking History</h1>
          <p>View completed and cancelled bookings.</p>
        </div>
      </div>

      <div className="booking-history-list">

        <div className="booking-history-list-header">
          <h2>Booking History</h2>
          <span>{bookings.length} records</span>
        </div>

        {loading ? (
          <div className="history-message">
            Loading booking history...
          </div>
        ) : bookings.length === 0 ? (
          <div className="history-message">
            No completed or cancelled bookings yet.
          </div>
        ) : (
          <div className="history-table-container">
            <table className="history-table">

              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Price</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {bookings.map((item) => (
                  <tr key={item.id}>

                    <td>
                      <strong>{item.bookName}</strong>
                    </td>

                    <td>
                      {formatPrice(item.price)}
                    </td>

                    <td>
                      {item.bookDate}
                    </td>

                    <td>
                      {item.bookTime}
                    </td>

                    <td>
                      <span
                        className={`history-status ${
                          item.status === "Completed"
                            ? "completed"
                            : "cancelled"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>

                    <td className="history-action-cell">
                      <button
                        className="history-three-dot-btn"
                        type="button"
                        aria-label={`Actions for ${item.bookName}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === item.id}
                        onClick={(event) => {
                          if (openMenuId === item.id) {
                            setOpenMenuId(null);
                            setMenuPosition(null);
                            return;
                          }

                          const buttonRect =
                            event.currentTarget.getBoundingClientRect();
                          const menuWidth = 200;
                          const menuHeight = 140;
                          const top =
                            buttonRect.bottom + menuHeight + 8 >
                            window.innerHeight
                              ? buttonRect.top - menuHeight - 4
                              : buttonRect.bottom + 4;

                          setMenuPosition({
                            top: Math.max(
                              8,
                              Math.min(
                                top,
                                window.innerHeight - menuHeight - 8
                              )
                            ),
                            left: Math.max(
                              8,
                              Math.min(
                                buttonRect.right - menuWidth,
                                window.innerWidth - menuWidth - 8
                              )
                            ),
                          });
                          setOpenMenuId(item.id);
                        }}
                      >
                        ⋮
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}

        {selectedBooking && menuPosition &&
          createPortal(
            <div
              className="history-action-menu"
              role="menu"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setViewingBooking(selectedBooking);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
              >
                View
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPrintingBooking(selectedBooking);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
              >
                Print / Save as PDF
              </button>
              <button
                className="history-menu-delete-item"
                type="button"
                role="menuitem"
                onClick={() => handleDeleteBooking(selectedBooking.id)}
              >
                Delete
              </button>
            </div>,
            document.body
          )}

        {viewingBooking && (
  <div className="history-overlay">
    <div className="history-view-card">

      <div className="history-view-header">
        <h2>Booking Information</h2>

        <button
          className="history-close-btn"
          onClick={() => setViewingBooking(null)}
        >
          ×
        </button>
      </div>

      {/* BOOKING INFORMATION */}

      <div className="history-view-section">
        <h3>Booking Details</h3>

        <div className="history-view-grid">

          <div className="history-view-item">
            <span>Book / Package</span>
            <strong>
              {viewingBooking.bookName || "-"}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Customer Type</span>
            <strong>
              {viewingBooking.customerType === "member"
                ? "Sureshots Member"
                : viewingBooking.customerType === "regular"
                ? "Regular Customer"
                : "-"}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Status</span>

            <strong>
              <span
                className={`history-status ${
                  viewingBooking.status === "Completed"
                    ? "completed"
                    : "cancelled"
                }`}
              >
                {viewingBooking.status}
              </span>
            </strong>
          </div>

          <div className="history-view-item">
            <span>Price</span>
            <strong>
              {formatPrice(viewingBooking.price)}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Booking Date</span>
            <strong>
              {viewingBooking.bookDate || "-"}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Booking Time</span>
            <strong>
              {viewingBooking.bookTime || "-"}
            </strong>
          </div>

        </div>

        {(!Array.isArray(viewingBooking.packageContents) ||
          viewingBooking.packageContents.length === 0) &&
          (!Array.isArray(viewingBooking.packageItems) ||
            viewingBooking.packageItems.length === 0) && (
            <div className="history-view-item history-full-width">
              <span>Details</span>
              <p>{viewingBooking.details || "-"}</p>
            </div>
          )}
      </div>

      {((Array.isArray(viewingBooking.packageContents) &&
        viewingBooking.packageContents.length > 0) ||
        (Array.isArray(viewingBooking.packageItems) &&
          viewingBooking.packageItems.length > 0)) && (
        <div className="history-view-section">
          <h3>Range Package Contents</h3>
          {Array.isArray(viewingBooking.packageContents) &&
          viewingBooking.packageContents.length > 0 ? (
            viewingBooking.packageContents.map(({ category, items }) => (
              <div className="history-package-category" key={category}>
                <h4>{RANGE_PACKAGE_CATEGORY_LABELS[category] || category}</h4>
                <ul>
                  {items.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <strong>{getPackageItemRate(item)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <div className="history-package-legacy-list">
              {viewingBooking.packageItems.map((item, index) => (
                <div
                  className="history-package-legacy-item"
                  key={`${item.name}-${index}`}
                >
                  <strong>{item.name}</strong>
                  <span>
                    {RANGE_PACKAGE_CATEGORY_LABELS[item.category] ||
                      item.category ||
                      "Range Package"}{" "}
                    · {item.quantity} × {item.unit} · {getPackageItemRate(item)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewingBooking.customerType === "member" && (
      <div className="history-view-section">
        <h3>Sureshots Member Information</h3>

        <div className="history-view-grid">

          <div className="history-view-item">
            <span>Member Name</span>
            <strong>
              {viewingBooking.memberName || "-"}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Member Type</span>
            <strong>
              {viewingBooking.memberType || "-"}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Member Number</span>
            <strong>
              {viewingBooking.memberNumber || "-"}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Expiration Date</span>
            <strong>
              {viewingBooking.expirationDate || "-"}
            </strong>
          </div>

          <div className="history-view-item">
            <span>Phone Number</span>
            <strong>
              {viewingBooking.phoneNumber || "-"}
            </strong>
          </div>

        </div>
      </div>
      )}

      <div className="history-view-actions">
        <button
          className="history-close-action-btn"
          onClick={() => setViewingBooking(null)}
        >
          Close
        </button>
      </div>

    </div>
  </div>
)}

        {printingBooking && (
          <article className="history-print-sheet" aria-hidden="true">
            <header className="history-print-header">
              <p>SURESHOTS · BOOKING RECORD</p>
              <h1>{printingBooking.bookName || "Booking"}</h1>
            </header>

            <section className="history-print-section">
              <h2>Booking Information</h2>
              <dl className="history-print-grid">
                <div>
                  <dt>Customer Type</dt>
                  <dd>
                    {printingBooking.customerType === "member"
                      ? "Sureshots Member"
                      : printingBooking.customerType === "regular"
                      ? "Regular Customer"
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{printingBooking.status || "-"}</dd>
                </div>
                <div>
                  <dt>Booking Date</dt>
                  <dd>{printingBooking.bookDate || "-"}</dd>
                </div>
                <div>
                  <dt>Booking Time</dt>
                  <dd>{printingBooking.bookTime || "-"}</dd>
                </div>
                <div>
                  <dt>Total Price</dt>
                  <dd>{formatPrice(printingBooking.price)}</dd>
                </div>
              </dl>
            </section>

            {Array.isArray(printingBooking.packageContents) &&
            printingBooking.packageContents.length > 0 ? (
              <section className="history-print-section">
                <h2>Range Package Contents</h2>
                {printingBooking.packageContents.map(({ category, items }) => (
                  <div className="history-print-package" key={category}>
                    <h3>
                      {RANGE_PACKAGE_CATEGORY_LABELS[category] || category}
                    </h3>
                    <ul>
                      {items.map((item) => (
                        <li key={item.name}>
                          <span>{item.name}</span>
                          <strong>{getPackageItemRate(item)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : Array.isArray(printingBooking.packageItems) &&
              printingBooking.packageItems.length > 0 ? (
              <section className="history-print-section">
                <h2>Range Package Contents</h2>
                <ul className="history-print-list">
                  {printingBooking.packageItems.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      <span>
                        {RANGE_PACKAGE_CATEGORY_LABELS[item.category] ||
                          item.category ||
                          "Range Package"}
                        : {item.name} · {item.quantity} × {item.unit}
                      </span>
                      <strong>{getPackageItemRate(item)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <section className="history-print-section">
                <h2>Details</h2>
                <p>{printingBooking.details || "-"}</p>
              </section>
            )}

            {printingBooking.customerType === "member" && (
              <section className="history-print-section">
                <h2>Sureshots Member Information</h2>
                <dl className="history-print-grid">
                  <div>
                    <dt>Member Name</dt>
                    <dd>{printingBooking.memberName || "-"}</dd>
                  </div>
                  <div>
                    <dt>Member Type</dt>
                    <dd>{printingBooking.memberType || "-"}</dd>
                  </div>
                  <div>
                    <dt>Member Number</dt>
                    <dd>{printingBooking.memberNumber || "-"}</dd>
                  </div>
                  <div>
                    <dt>Expiration Date</dt>
                    <dd>{printingBooking.expirationDate || "-"}</dd>
                  </div>
                  <div>
                    <dt>Phone Number</dt>
                    <dd>{printingBooking.phoneNumber || "-"}</dd>
                  </div>
                </dl>
              </section>
            )}
          </article>
        )}

      </div>

    </div>
  );
}