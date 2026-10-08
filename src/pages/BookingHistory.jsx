import { useEffect, useState } from "react";
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

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingBooking, setViewingBooking] = useState(null);

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

  const formatPrice = (price) => {
    return `₱${Number(price || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleDeleteBooking = async (id) => {
  const confirmed = window.confirm(
    "Are you sure you want to permanently delete this booking history?"
  );

  if (!confirmed) return;

  try {
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
                  <th>Details</th>
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
                      {item.details || "-"}
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
    className="history-view-btn"
    onClick={() => setViewingBooking(item)}
  >
    View
  </button>

  <button
    className="history-delete-btn"
    onClick={() => handleDeleteBooking(item.id)}
  >
    Delete
  </button>
</td>

                  </tr>
                ))}
              </tbody>

            </table>
          </div>
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

        <div className="history-view-item history-full-width">
          <span>Details</span>
          <p>
            {viewingBooking.details || "-"}
          </p>
        </div>
      </div>

      {/* SURESHOTS MEMBER */}

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

      </div>

    </div>
  );
}