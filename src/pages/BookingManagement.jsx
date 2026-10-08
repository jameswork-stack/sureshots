import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import "../styles/bookingManagement.css";

export default function BookingManagement() {
  const [showForm, setShowForm] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");

  const [viewingBooking, setViewingBooking] = useState(null);

  const [editingBookingId, setEditingBookingId] = useState(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);

  const [booking, setBooking] = useState({
  bookName: "",
  details: "",
  price: "",
  bookDate: "",
  bookTime: "",

  // Sureshots Member
  memberName: "",
  memberType: "Regular",
  memberNumber: "",
  expirationDate: "",
  phoneNumber: "",
});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const timeSlots = [
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "12:00 PM - 1:00 PM",
    "1:00 PM - 2:00 PM",
    "2:00 PM - 3:00 PM",
    "3:00 PM - 4:00 PM",
    "4:00 PM - 5:00 PM",
    "5:00 PM - 6:00 PM",
    "6:00 PM - 7:00 PM",
  ];

  // ================================
  // GET BOOKINGS
  // ================================

  const fetchBookings = async () => {
    try {
      const querySnapshot = await getDocs(
        collection(db, "bookings")
      );

      const bookingList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setBookings(bookingList);

    } catch (error) {
      console.error("Error loading bookings:", error);

      setError("Failed to load bookings.");
    }
  };

  useEffect(() => {
    fetchBookings();
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


  // ================================
  // CHECK BOOKED TIME
  // ================================

const isTimeBooked = (date, time) => {
  return bookings.some(
    (item) =>
      item.id !== editingBookingId &&
      item.status === "Booked" &&
      item.bookDate === date &&
      item.bookTime === time
  );
};


  // ================================
  // HANDLE INPUT
  // ================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setBooking((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
  };


  // ================================
  // OPEN ADD FORM
  // ================================

  const handleAddBooking = () => {

    setEditingBookingId(null);

    setBooking({
  bookName: "",
  details: "",
  price: "",
  bookDate: "",
  bookTime: "",

  memberName: "",
  memberType: "Regular",
  memberNumber: "",
  expirationDate: "",
  phoneNumber: "",
});

    setError("");

    setShowForm(true);
  };


  // ================================
  // OPEN EDIT FORM
  // ================================

  const handleEditBooking = (item) => {

    setEditingBookingId(item.id);

    setBooking({
  bookName: item.bookName || "",
  details: item.details || "",
  price: item.price || "",
  bookDate: item.bookDate || "",
  bookTime: item.bookTime || "",

  memberName: item.memberName || "",
  memberType: item.memberType || "Regular",
  memberNumber: item.memberNumber || "",
  expirationDate: item.expirationDate || "",
  phoneNumber: item.phoneNumber || "",
});

    setError("");

    setOpenMenuId(null);

    setShowForm(true);
  };


  // ================================
  // SAVE / UPDATE BOOKING
  // ================================

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");

    if (
      !booking.bookName ||
      !booking.details ||
      !booking.price ||
      !booking.bookDate ||
      !booking.bookTime
    ) {
      setError("Please complete all fields.");
      return;
    }

    // Check if another booking already uses the slot
    const alreadyBooked = isTimeBooked(
      booking.bookDate,
      booking.bookTime
    );

    if (alreadyBooked) {

      setError(
        "This date and time slot is already booked. Please select another time."
      );

      return;
    }

    try {

      setSaving(true);

      // =================================
      // EDIT EXISTING BOOKING
      // =================================

      if (editingBookingId) {

        const bookingRef = doc(
          db,
          "bookings",
          editingBookingId
        );

        await updateDoc(bookingRef, {

          bookName: booking.bookName,

          details: booking.details,

          price: Number(booking.price),

          bookDate: booking.bookDate,

          bookTime: booking.bookTime,

           memberName: booking.memberName,
  memberType: booking.memberType,
  memberNumber: booking.memberNumber,
  expirationDate: booking.expirationDate,
  phoneNumber: booking.phoneNumber,

          updatedAt: serverTimestamp(),

        });

      }

      // =================================
      // ADD NEW BOOKING
      // =================================

      else {

        // Double check Firestore
        const querySnapshot = await getDocs(
          collection(db, "bookings")
        );

        const existingBooking =
          querySnapshot.docs.find((doc) => {

            const data = doc.data();

            return (
              data.bookDate === booking.bookDate &&
              data.bookTime === booking.bookTime
            );

          });

        if (existingBooking) {

          setError(
            "This appointment slot was just booked. Please select another time."
          );

          await fetchBookings();

          return;
        }

        await addDoc(
          collection(db, "bookings"),
          {
            bookName: booking.bookName,

            details: booking.details,

            price: Number(booking.price),

            bookDate: booking.bookDate,

            bookTime: booking.bookTime,

             memberName: booking.memberName,
  memberType: booking.memberType,
  memberNumber: booking.memberNumber,
  expirationDate: booking.expirationDate,
  phoneNumber: booking.phoneNumber,

            status: "Booked",

            createdAt: serverTimestamp(),
          }
        );
      }

      // Reset form

      setBooking({
        bookName: "",
        details: "",
        price: "",
        bookDate: "",
        bookTime: "",

        memberName: "",
  memberType: "Regular",
  memberNumber: "",
  expirationDate: "",
  phoneNumber: "",
      });

      setEditingBookingId(null);

      setShowForm(false);

      await fetchBookings();

    } catch (error) {

      console.error(
        "Error saving booking:",
        error
      );

      setError(
        "Something went wrong while saving the booking."
      );

    } finally {

      setSaving(false);

    }
  };

  const selectedBooking = bookings.find(
  (booking) => booking.id === openMenuId
);


  // ================================
  // DELETE BOOKING
  // ================================

  const handleDeleteBooking = async (id) => {

    const confirmed = window.confirm(
      "Are you sure you want to delete this booking?"
    );

    if (!confirmed) {
      return;
    }

    try {

      await deleteDoc(
        doc(db, "bookings", id)
      );

      setOpenMenuId(null);

      await fetchBookings();

    } catch (error) {

      console.error(
        "Error deleting booking:",
        error
      );

      setError(
        "Failed to delete booking."
      );
    }
  };


  // ================================
// MARK BOOKING AS COMPLETE
// ================================

const handleCompleteBooking = async (id) => {
  const confirmed = window.confirm(
    "Are you sure you want to mark this booking as completed?"
  );

  if (!confirmed) {
    return;
  }

  try {
    await updateDoc(doc(db, "bookings", id), {
      status: "Completed",
      completedAt: serverTimestamp(),
    });

    setOpenMenuId(null);
    setMenuPosition(null);

    await fetchBookings();

  } catch (error) {
    console.error("Error completing booking:", error);

    setError("Failed to mark booking as completed.");
  }
};


// ================================
// MARK BOOKING AS CANCELLED
// ================================

const handleCancelBooking = async (id) => {
  const confirmed = window.confirm(
    "Are you sure you want to cancel this booking?"
  );

  if (!confirmed) {
    return;
  }

  try {
    await updateDoc(doc(db, "bookings", id), {
      status: "Cancelled",
      cancelledAt: serverTimestamp(),
    });

    setOpenMenuId(null);
    setMenuPosition(null);

    await fetchBookings();

  } catch (error) {
    console.error("Error cancelling booking:", error);

    setError("Failed to cancel booking.");
  }
};


  // ================================
  // FORMAT PRICE
  // ================================

  const formatPrice = (price) => {

    return `₱${Number(price).toLocaleString(
      "en-PH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  };

  const activeBookings = bookings.filter(
    (item) => item.status === "Booked"
  );
  const normalizedSearch = bookingSearch.trim().toLocaleLowerCase();
  const filteredBookings = activeBookings.filter((item) =>
    (item.bookName || "").toLocaleLowerCase().includes(normalizedSearch)
  );


  return (

    <div className="booking-page">

      {/* =========================
          HEADER
      ========================== */}

      <div className="booking-header">

        <div>

          <h1>
            Booking Management
          </h1>

          <p>
            Manage your bookings and appointments.
          </p>

        </div>

        <button
          className="add-booking-btn"
          onClick={handleAddBooking}
        >
          + Add Booking
        </button>

      </div>


      {/* =========================
          BOOKING LIST
      ========================== */}

      <div className="booking-list">

        <div className="booking-list-header">

          <h2>
            Bookings
          </h2>

          <div className="booking-list-tools">
            <span>
              {activeBookings.length} bookings
            </span>
            <label className="booking-search">
              <span className="visually-hidden">Search bookings by package or book name</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                focusable="false"
              >
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" />
              </svg>
              <input
                type="search"
                value={bookingSearch}
                onChange={(event) => setBookingSearch(event.target.value)}
                placeholder="Search package or book name"
              />
            </label>
          </div>

        </div>


        {bookings.length === 0 ? (

          <div className="no-bookings">

            <p>
              No bookings yet.
            </p>

          </div>

        ) : (

          <div className="booking-table-container">

            <table className="booking-table">

              <thead>

                <tr>

                  <th>
                    Book / Package
                  </th>

                  <th>
                    Details
                  </th>

                  <th>
                    Price
                  </th>

                  <th>
                    Date
                  </th>

                  <th>
                    Time
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Action
                  </th>

                </tr>

              </thead>


              <tbody>

                {filteredBookings.length === 0 ? (
                  <tr>
                    <td className="booking-search-empty" colSpan="7">
                      {activeBookings.length === 0
                        ? "No active bookings."
                        : `No bookings match “${bookingSearch.trim()}”.`}
                    </td>
                  </tr>
                ) : filteredBookings.map((item) => (

                  <tr key={item.id}>

                    <td>

                      <strong>
                        {item.bookName}
                      </strong>

                    </td>

                    <td>
                      {item.details}
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

                      <span className="booking-status">
                        {item.status}
                      </span>

                    </td>


                    {/* THREE DOT MENU */}

                    <td className="booking-action-cell">

                      <button
                        className="three-dot-btn"
                        type="button"
                        aria-label={`Actions for ${item.bookName}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === item.id}
                        onClick={(event) => {
                          if (openMenuId === item.id) {
                            setOpenMenuId(null);
                            return;
                          }

                          const buttonRect =
                            event.currentTarget.getBoundingClientRect();
                          const menuWidth = 180;
                          const menuHeight = 180;
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

      </div>

      {selectedBooking && menuPosition &&
        createPortal(
          <div
            className="booking-menu"
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
              onClick={() => handleEditBooking(selectedBooking)}
            >
              Edit
            </button>

            {selectedBooking.status === "Booked" && (
              <>
                <button
                  className="complete-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    handleCompleteBooking(selectedBooking.id)
                  }
                >
                  Mark as Complete
                </button>

                <button
                  className="cancel-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    handleCancelBooking(selectedBooking.id)
                  }
                >
                  Mark as Cancelled
                </button>
              </>
            )}

            <button
              className="delete-menu-item"
              type="button"
              role="menuitem"
              onClick={() => handleDeleteBooking(selectedBooking.id)}
            >
              Delete
            </button>
          </div>,
          document.body
        )}

      {/* =========================
          ADD / EDIT FORM
      ========================== */}

      {showForm && (

        <div className="booking-overlay">

          <div className="booking-form-card">

            <div className="form-header">

              <h2>
                {editingBookingId
                  ? "Edit Booking"
                  : "Add Booking"}
              </h2>

              <button
                className="close-btn"
                onClick={() => {
                  setShowForm(false);
                  setEditingBookingId(null);
                  setError("");
                }}
              >
                ×
              </button>

            </div>


            <form onSubmit={handleSubmit}>


              {/* BOOK NAME */}

              <div className="form-group">

                <label>
                  Book / Package Name
                </label>

                <input
                  type="text"
                  name="bookName"
                  placeholder="Enter book or package name"
                  value={booking.bookName}
                  onChange={handleChange}
                  required
                />

              </div>


              {/* DETAILS */}

              <div className="form-group">

                <label>
                  Details
                </label>

                <textarea
                  name="details"
                  placeholder="Enter booking details"
                  value={booking.details}
                  onChange={handleChange}
                  rows="4"
                  required
                />

              </div>


              {/* PRICE */}

              <div className="form-group">

                <label>
                  Price
                </label>

                <input
                  type="number"
                  name="price"
                  placeholder="Enter price"
                  min="0"
                  step="0.01"
                  value={booking.price}
                  onChange={handleChange}
                  required
                />

              </div>

              {/* =========================
    SURESHOTS MEMBER
========================= */}

<div className="member-section">
  <h3>Sureshots Member Information</h3>

  <div className="form-group">
    <label>Member Name</label>

    <input
      type="text"
      name="memberName"
      placeholder="Enter member name"
      value={booking.memberName}
      onChange={handleChange}
      required
    />
  </div>

  <div className="form-row">

    {/* MEMBER TYPE */}
    <div className="form-group">
      <label>Member Type</label>

      <select
        name="memberType"
        value={booking.memberType}
        onChange={handleChange}
        required
      >
        <option value="Regular">Regular</option>
        <option value="Gold">Gold</option>
        <option value="Diamond">Diamond</option>
      </select>
    </div>

    {/* MEMBER NUMBER */}
    <div className="form-group">
      <label>Member Number</label>

      <input
        type="text"
        name="memberNumber"
        placeholder="Enter member number"
        value={booking.memberNumber}
        onChange={handleChange}
        required
      />
    </div>

  </div>

  <div className="form-row">

    {/* EXPIRATION DATE */}
    <div className="form-group">
      <label>Expiration Date</label>

      <input
        type="date"
        name="expirationDate"
        value={booking.expirationDate}
        onChange={handleChange}
        required
      />
    </div>

    {/* PHONE NUMBER */}
    <div className="form-group">
      <label>Phone Number</label>

      <input
        type="tel"
        name="phoneNumber"
        placeholder="09XXXXXXXXX"
        value={booking.phoneNumber}
        onChange={handleChange}
        required
      />
    </div>

  </div>
</div>


              {/* DATE */}

              <div className="form-group">

                <label>
                  Booking Date
                </label>

                <input
                  type="date"
                  name="bookDate"
                  value={booking.bookDate}
                  onChange={handleChange}
                  required
                />

              </div>


              {/* TIME */}

              <div className="form-group">

                <label>
                  Booking Time
                </label>

                <select
                  name="bookTime"
                  value={booking.bookTime}
                  onChange={handleChange}
                  required
                  disabled={!booking.bookDate}
                >

                  <option value="">
                    {!booking.bookDate
                      ? "Select a date first"
                      : "Select time"}
                  </option>


                  {timeSlots.map((time) => {

                    const booked =
                      isTimeBooked(
                        booking.bookDate,
                        time
                      );

                    return (

                      <option
                        key={time}
                        value={time}
                        disabled={booked}
                      >
                        {time}

                        {booked
                          ? " - BOOKED"
                          : ""}

                      </option>

                    );

                  })}

                </select>

              </div>


              {/* ERROR */}

              {error && (

                <div className="booking-error">

                  {error}

                </div>

              )}


              {/* BUTTONS */}

              <div className="form-actions">

                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {
                    setShowForm(false);
                    setEditingBookingId(null);
                    setError("");
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>


                <button
                  type="submit"
                  className="save-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingBookingId
                    ? "Update Booking"
                    : "Save Booking"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

      {viewingBooking && (
  <div className="booking-overlay">
    <div className="booking-view-card">

      <div className="form-header">
        <h2>Booking Information</h2>

        <button
          className="close-btn"
          type="button"
          onClick={() => setViewingBooking(null)}
        >
          ×
        </button>
      </div>

      {/* BOOKING INFORMATION */}

      <div className="view-section">
        <h3>Booking Details</h3>

        <div className="view-grid">

          <div className="view-item">
            <span>Book / Package</span>
            <strong>
              {viewingBooking.bookName || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Status</span>
            <strong
              className={`booking-status ${
                viewingBooking.status === "Completed"
                  ? "completed"
                  : viewingBooking.status === "Cancelled"
                  ? "cancelled"
                  : ""
              }`}
            >
              {viewingBooking.status || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Price</span>
            <strong>
              {formatPrice(viewingBooking.price)}
            </strong>
          </div>

          <div className="view-item">
            <span>Booking Date</span>
            <strong>
              {viewingBooking.bookDate || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Booking Time</span>
            <strong>
              {viewingBooking.bookTime || "-"}
            </strong>
          </div>

        </div>

        <div className="view-item full-width">
          <span>Details</span>
          <p>
            {viewingBooking.details || "-"}
          </p>
        </div>
      </div>

      {/* SURESHOTS MEMBER */}

      <div className="view-section">
        <h3>Sureshots Member Information</h3>

        <div className="view-grid">

          <div className="view-item">
            <span>Member Name</span>
            <strong>
              {viewingBooking.memberName || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Member Type</span>
            <strong>
              {viewingBooking.memberType || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Member Number</span>
            <strong>
              {viewingBooking.memberNumber || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Expiration Date</span>
            <strong>
              {viewingBooking.expirationDate || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Phone Number</span>
            <strong>
              {viewingBooking.phoneNumber || "-"}
            </strong>
          </div>

        </div>
      </div>

      {/* CLOSE */}

      <div className="form-actions">
        <button
          type="button"
          className="cancel-btn"
          onClick={() => setViewingBooking(null)}
        >
          Close
        </button>
      </div>

    </div>
  </div>
)}

    </div>
  );
}