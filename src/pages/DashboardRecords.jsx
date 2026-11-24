import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";

import { db } from "../firebase";
import { formatDisplayDate } from "../utils/date";
import "../styles/dashboardRecords.css";
import { createPortal } from "react-dom";

const METRICS = {
  "firearm-sales": {
    title: "Total Firearm Package Sales",
    description: "Completed booking revenue, including Range Fee and Target Board sales.",
    type: "bookings",
  },
  "range-sales": {
    title: "Total Range Sales",
    description: "Completed booking range sales and Sold Management transactions.",
    type: "range-sales",
  },
  "range-sold-sales": {
    title: "Total Range & Product Sales",
    description: "Range package items and products sold through Sold Management.",
    type: "range-sold-sales",
  },
  "range-fee-availed": {
    title: "Total Range Fee Availed",
    description: "Range Fee quantities in completed bookings.",
    type: "range-fee",
  },
  bookings: {
    title: "Total Bookings",
    description: "Active bookings included in this total.",
    type: "bookings-list",
  },
  "completed-bookings": {
    title: "Total Completed Bookings",
    description: "Completed bookings included in this total.",
    type: "bookings-list",
  },
  "present-members": {
    title: "Present Members",
    description: "Attendance records marked Present included in this total.",
    type: "attendance",
  },
};

const getDateFromValue = (value) => {
  if (!value) return null;

  // Firestore Timestamp
  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  // JavaScript Date
  if (value instanceof Date) {
    return value;
  }

  // Date string with or without time
  if (typeof value === "string") {
    const date = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T00:00:00`
        : value
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const getRecordSortTime = (record, date) => {
  const timestamp =
    getDateFromValue(record.completedAt) ||
    getDateFromValue(record.createdAt) ||
    date;

  return timestamp?.getTime() ?? 0;
};

const getBookingDate = (booking) =>
  booking.completedAt?.toDate
    ? booking.completedAt.toDate()
    : getDateFromValue(booking.bookDate);

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (date) => {
  if (!date) return "-";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const isInSelectedRange = (date, from, to) => {
  if (!date) return false;
  const key = formatDateKey(date);
  return (!from || key >= from) && (!to || key <= to);
};

const getPackageItems = (booking) => {
  if (Array.isArray(booking.packageContents) && booking.packageContents.length) {
    return booking.packageContents.flatMap((category) =>
      Array.isArray(category.items)
        ? category.items.filter((item) => !item.includedInPackagePrice).map((item) => ({
            ...item,
            category: category.category,
          }))
        : []
    );
  }
  return Array.isArray(booking.packageItems)
    ? booking.packageItems.filter((item) => !item.includedInPackagePrice)
    : [];
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

const getRangeSoldRows = (rangeSold, dateFrom, dateTo) =>
  rangeSold.flatMap((sale) => {
    const date = getDateFromValue(sale.soldDate);
    if (
      (dateFrom || dateTo) &&
      !isInSelectedRange(date, dateFrom, dateTo)
    ) {
      return [];
    }

    const contents = Array.isArray(sale.packageContents)
      ? sale.packageContents
      : [];
    const items = contents.flatMap((category) =>
      Array.isArray(category.items)
        ? category.items.map((item) => ({
            ...item,
            category: category.category,
          }))
        : []
    );
    const productItems = Array.isArray(sale.productItems)
      ? sale.productItems
      : [];
    const fallbackAmount =
      items.reduce((total, item) => {
        const unitPrice = Number(item.unitPrice);
        const quantity = item.quantity == null ? 1 : Number(item.quantity);
        return Number.isFinite(unitPrice) &&
          Number.isFinite(quantity) &&
          quantity >= 0
          ? total + unitPrice * quantity
          : total;
      }, 0) +
      productItems.reduce((total, item) => {
        const unitPrice = Number(item.unitPrice);
        const quantity = Number(item.quantity);
        return Number.isFinite(unitPrice) &&
          Number.isFinite(quantity) &&
          quantity >= 0
          ? total + unitPrice * quantity
          : total;
      }, 0);
    const amount =
      sale.totalAmount != null && Number.isFinite(Number(sale.totalAmount))
        ? Number(sale.totalAmount)
        : fallbackAmount;
    const itemDetails = [
      ...items.map(
        (item) =>
          `${item.name}${"quantity" in item ? ` × ${item.quantity}` : ""}`
      ),
      ...productItems.map((item) => `${item.name} × ${item.quantity}`),
    ].join(", ");

    return [{
      id: sale.id,
      date: formatDate(date),
      sortDate: date?.getTime() ?? 0,
      sortTime: getRecordSortTime(sale, date),
      record: sale.soldTo || "Walk-in sale",
      details: itemDetails || "Range Package sale",
      status: "Sold",
      amount,
    }];
  });

export default function DashboardRecords() {
  const { metric } = useParams();
  const [searchParams] = useSearchParams();
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const [bookings, setBookings] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [rangeSold, setRangeSold] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [today] = useState(() => formatDateKey(new Date()));
  const [openMenu, setOpenMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const definition = METRICS[metric];

  useEffect(() => {
  if (!openMenu) return;

  const handleClose = () => {
    setOpenMenu(null);
    setMenuPosition(null);
  };

  window.addEventListener("scroll", handleClose, true);
  window.addEventListener("resize", handleClose);

  return () => {
    window.removeEventListener("scroll", handleClose, true);
    window.removeEventListener("resize", handleClose);
  };
}, [openMenu]);

  useEffect(() => {
    let isCurrent = true;
    const loadRecords = async () => {
      setError("");
      try {
        if (definition?.type === "range-sales") {
          const [bookingsSnapshot, rangeSoldSnapshot] = await Promise.all([
            getDocs(collection(db, "bookings")),
            getDocs(collection(db, "rangeSold")),
          ]);
          if (!isCurrent) return;

          setBookings(
            bookingsSnapshot.docs.map((record) => ({
              id: record.id,
              ...record.data(),
            }))
          );
          setRangeSold(
            rangeSoldSnapshot.docs.map((record) => ({
              id: record.id,
              ...record.data(),
            }))
          );
          setAttendance([]);
          return;
        }

        const collectionName =
          definition?.type === "range-sold-sales"
            ? "rangeSold"
            : definition?.type === "attendance"
              ? "attendance"
              : "bookings";
        const snapshot = await getDocs(collection(db, collectionName));
        const records = snapshot.docs.map((record) => ({
          id: record.id,
          ...record.data(),
        }));
        if (!isCurrent) return;

        setBookings(collectionName === "bookings" ? records : []);
        setAttendance(collectionName === "attendance" ? records : []);
        setRangeSold(collectionName === "rangeSold" ? records : []);
      } catch (loadError) {
        console.error("Error loading dashboard records:", loadError);
        if (isCurrent) setError("Unable to load these records. Please try again.");
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    if (definition) loadRecords();

    return () => {
      isCurrent = false;
    };
  }, [definition]);

  const rows = useMemo(() => {
    if (!definition) return [];

    if (definition.type === "attendance") {
      return attendance.flatMap((record) => {
        const date = getDateFromValue(record.date);
        const selected = dateFrom || dateTo
          ? isInSelectedRange(date, dateFrom, dateTo)
          : record.date === today;
        if (record.status !== "Present" || !selected) return [];
        return [{
          id: record.id,
          date: formatDate(date),
          sortDate: date?.getTime() ?? 0,
          sortTime: getRecordSortTime(record, date),
          record: record.memberName || record.name || "Attendance record",
          details: record.timeIn ? `Time in ${record.timeIn}` : "-",
          status: record.status,
          quantity: 1,
        }];
      });
    }

    if (definition.type === "range-sold-sales") {
      return getRangeSoldRows(rangeSold, dateFrom, dateTo);
    }

    const bookingRows = bookings.flatMap((booking) => {
      const status = definition.type === "bookings-list"
        ? metric === "bookings" ? "Booked" : "Completed"
        : "Completed";
      if (booking.status !== status) return [];

      const date = status === "Completed"
        ? getBookingDate(booking)
        : getDateFromValue(booking.bookDate);
      if (
        (dateFrom || dateTo) &&
        !isInSelectedRange(date, dateFrom, dateTo)
      ) {
        return [];
      }

      const items = getPackageItems(booking);
      const rangeFeeItems = items.filter(
        (item) =>
          item.category === "Range Fee Rates" && item.name === "Range Fee"
      );
      const rangeFeeQuantity = rangeFeeItems.reduce((total, item) => {
        const quantity = item.quantity == null ? 1 : Number(item.quantity);
        return Number.isFinite(quantity) && quantity >= 0
          ? total + quantity
          : total;
      }, 0);

      if (definition.type === "range-fee") {
        if (!rangeFeeQuantity) return [];
        return [{
          id: booking.id,
          date: formatDate(date),
          sortDate: date?.getTime() ?? 0,
          sortTime: getRecordSortTime(record, date),
          record: booking.bookName || "Booking",
          details: booking.memberName || booking.customerName || "-",
          status,
          quantity: rangeFeeQuantity,
        }];
      }

      if (definition.type === "range-sales") {
        return items.flatMap((item, index) => {
          const quantity = item.quantity == null ? 1 : Number(item.quantity);
          const unitPrice = Number(item.unitPrice);
          if (
            (item.category === "Range Fee Rates" &&
              (item.name === "Range Fee" ||
                item.name === "Target Board" ||
                item.inventoryName === "Target Board")) ||
            !Number.isFinite(quantity) ||
            quantity < 0 ||
            !Number.isFinite(unitPrice)
          ) {
            return [];
          }
          return [{
            id: `${booking.id}-${index}`,
            date: formatDate(date),
            sortDate: date?.getTime() ?? 0,
            record: booking.bookName || "Booking",
            details: item.name || item.category || "Range item",
            status,
            quantity,
            amount: unitPrice * quantity,
          }];
        });
      }

      const bookingPrice = Number(booking.price) || 0;
      const rangeFeeRevenue = rangeFeeItems.reduce((total, item) => {
        const quantity = item.quantity == null ? 1 : Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        return Number.isFinite(quantity) && quantity >= 0 && Number.isFinite(unitPrice)
          ? total + unitPrice * quantity
          : total;
      }, 0);
      const targetBoardRevenue = items.reduce((total, item) => {
        if (
          item.category !== "Range Fee Rates" ||
          (item.name !== "Target Board" &&
            item.inventoryName !== "Target Board")
        ) {
          return total;
        }

        const quantity = item.quantity == null ? 1 : Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        return Number.isFinite(quantity) &&
          quantity >= 0 &&
          Number.isFinite(unitPrice)
          ? total + unitPrice * quantity
          : total;
      }, 0);

      return [{
        id: booking.id,
        date: formatDate(date),
        sortDate: date?.getTime() ?? 0,
        record: booking.bookName || "Booking",
        details: booking.memberName || booking.customerName || booking.bookTime || "-",
        status,
        amount: bookingPrice + rangeFeeRevenue + targetBoardRevenue,
      }];
    });

    return definition.type === "range-sales"
      ? [...bookingRows, ...getRangeSoldRows(rangeSold, dateFrom, dateTo)]
      : bookingRows;
  }, [
    attendance,
    bookings,
    dateFrom,
    dateTo,
    definition,
    metric,
    rangeSold,
    today,
  ]);

  const sortedRows = useMemo(() => {
  return [...rows].sort((a, b) => {
    const dayA = a.sortDate
      ? formatDateKey(new Date(a.sortDate))
      : "";

    const dayB = b.sortDate
      ? formatDateKey(new Date(b.sortDate))
      : "";

    return (
      dayB.localeCompare(dayA) ||
      (b.sortTime || 0) - (a.sortTime || 0)
    );
  });
}, [rows]);

  const closeMenu = () => {
  setOpenMenu(null);
  setMenuPosition(null);
};

const handleOpenMenu = (event, row) => {
  if (openMenu === row) {
    closeMenu();
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();

  setMenuPosition({
    top: Math.max(
      8,
      rect.bottom + 100 > window.innerHeight
        ? rect.top - 100
        : rect.bottom + 5
    ),
    left: Math.max(8, rect.right - 160),
  });

  setOpenMenu(row);
};

const handleViewInfo = (row) => {
  setSelectedRecord(row);
  closeMenu();
};

  const totalAmount = rows.reduce((total, row) => total + (row.amount || 0), 0);
  const totalQuantity = rows.reduce(
    (total, row) => total + (row.quantity || 0),
    0
  );
  const isCountMetric =
    definition?.type === "bookings-list" ||
    definition?.type === "range-fee" ||
    definition?.type === "attendance";

  if (!definition) {
    return (
      <section className="dashboard-records-page">
        <p role="alert">Dashboard record type not found.</p>
        <Link className="dashboard-records-back" to="/dashboard">Back to Dashboard</Link>
      </section>
    );
  }

  return (
    <section className="dashboard-records-page">
      <header className="dashboard-records-header">
        <div>
          <Link className="dashboard-records-back" to="/dashboard">
            <span aria-hidden="true">←</span> Back to Dashboard
          </Link>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
          {(dateFrom || dateTo) && (
            <p className="dashboard-records-date-range">
              Date range: {dateFrom ? formatDisplayDate(dateFrom) : "Any date"}
              {" – "}
              {dateTo ? formatDisplayDate(dateTo) : "Any date"}
            </p>
          )}
        </div>
        <div className="dashboard-records-total">
          <span>
            {definition.type === "bookings-list"
              ? "Total bookings"
              : definition.type === "range-fee"
                ? "Range Fee quantity"
                : definition.type === "attendance"
                  ? "Present records"
                  : "Total value"}
          </span>
          <strong>
            {isCountMetric
              ? definition.type === "bookings-list"
                ? rows.length
                : totalQuantity
              : formatCurrency(totalAmount)}
          </strong>
          <small>{rows.length} {rows.length === 1 ? "record" : "records"}</small>
        </div>
      </header>

      <div className="dashboard-records-panel">
        {loading ? (
          <div className="dashboard-records-message" role="status">
            Loading records…
          </div>
        ) : error ? (
          <div className="dashboard-records-message" role="alert">{error}</div>
        ) : rows.length === 0 ? (
          <div className="dashboard-records-message">
            No records contribute to this total for the selected date range.
          </div>
        ) : (
          <div className="dashboard-records-table-wrap">
            <table className="dashboard-records-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Booking / Record</th>
                  <th>Details</th>
                  <th>Status</th>
                  {(definition.type === "range-fee" ||
                    definition.type === "range-sales" ||
                    definition.type === "attendance") && <th>Quantity</th>}
                  {definition.type !== "range-fee" &&
                    definition.type !== "attendance" &&
                    <th>Amount</th>}
                    <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.record}</td>
                    <td>{row.details}</td>
                    <td><span className="dashboard-record-status">{row.status}</span></td>
                    {(definition.type === "range-fee" ||
                      definition.type === "range-sales" ||
                      definition.type === "attendance") && (
                        <td>{row.quantity}</td>
                      )}
                    {definition.type !== "range-fee" &&
                      definition.type !== "attendance" && (
                        <td>{formatCurrency(row.amount || 0)}</td>
                      )}
                      <td>
                        <button
                          type="button"
                          className="dashboard-record-action-btn"
                          aria-label="Record actions"
                          aria-haspopup="menu"
                          aria-expanded={openMenu === row}
                          onClick={(event) => handleOpenMenu(event, row)}
                        >
                          ⋮
                        </button>
                      </td>
                  </tr>
                ))}
              </tbody>
              {(definition.type === "range-sales" ||
                definition.type === "range-sold-sales" ||
                definition.type === "bookings" ||
                definition.type === "bookings-list") && (
                <tfoot>
                  <tr>
                    <th
                      colSpan={
                        definition.type === "range-sales"
                          ? 5
                          : definition.type === "range-sold-sales"
                            ? 4
                          : definition.type === "bookings-list"
                            ? 3
                            : metric === "firearm-sales"
                              ? 4
                              : 3
                      }
                    >
                      Total
                    </th>
                    <td>
                      {definition.type === "bookings-list"
                        ? rows.length
                        : formatCurrency(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
      {openMenu && menuPosition &&
  createPortal(
    <div
      className="dashboard-record-action-menu"
      role="menu"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => handleViewInfo(openMenu)}
      >
        View Info
      </button>
    </div>,
    document.body
  )}
  {selectedRecord &&
  createPortal(
    <div
      className="record-modal-overlay"
      onClick={() => setSelectedRecord(null)}
    >
      <div
        className="record-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="record-modal-header">
          <h2 id="record-modal-title">
            Record Information
          </h2>

          <button
            type="button"
            onClick={() => setSelectedRecord(null)}
          >
            ×
          </button>
        </div>

        <div className="record-modal-details">
          <p>
            <strong>Record:</strong> {selectedRecord.record}
          </p>

          <p>
            <strong>Date:</strong> {selectedRecord.date}
          </p>

          <p>
            <strong>Details:</strong> {selectedRecord.details}
          </p>

          <p>
            <strong>Status:</strong> {selectedRecord.status}
          </p>

          {selectedRecord.quantity !== undefined && (
            <p>
              <strong>Quantity:</strong> {selectedRecord.quantity}
            </p>
          )}

          {selectedRecord.amount !== undefined && (
            <p>
              <strong>Amount:</strong>{" "}
              {formatCurrency(selectedRecord.amount)}
            </p>
          )}
        </div>

        <button
          type="button"
          className="record-modal-close"
          onClick={() => setSelectedRecord(null)}
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  )}
    </section>
  );
}
