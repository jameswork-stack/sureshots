import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import "../styles/bookingManagement.css";

const RANGE_PACKAGE_CATALOG = {
  "Range Fee Rates": [
    { name: "Range Fee", unitPrice: 800, unit: "booking" },
    { name: "Target Board", unitPrice: 50, unit: "board" },
    {
      name: "Exclusive use of the range",
      unitPrice: 2000,
      unit: "hour",
    },
  ],
  "Ammunition Corkage": [
    {
      name: "1–100 rounds (₱8 per round)",
      unitPrice: 8,
      unit: "round",
      pricing: "corkage-per-round",
    },
    {
      name: "101+ rounds (₱1,000 flat)",
      unitPrice: 1000,
      unit: "rounds",
      pricing: "corkage-flat",
    },
  ],
  "Ammunition Prices": [
    { name: ".22 High Velocity (50s)", unitPrice: 1000, unit: "box of 50" },
    { name: ".38 Special", unitPrice: 38, unit: "round" },
    { name: "9MM FMJ", unitPrice: 35, unit: "round" },
    { name: "12 Gauge Birdshots", unitPrice: 60, unit: "round" },
    { name: "5.56", unitPrice: 75, unit: "round" },
    { name: "9m.m Teflon", unitPrice: 20, unit: "round" },
    { name: "40 cal teflon", unitPrice: 20, unit: "round" },
    { name: "45 acp teflon", unitPrice: 28, unit: "round" },
  ],
};

const RANGE_PACKAGE_CATEGORY_LABELS = {
  "Range Fee Rates": "Range Fee",
  "Ammunition Corkage": "Ammunition Corkage Fee",
  "Ammunition Prices": "Ammunition Fee",
};

const getRangePackageContents = (categories) =>
  categories.map((category) => ({
    category,
    items: RANGE_PACKAGE_CATALOG[category].map((item) => ({
      name: item.name,
      unitPrice: item.unitPrice,
      unit: item.unit,
      pricing: item.pricing || "",
    })),
  }));

export default function BookingManagement() {
  const [showForm, setShowForm] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");

  const [viewingBooking, setViewingBooking] = useState(null);
  const [printingBooking, setPrintingBooking] = useState(null);
  const [loadingBookingView, setLoadingBookingView] = useState(false);
  const [bookingViewError, setBookingViewError] = useState("");

  const [editingBookingId, setEditingBookingId] = useState(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);

const [booking, setBooking] = useState({
  customerType: "",
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
  const [rangePackageCategories, setRangePackageCategories] = useState([]);

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

  const handleRangePackageCategoryChange = (category) => {
    setRangePackageCategories((categories) =>
      categories.includes(category)
        ? categories.filter((selectedCategory) => selectedCategory !== category)
        : [...categories, category]
    );
    setError("");
  };


  // ================================
  // OPEN ADD FORM
  // ================================

  const handleAddBooking = () => {
  setEditingBookingId(null);
    setRangePackageCategories([]);

    setBooking({
    customerType: "",
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
    const existingPackageCategories = Array.isArray(item.packageCategories)
      ? item.packageCategories
      : Array.isArray(item.packageContents)
      ? item.packageContents.map((content) => content.category)
      : Array.isArray(item.packageItems)
      ? [...new Set(item.packageItems.map((packageItem) => packageItem.category))]
      : [];

    setEditingBookingId(item.id);
    setRangePackageCategories(existingPackageCategories);
    setBooking({
      customerType:
        item.customerType ||
        (item.memberName || item.memberNumber ? "member" : "regular"),
      bookName: item.bookName || "",
      details: item.details || "",
      price: item.price ?? "",
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
  const handleViewBooking = async (item) => {
    setOpenMenuId(null);
    setMenuPosition(null);
    setViewingBooking(item);
    setLoadingBookingView(true);
    setBookingViewError("");

    try {
      const bookingSnapshot = await getDoc(doc(db, "bookings", item.id));

      if (!bookingSnapshot.exists()) {
        setBookingViewError("This booking could not be found in the database.");
        return;
      }

      setViewingBooking({
        id: bookingSnapshot.id,
        ...bookingSnapshot.data(),
      });
    } catch (viewError) {
      console.error("Error loading booking details:", viewError);
      setBookingViewError("Failed to load booking details from the database.");
    } finally {
      setLoadingBookingView(false);
    }
  };


  // ================================
  // SAVE / UPDATE BOOKING
  // ================================

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");

    const isRangePackage = rangePackageCategories.length > 0;
    const bookName = booking.bookName.trim();
    const details = isRangePackage
      ? getRangePackageContents(rangePackageCategories)
          .map(
            ({ category, items }) =>
              `${RANGE_PACKAGE_CATEGORY_LABELS[category]}:\n${items
                .map(
                  (item) =>
                    `- ${item.name}: ${getRangePackageItemRate(item)}`
                )
                .join("\n")}`
          )
          .join("\n\n")
      : booking.details.trim();
    const price = Number(booking.price);

    if (
  !booking.customerType ||
  !bookName ||
  !details ||
  booking.price === "" ||
  !Number.isFinite(price) ||
  price < 0 ||
  !booking.bookDate ||
      !booking.bookTime
    ) {
  setError("Please complete all required booking fields.");
  return;
}

if (
  booking.customerType === "member" &&
  (
    !booking.memberName.trim() ||
    !booking.memberType ||
    !booking.memberNumber.trim() ||
    !booking.expirationDate ||
    !booking.phoneNumber.trim()
  )
) {
  setError("Please complete all Sureshots member information.");
  return;
}

    try {

      setSaving(true);

      const bookingData = {
        customerType: booking.customerType,
        bookName,
        details,
        price,
        packageCategory: isRangePackage ? "Range Package" : "",
        packageCategories: rangePackageCategories,
        packageContents: getRangePackageContents(rangePackageCategories),
        packageItems: [],
        bookDate: booking.bookDate,
        bookTime: booking.bookTime,
        memberName:
          booking.customerType === "member" ? booking.memberName.trim() : "",
        memberType:
          booking.customerType === "member" ? booking.memberType : "",
        memberNumber:
          booking.customerType === "member" ? booking.memberNumber.trim() : "",
        expirationDate:
          booking.customerType === "member" ? booking.expirationDate : "",
        phoneNumber:
          booking.customerType === "member" ? booking.phoneNumber.trim() : "",
      };

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
          ...bookingData,
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
            ...bookingData,
            status: "Booked",
            createdAt: serverTimestamp(),
          }
        );
      }

      // Reset form

      setBooking({
        customerType: "",
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
      setRangePackageCategories([]);

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
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice)) {
      return "—";
    }

    return `₱${numericPrice.toLocaleString(
      "en-PH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  };

  const getRangePackageItemRate = (item) =>
    item.pricing === "corkage-flat"
      ? `${formatPrice(item.unitPrice)} flat rate`
      : `${formatPrice(item.unitPrice)} per ${item.unit}`;

  const hasRangePackageCategories = rangePackageCategories.length > 0;
  const selectedRangePackageContents = getRangePackageContents(
    rangePackageCategories
  );
  const rangePackageDetails = selectedRangePackageContents
    .map(
      ({ category, items }) =>
        `${RANGE_PACKAGE_CATEGORY_LABELS[category]}:\n${items
          .map(
            (item) =>
              `- ${item.name}: ${getRangePackageItemRate(item)}`
          )
          .join("\n")}`
    )
    .join("\n\n");

  const getBookingDetails = (bookingRecord) => {
    if (bookingRecord.details?.trim()) {
      return bookingRecord.details;
    }

    if (
      Array.isArray(bookingRecord.packageContents) &&
      bookingRecord.packageContents.length > 0
    ) {
      return bookingRecord.packageContents
        .map(
          ({ category, items }) =>
            `${RANGE_PACKAGE_CATEGORY_LABELS[category] || category}:\n${items
              .map(
                (item) =>
                  `- ${item.name}: ${getRangePackageItemRate(item)}`
              )
              .join("\n")}`
        )
        .join("\n\n");
    }

    if (
      Array.isArray(bookingRecord.packageItems) &&
      bookingRecord.packageItems.length > 0
    ) {
      return bookingRecord.packageItems
        .map(
          (item) =>
            `${RANGE_PACKAGE_CATEGORY_LABELS[item.category] || item.category || "Range Package"}: ${item.name} — ${item.quantity} × ${item.unit} (${getRangePackageItemRate(item)})`
        )
        .join("\n");
    }

    return "-";
  };

  const activeBookings = bookings.filter(
    (item) => item.status === "Booked"
  );
  const normalizedSearch = bookingSearch.trim().toLocaleLowerCase();
  const filteredBookings = activeBookings.filter((item) =>
    [
      item.bookName,
      ...(Array.isArray(item.packageContents)
        ? item.packageContents.flatMap((content) =>
            content.items.map((packageItem) => packageItem.name)
          )
        : []),
      ...(Array.isArray(item.packageItems)
        ? item.packageItems.map((packageItem) => packageItem.name)
        : []),
    ]
      .some((name) => (name || "").toLocaleLowerCase().includes(normalizedSearch))
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
                    <td className="booking-search-empty" colSpan="6">
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
                          const menuWidth = 200;
                          const menuHeight = 260;
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
    onClick={() => handleViewBooking(selectedBooking)}
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

              {/* CUSTOMER TYPE */}
<div className="form-group">
  <label htmlFor="customerType">Customer Type</label>

  <select
    id="customerType"
    name="customerType"
    value={booking.customerType}
    onChange={handleChange}
    required
  >
    <option value="">Select Customer Type</option>
    <option value="regular">Regular Customer</option>
    <option value="member">Sureshots Member</option>
  </select>
</div>


              <section className="range-package-builder">
                <div className="range-package-heading">
                  <h3>Range Package</h3>
                  <p>
                    Choose one or more package sections. The selected sections
                    show their catalog contents; enter the booking price separately.
                  </p>
                </div>

                <div className="range-package-category-options">
                  {Object.keys(RANGE_PACKAGE_CATALOG).map((category) => (
                    <label
                      className={`range-package-category-option ${
                        rangePackageCategories.includes(category)
                          ? "selected"
                          : ""
                      }`}
                      key={category}
                    >
                      <input
                        type="checkbox"
                        checked={rangePackageCategories.includes(category)}
                        onChange={() =>
                          handleRangePackageCategoryChange(category)
                        }
                      />
                      <span>{RANGE_PACKAGE_CATEGORY_LABELS[category]}</span>
                    </label>
                  ))}
                </div>

                {selectedRangePackageContents.map(({ category, items }) => (
                  <div className="range-package-category-content" key={category}>
                    <h4>{RANGE_PACKAGE_CATEGORY_LABELS[category]}</h4>
                    <ul>
                      {items.map((item) => (
                        <li key={item.name}>
                          <span>{item.name}</span>
                          <strong>
                            {getRangePackageItemRate(item)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>


              {/* BOOK NAME */}

              <div className="form-group">

                <label>
                  Book / Names :
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
                  value={
                    hasRangePackageCategories ? rangePackageDetails : booking.details
                  }
                  onChange={handleChange}
                  readOnly={hasRangePackageCategories}
                  rows="4"
                  required
                />

              </div>


              {/* PRICE */}

              <div className="form-group">

                <label>
                  {hasRangePackageCategories ? "Package Price" : "Booking Price"}
                </label>

                <input
                  type="number"
                  name="price"
                  placeholder={
                    hasRangePackageCategories
                      ? "Enter the package price"
                      : "Enter booking price"
                  }
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

{booking.customerType === "member" && (
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
)}


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
      {loadingBookingView && (
        <p role="status">Loading booking details from the database…</p>
      )}
      {bookingViewError && (
        <p role="alert" className="booking-error">
          {bookingViewError}
        </p>
      )}

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
            <span>Customer Type</span>
            <strong>
              {viewingBooking.customerType === "member"
                ? "Sureshots Member"
                : viewingBooking.customerType === "regular"
                ? "Regular Customer"
                : "-"}
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

        {(!Array.isArray(viewingBooking.packageContents) ||
          viewingBooking.packageContents.length === 0) && (
          <div className="view-item full-width">
            <span>Details</span>
            <p className="booking-package-details">
              {getBookingDetails(viewingBooking)}
            </p>
          </div>
        )}
      </div>

      {((Array.isArray(viewingBooking.packageContents) &&
        viewingBooking.packageContents.length > 0) ||
        (Array.isArray(viewingBooking.packageItems) &&
          viewingBooking.packageItems.length > 0)) && (
          <div className="view-section">
            <h3>Range Package Contents</h3>
            {Array.isArray(viewingBooking.packageContents) &&
            viewingBooking.packageContents.length > 0 ? (
              viewingBooking.packageContents.map(({ category, items }) => (
                <div className="view-package-category" key={category}>
                  <h4>
                    {RANGE_PACKAGE_CATEGORY_LABELS[category] || category}
                  </h4>
                  <ul>
                    {items.map((item) => (
                      <li key={item.name}>
                        <span>{item.name}</span>
                        <strong>
                          {getRangePackageItemRate(item)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <div className="view-package-items">
                {viewingBooking.packageItems.map((item, index) => (
                  <div
                    className="view-package-item"
                    key={`${item.name}-${index}`}
                  >
                    <div className="view-package-item-info">
                      <strong>{item.name}</strong>
                      <span>
                        {RANGE_PACKAGE_CATEGORY_LABELS[item.category] ||
                          item.category ||
                          "Range Package"}{" "}
                        · {item.quantity} × {item.unit} ·{" "}
                        {getRangePackageItemRate(item)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {/* SURESHOTS MEMBER */}
{viewingBooking.customerType === "member" && (
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
      )}

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

      {printingBooking && (
        <article className="booking-print-sheet" aria-hidden="true">
          <header className="booking-print-header">
            <p>SURESHOTS · BOOKING RECORD</p>
            <h1>{printingBooking.bookName || "Booking"}</h1>
          </header>

          <section className="booking-print-section">
            <h2>Booking Information</h2>
            <dl className="booking-print-grid">
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
            <section className="booking-print-section">
              <h2>Range Package Contents</h2>
              {printingBooking.packageContents.map(({ category, items }) => (
                <div className="booking-print-package" key={category}>
                  <h3>
                    {RANGE_PACKAGE_CATEGORY_LABELS[category] || category}
                  </h3>
                  <ul>
                    {items.map((item) => (
                      <li key={item.name}>
                        <span>{item.name}</span>
                        <strong>{getRangePackageItemRate(item)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : Array.isArray(printingBooking.packageItems) &&
            printingBooking.packageItems.length > 0 ? (
            <section className="booking-print-section">
              <h2>Range Package Contents</h2>
              <ul className="booking-print-list">
                {printingBooking.packageItems.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span>
                      {RANGE_PACKAGE_CATEGORY_LABELS[item.category] ||
                        item.category ||
                        "Range Package"}
                      : {item.name} · {item.quantity} × {item.unit}
                    </span>
                    <strong>{getRangePackageItemRate(item)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="booking-print-section">
              <h2>Details</h2>
              <p>{printingBooking.details || "-"}</p>
            </section>
          )}

          {printingBooking.customerType === "member" && (
            <section className="booking-print-section">
              <h2>Sureshots Member Information</h2>
              <dl className="booking-print-grid">
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
  );
}