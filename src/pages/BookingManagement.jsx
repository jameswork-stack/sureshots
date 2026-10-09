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

const getRangeItemSubtotal = (item) => {
  if (item.pricing === "corkage-flat") {
    return 1000;
  }

  if (item.pricing === "corkage-per-round") {
    return item.quantity * 8;
  }

  return item.unitPrice * item.quantity;
};

export default function BookingManagement() {
  const [showForm, setShowForm] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");

  const [viewingBooking, setViewingBooking] = useState(null);
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
  const [rangePackageItems, setRangePackageItems] = useState([]);
  const [rangePackageCategory, setRangePackageCategory] = useState(
    Object.keys(RANGE_PACKAGE_CATALOG)[0]
  );
  const [rangePackageOption, setRangePackageOption] = useState(
    RANGE_PACKAGE_CATALOG[Object.keys(RANGE_PACKAGE_CATALOG)[0]][0].name
  );
  const [rangePackageQuantity, setRangePackageQuantity] = useState(1);

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

  const handleRemoveRangePackageItem = (indexToRemove) => {
    setRangePackageItems((items) =>
      items.filter((_, index) => index !== indexToRemove)
    );

    if (rangePackageItems.length === 1 && booking.bookName === "Range Package") {
      setBooking((current) => ({
        ...current,
        bookName: "",
        details: "",
        price: "",
      }));
    }
  };


  // ================================
  // OPEN ADD FORM
  // ================================

  const handleAddBooking = () => {
  setEditingBookingId(null);
    setRangePackageItems([]);

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
    const existingPackageItems = Array.isArray(item.packageItems)
      ? item.packageItems
      : [];
    const existingPackageTotal = existingPackageItems.reduce(
      (total, packageItem) => total + getRangeItemSubtotal(packageItem),
      0
    );
    const additionalAmount = existingPackageItems.length
      ? item.additionalAmount ??
        Math.max(0, Number(item.price || 0) - existingPackageTotal)
      : item.price ?? "";

    setEditingBookingId(item.id);
    setRangePackageItems(existingPackageItems);
    setBooking({
      customerType:
        item.customerType ||
        (item.memberName || item.memberNumber ? "member" : "regular"),
      bookName: item.bookName || "",
      details: item.details || "",
      price: additionalAmount,
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

    const isRangePackage = rangePackageItems.length > 0;
    const packageTotal = rangePackageItems.reduce(
      (total, item) => total + getRangeItemSubtotal(item),
      0
    );
    const additionalAmount = isRangePackage
      ? Number(booking.price || 0)
      : 0;
    const bookName = isRangePackage ? "Range Package" : booking.bookName.trim();
    const details = isRangePackage
      ? rangePackageItems
          .map(
            (item) =>
              `${item.category}: ${item.name} — ${item.quantity} × ${
                item.unit
              }: ${formatPrice(getRangeItemSubtotal(item))}`
          )
          .join("\n")
      : booking.details.trim();
    const price = isRangePackage
      ? packageTotal + additionalAmount
      : Number(booking.price);

    if (
  !booking.customerType ||
  !bookName ||
  !details ||
  (!isRangePackage && booking.price === "") ||
      !Number.isFinite(price) ||
      price < 0 ||
  (isRangePackage &&
    (!Number.isFinite(additionalAmount) || additionalAmount < 0)) ||
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
        additionalAmount,
        packageCategory: isRangePackage ? "Range Package" : "",
        packageItems: isRangePackage
          ? rangePackageItems.map((item) => ({
              category: item.category,
              name: item.name,
              unitPrice: item.unitPrice,
              unit: item.unit,
              quantity: item.quantity,
              pricing: item.pricing || "",
              subtotal: getRangeItemSubtotal(item),
            }))
          : [],
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
      setRangePackageItems([]);

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

  const selectedRangeOptions =
    RANGE_PACKAGE_CATALOG[rangePackageCategory];
  const selectedRangePackageOption =
    selectedRangeOptions.find(
      (item) => item.name === rangePackageOption
    ) || selectedRangeOptions[0];

  const handleRangePackageCategoryChange = (event) => {
    const nextCategory = event.target.value;
    setRangePackageCategory(nextCategory);
    setRangePackageOption(RANGE_PACKAGE_CATALOG[nextCategory][0].name);
  };

  const handleAddRangePackageItem = () => {
    const quantity = Number(rangePackageQuantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Enter a whole number quantity of at least 1.");
      return;
    }

    if (
      selectedRangePackageOption.pricing === "corkage-per-round" &&
      quantity > 100
    ) {
      setError("Choose the 101+ rounds flat-rate option for quantities above 100.");
      return;
    }

    if (
      selectedRangePackageOption.pricing === "corkage-flat" &&
      quantity < 101
    ) {
      setError("The flat-rate corkage option applies to 101 rounds or more.");
      return;
    }

    if (
      selectedRangePackageOption.pricing?.startsWith("corkage") &&
      rangePackageItems.some((item) =>
        item.pricing?.startsWith("corkage")
      )
    ) {
      setError("Only one ammunition corkage option can be added to a booking.");
      return;
    }

    setRangePackageItems((items) => [
      ...items,
      {
        ...selectedRangePackageOption,
        category: rangePackageCategory,
        quantity,
      },
    ]);
    setRangePackageQuantity(1);
    setError("");
  };

  const rangePackageTotal = rangePackageItems.reduce(
    (total, item) => total + getRangeItemSubtotal(item),
    0
  );
  const hasRangePackageItems = rangePackageItems.length > 0;
  const rangePackageDetails = rangePackageItems
    .map(
      (item) =>
        `${item.category}: ${item.name} — ${item.quantity} × ${
          item.unit
        }: ${formatPrice(getRangeItemSubtotal(item))}`
    )
    .join("\n");

  const getBookingDetails = (bookingRecord) => {
    if (bookingRecord.details?.trim()) {
      return bookingRecord.details;
    }

    if (
      Array.isArray(bookingRecord.packageItems) &&
      bookingRecord.packageItems.length > 0
    ) {
      return bookingRecord.packageItems
        .map((item) => {
          const subtotal = item.subtotal ?? getRangeItemSubtotal(item);
          return `${item.category || "Range Package"}: ${item.name} — ${
            item.quantity
          } × ${item.unit}: ${formatPrice(subtotal)}`;
        })
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

                    <td className="booking-package-details">
                      {getBookingDetails(item)}
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
                  <h3>Range Package Items</h3>
                  <p>
                    Add one or more range fees or ammunition items. The booking
                    total updates automatically.
                  </p>
                </div>

                <div className="range-package-controls">
                  <div className="form-group">
                    <label htmlFor="rangePackageCategory">Category</label>
                    <select
                      id="rangePackageCategory"
                      value={rangePackageCategory}
                      onChange={handleRangePackageCategoryChange}
                    >
                      {Object.keys(RANGE_PACKAGE_CATALOG).map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="rangePackageOption">Package item</label>
                    <select
                      id="rangePackageOption"
                      value={selectedRangePackageOption.name}
                      onChange={(event) =>
                        setRangePackageOption(event.target.value)
                      }
                    >
                      {selectedRangeOptions.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} — {formatPrice(item.unitPrice)} /{" "}
                          {item.unit}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group range-package-quantity">
                    <label htmlFor="rangePackageQuantity">Quantity</label>
                    <input
                      id="rangePackageQuantity"
                      type="number"
                      min="1"
                      step="1"
                      value={rangePackageQuantity}
                      onChange={(event) =>
                        setRangePackageQuantity(event.target.value)
                      }
                    />
                  </div>

                  <button
                    className="add-package-item-btn"
                    type="button"
                    onClick={handleAddRangePackageItem}
                  >
                    Add item
                  </button>
                </div>

                {rangePackageItems.length > 0 && (
                  <div className="range-package-items">
                    {rangePackageItems.map((item, index) => (
                      <div
                        className="range-package-item"
                        key={`${item.name}-${index}`}
                      >
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {item.category} · {item.quantity} × {item.unit}
                          </span>
                        </div>
                        <strong>{formatPrice(getRangeItemSubtotal(item))}</strong>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => handleRemoveRangePackageItem(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="range-package-total">
                      <span>Package items subtotal</span>
                      <strong>{formatPrice(rangePackageTotal)}</strong>
                    </div>
                    <div className="range-package-total">
                      <span>Total amount</span>
                      <strong>
                        {formatPrice(
                          rangePackageTotal + Number(booking.price || 0)
                        )}
                      </strong>
                    </div>
                  </div>
                )}
              </section>


              {/* BOOK NAME */}

              <div className="form-group">

                <label>
                  Book / Package Name
                </label>

                <input
                  type="text"
                  name="bookName"
                  placeholder="Enter book or package name"
                  value={hasRangePackageItems ? "Range Package" : booking.bookName}
                  onChange={handleChange}
                  readOnly={hasRangePackageItems}
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
                    hasRangePackageItems ? rangePackageDetails : booking.details
                  }
                  onChange={handleChange}
                  readOnly={hasRangePackageItems}
                  rows="4"
                  required
                />

              </div>


              {/* PRICE */}

              <div className="form-group">

                <label>
                  {hasRangePackageItems ? "Additional Amount" : "Booking Price"}
                </label>

                <input
                  type="number"
                  name="price"
                  placeholder={
                    hasRangePackageItems
                      ? "Enter additional amount (optional)"
                      : "Enter booking price"
                  }
                  min="0"
                  step="0.01"
                  value={booking.price}
                  onChange={handleChange}
                  required={!hasRangePackageItems}
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

        <div className="view-item full-width">
          <span>Details</span>
          <p className="booking-package-details">
            {getBookingDetails(viewingBooking)}
          </p>
        </div>
      </div>

      {Array.isArray(viewingBooking.packageItems) &&
        viewingBooking.packageItems.length > 0 && (
          <div className="view-section">
            <h3>Range Package Items</h3>
            <div className="view-package-items">
              {viewingBooking.packageItems.map((item, index) => {
                const subtotal =
                  item.subtotal ?? getRangeItemSubtotal(item);

                return (
                  <div
                    className="view-package-item"
                    key={`${item.name}-${index}`}
                  >
                    <div className="view-package-item-info">
                      <strong>{item.name}</strong>
                      <span>
                        {item.category || "Range Package"} · {item.quantity} ×{" "}
                        {item.unit}
                        {" · "}
                        {item.pricing === "corkage-flat"
                          ? "₱1,000 flat rate"
                          : `${formatPrice(item.unitPrice)} per ${item.unit}`}
                      </span>
                    </div>
                    <strong>{formatPrice(subtotal)}</strong>
                  </div>
                );
              })}
              {Number(viewingBooking.additionalAmount) > 0 && (
                <div className="view-package-total">
                  <span>Additional amount</span>
                  <strong>
                    {formatPrice(viewingBooking.additionalAmount)}
                  </strong>
                </div>
              )}
              <div className="view-package-total">
                <span>Total amount</span>
                <strong>{formatPrice(viewingBooking.price)}</strong>
              </div>
            </div>
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

    </div>
  );
}