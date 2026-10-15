import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";

import { db } from "../firebase";
import { formatDisplayDate } from "../utils/date";
import "../styles/dashboardRecords.css";

const METRICS = {
  "firearm-sales": {
    title: "Total Firearm Package Sales",
    description: "Completed booking revenue, including Range Fee and Target Board sales.",
    type: "bookings",
  },
  "range-sales": {
    title: "Total Range Sales",
    description: "Completed range package item sales, excluding Range Fee and Target Board.",
    type: "range-sales",
  },
  "range-sold-sales": {
    title: "Total Range Sold",
    description: "Saved Range Package sale records from Sold Management.",
    type: "range-sold-sales",
  },
  "membership-sales": {
    title: "Total Membership Sales",
    description: "Membership records and prices included in this total.",
    type: "membership-sales",
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
  if (value?.toDate) return value.toDate();
  if (typeof value === "string" && value) {
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
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
        ? category.items.map((item) => ({
            ...item,
            category: category.category,
          }))
        : []
    );
  }
  return Array.isArray(booking.packageItems) ? booking.packageItems : [];
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

export default function DashboardRecords() {
  const { metric } = useParams();
  const [searchParams] = useSearchParams();
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";
  const [bookings, setBookings] = useState([]);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [rangeSold, setRangeSold] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [today] = useState(() => formatDateKey(new Date()));

  const definition = METRICS[metric];

  useEffect(() => {
    let isCurrent = true;
    const loadRecords = async () => {
      setError("");
      try {
        const collectionName =
          definition?.type === "range-sold-sales"
            ? "rangeSold"
            : definition?.type === "membership-sales"
            ? "sureshotsMembers"
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
        setMembers(collectionName === "sureshotsMembers" ? records : []);
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

    if (definition.type === "membership-sales") {
      return members.flatMap((member) => {
        const date = getDateFromValue(member.createdAt);
        const amount = Number(member.membershipPrice);
        if (
          (dateFrom || dateTo) && !isInSelectedRange(date, dateFrom, dateTo)
        ) {
          return [];
        }
        if (!Number.isFinite(amount)) return [];
        return [{
          id: member.id,
          date: formatDate(date),
          record: member.memberName || "Unnamed member",
          details: member.memberNumber
            ? `Member No. ${member.memberNumber} · ${member.membershipType || "Membership"}`
            : member.membershipType || "Membership",
          amount,
        }];
      });
    }

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
          record: record.memberName || record.name || "Attendance record",
          details: record.timeIn ? `Time in ${record.timeIn}` : "-",
          status: record.status,
          quantity: 1,
        }];
      });
    }

    if (definition.type === "range-sold-sales") {
      return rangeSold.flatMap((sale) => {
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
        const fallbackAmount = items.reduce((total, item) => {
          const unitPrice = Number(item.unitPrice);
          const quantity = item.quantity == null ? 1 : Number(item.quantity);
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
        const itemDetails = items
          .map(
            (item) =>
              `${item.name}${"quantity" in item ? ` × ${item.quantity}` : ""}`
          )
          .join(", ");

        return [{
          id: sale.id,
          date: formatDate(date),
          record: sale.soldTo || "Walk-in sale",
          details: itemDetails || "Range Package sale",
          status: "Sold",
          amount,
        }];
      });
    }

    return bookings.flatMap((booking) => {
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
              (item.name === "Range Fee" || item.name === "Target Board")) ||
            !Number.isFinite(quantity) ||
            quantity < 0 ||
            !Number.isFinite(unitPrice)
          ) {
            return [];
          }
          return [{
            id: `${booking.id}-${index}`,
            date: formatDate(date),
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
          item.name !== "Target Board"
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
        record: booking.bookName || "Booking",
        details: booking.memberName || booking.customerName || booking.bookTime || "-",
        status,
        amount: bookingPrice + rangeFeeRevenue + targetBoardRevenue,
      }];
    });
  }, [
    attendance,
    bookings,
    dateFrom,
    dateTo,
    definition,
    members,
    metric,
    rangeSold,
    today,
  ]);

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
                  <th>{definition.type === "membership-sales" ? "Member" : "Booking / Record"}</th>
                  <th>Details</th>
                  {definition.type !== "membership-sales" && <th>Status</th>}
                  {(definition.type === "range-fee" ||
                    definition.type === "range-sales" ||
                    definition.type === "attendance") && <th>Quantity</th>}
                  {definition.type !== "range-fee" &&
                    definition.type !== "attendance" &&
                    <th>Amount</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.record}</td>
                    <td>{row.details}</td>
                    {definition.type !== "membership-sales" && (
                        <td><span className="dashboard-record-status">{row.status}</span></td>
                      )}
                    {(definition.type === "range-fee" ||
                      definition.type === "range-sales" ||
                      definition.type === "attendance") && (
                        <td>{row.quantity}</td>
                      )}
                    {definition.type !== "range-fee" &&
                      definition.type !== "attendance" && (
                        <td>{formatCurrency(row.amount || 0)}</td>
                      )}
                  </tr>
                ))}
              </tbody>
              {(definition.type === "range-sales" ||
                definition.type === "range-sold-sales" ||
                definition.type === "membership-sales" ||
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
    </section>
  );
}
