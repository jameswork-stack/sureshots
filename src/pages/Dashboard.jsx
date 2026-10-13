import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import "../styles/dashboard.css";

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDateFromValue = (value) => {
  if (value?.toDate) {
    return value.toDate();
  }

  if (typeof value === "string" && value) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const getBookingDate = (booking) => {
  if (booking.completedAt?.toDate) {
    return booking.completedAt.toDate();
  }

  return getDateFromValue(booking.bookDate);
};

const isDateInSelectedRange = (date, dateFrom, dateTo) => {
  if (!date) {
    return false;
  }

  const dateKey = formatDateKey(date);
  return (!dateFrom || dateKey >= dateFrom) &&
    (!dateTo || dateKey <= dateTo);
};

export default function Dashboard() {
  const [totalBookings, setTotalBookings] = useState(0);
  const [completedBookings, setCompletedBookings] = useState(0);
  const [presentMembers, setPresentMembers] = useState(0);
  const [totalSalesRevenue, setTotalSalesRevenue] = useState(0);
  const [totalRangeSales, setTotalRangeSales] = useState(0);
  const [totalMembershipSales, setTotalMembershipSales] = useState(0);
  const [topPackages, setTopPackages] = useState([]);
  const [salesData, setSalesData] = useState([]);

  const [salesFilter, setSalesFilter] = useState("7days");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [loading, setLoading] = useState(true);

  const fetchTopPackages = useCallback(async () => {
  try {
    const bookingsSnapshot = await getDocs(
      collection(db, "bookings")
    );

    const packageSales = {};

    bookingsSnapshot.docs.forEach((doc) => {
      const booking = doc.data();

      // Only completed bookings
      if (booking.status !== "Completed") {
        return;
      }

      const bookingDate = getBookingDate(booking);
      if (
        (dateFrom || dateTo) &&
        !isDateInSelectedRange(bookingDate, dateFrom, dateTo)
      ) {
        return;
      }

      const packageName =
        booking.bookName || "Unknown Package";

      const price =
        Number(booking.price) || 0;

      if (!packageSales[packageName]) {
        packageSales[packageName] = 0;
      }

      packageSales[packageName] += price;
    });

    const sortedPackages = Object.entries(
      packageSales
    )
      .map(([name, total]) => ({
        name,
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    setTopPackages(sortedPackages);

  } catch (error) {
    console.error(
      "Error loading top packages:",
      error
    );
  }
  }, [dateFrom, dateTo]);


  // ==========================================
  // FORMAT CURRENCY
  // ==========================================

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount);
  };


  // ==========================================
  // FORMAT DATE
  // ==========================================

  // ==========================================
  // FETCH DASHBOARD CARDS
  // ==========================================

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // ==========================================
      // BOOKINGS
      // ==========================================

      const bookingsSnapshot = await getDocs(
        collection(db, "bookings")
      );

      let activeBookingCount = 0;
      let completedBookingCount = 0;
      let salesRevenue = 0;
      let rangeSalesRevenue = 0;

      bookingsSnapshot.docs.forEach((doc) => {
        const booking = doc.data();

        // Active bookings
        const bookingDate =
          booking.status === "Completed"
            ? getBookingDate(booking)
            : getDateFromValue(booking.bookDate);
        const isInSelectedRange =
          !dateFrom && !dateTo
            ? true
            : isDateInSelectedRange(bookingDate, dateFrom, dateTo);

        if (booking.status === "Booked" && isInSelectedRange) {
          activeBookingCount++;
        }

        // Completed bookings
        if (booking.status === "Completed" && isInSelectedRange) {
          completedBookingCount++;

          const price = Number(booking.price) || 0;

          salesRevenue += price;

          const packageContents = Array.isArray(booking.packageContents)
            ? booking.packageContents
            : [];
          if (packageContents.length > 0) {
            packageContents.forEach((category) => {
              if (!Array.isArray(category.items)) {
                return;
              }

              category.items.forEach((item) => {
                const unitPrice = Number(item.unitPrice);
                const quantity =
                  item.quantity == null ? 1 : Number(item.quantity);

                if (
                  Number.isFinite(unitPrice) &&
                  Number.isFinite(quantity) &&
                  quantity >= 0
                ) {
                  const itemRevenue = unitPrice * quantity;
                  rangeSalesRevenue += itemRevenue;
                  if (
                    category.category === "Range Fee Rates" &&
                    item.name === "Range Fee"
                  ) {
                    salesRevenue += itemRevenue;
                  }
                }
              });
            });
          } else if (Array.isArray(booking.packageItems)) {
            booking.packageItems.forEach((item) => {
              const unitPrice = Number(item.unitPrice);
              const quantity =
                item.quantity == null ? 1 : Number(item.quantity);

              if (
                Number.isFinite(unitPrice) &&
                Number.isFinite(quantity) &&
                quantity >= 0
              ) {
                const itemRevenue = unitPrice * quantity;
                rangeSalesRevenue += itemRevenue;
                if (
                  item.category === "Range Fee Rates" &&
                  item.name === "Range Fee"
                ) {
                  salesRevenue += itemRevenue;
                }
              }
            });
          }
        }
      });

      setTotalBookings(activeBookingCount);
      setCompletedBookings(completedBookingCount);
      setTotalSalesRevenue(salesRevenue);
      setTotalRangeSales(rangeSalesRevenue);


      // ==========================================
      // PRESENT MEMBERS TODAY
      // ==========================================

      const attendanceRef = collection(db, "attendance");
      const attendanceQuery = dateFrom || dateTo
        ? query(attendanceRef, where("status", "==", "Present"))
        : query(
            attendanceRef,
            where("date", "==", getTodayDate()),
            where("status", "==", "Present")
          );
      const attendanceSnapshot = await getDocs(attendanceQuery);
      const attendanceRecords = attendanceSnapshot.docs.map(
        (attendanceDoc) => attendanceDoc.data()
      );
      const selectedAttendance = dateFrom || dateTo
        ? attendanceRecords.filter((attendance) =>
            isDateInSelectedRange(
              getDateFromValue(attendance.date),
              dateFrom,
              dateTo
            )
          )
        : attendanceRecords;
      setPresentMembers(selectedAttendance.length);

      const membershipSnapshot = await getDocs(
        collection(db, "sureshotsMembers")
      );
      const membershipSales = membershipSnapshot.docs.reduce(
        (total, memberDoc) => {
          const member = memberDoc.data();
          const createdAt = getDateFromValue(member.createdAt);
          if (
            (dateFrom || dateTo) &&
            !isDateInSelectedRange(createdAt, dateFrom, dateTo)
          ) {
            return total;
          }

          const price = Number(member.membershipPrice);
          return Number.isFinite(price) ? total + price : total;
        },
        0
      );
      setTotalMembershipSales(membershipSales);

    } catch (error) {
      console.error(
        "Error loading dashboard:",
        error
      );
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);


  // ==========================================
  // FETCH SALES GRAPH
  // ==========================================

  const fetchSalesGraph = useCallback(async () => {
    try {
      const bookingsSnapshot = await getDocs(
        collection(db, "bookings")
      );

      const completedBookings = bookingsSnapshot.docs
        .map((doc) => doc.data())
        .filter(
          (booking) =>
            booking.status === "Completed"
        );

      const today = new Date();

      if (dateFrom || dateTo) {
        const completedDates = completedBookings
          .map((booking) => getBookingDate(booking))
          .filter(Boolean)
          .sort((first, second) => first - second);
        const startDate = dateFrom
          ? getDateFromValue(dateFrom)
          : completedDates[0] || today;
        const endDate = dateTo
          ? getDateFromValue(dateTo)
          : today;

        if (!startDate || !endDate || startDate > endDate) {
          setSalesData([]);
          return;
        }

        const rangeDays =
          (Date.UTC(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate()
          ) -
            Date.UTC(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate()
            )) /
            86400000 +
          1;
        const usesDailyBuckets = rangeDays <= 31;
        const buckets = [];

        if (usesDailyBuckets) {
          const date = new Date(startDate);
          date.setHours(0, 0, 0, 0);

          while (date <= endDate) {
            buckets.push({
              key: formatDateKey(date),
              label: date.getDate().toString(),
              dateLabel: date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }),
              total: 0,
            });
            date.setDate(date.getDate() + 1);
          }
        } else {
          const date = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            1
          );

          while (
            date.getFullYear() < endDate.getFullYear() ||
            (date.getFullYear() === endDate.getFullYear() &&
              date.getMonth() <= endDate.getMonth())
          ) {
            buckets.push({
              year: date.getFullYear(),
              month: date.getMonth(),
              label: date.toLocaleDateString("en-US", {
                month: "short",
              }),
              dateLabel: date.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              }),
              total: 0,
            });
            date.setMonth(date.getMonth() + 1);
          }
        }

        completedBookings.forEach((booking) => {
          const bookingDate = getBookingDate(booking);
          if (!isDateInSelectedRange(bookingDate, dateFrom, dateTo)) {
            return;
          }

          const bucket = usesDailyBuckets
            ? buckets.find(
                (item) => item.key === formatDateKey(bookingDate)
              )
            : buckets.find(
                (item) =>
                  item.year === bookingDate.getFullYear() &&
                  item.month === bookingDate.getMonth()
              );

          if (bucket) {
            bucket.total += Number(booking.price) || 0;
          }
        });

        setSalesData(buckets);
        return;
      }

      // ==========================================
      // LAST 7 DAYS
      // ==========================================

      if (salesFilter === "7days") {
        const days = [];

        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);

          date.setHours(0, 0, 0, 0);
          date.setDate(
            today.getDate() - i
          );

          days.push({
            key: formatDateKey(date),

            label: date.toLocaleDateString(
              "en-US",
              {
                weekday: "short",
              }
            ),

            dateLabel:
              date.toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                }
              ),

            total: 0,
          });
        }

        completedBookings.forEach(
          (booking) => {
            const bookingDate =
              getBookingDate(booking);

            if (!bookingDate) return;

            const key =
              formatDateKey(bookingDate);

            const matchingDay =
              days.find(
                (day) => day.key === key
              );

            if (matchingDay) {
              matchingDay.total +=
                Number(booking.price) || 0;
            }
          }
        );

        setSalesData(days);
      }


      // ==========================================
      // LAST 30 DAYS
      // ==========================================

      if (salesFilter === "30days") {
        const days = [];

        for (let i = 29; i >= 0; i--) {
          const date = new Date(today);

          date.setHours(0, 0, 0, 0);
          date.setDate(
            today.getDate() - i
          );

          days.push({
            key: formatDateKey(date),

            label:
              date.getDate().toString(),

            dateLabel:
              date.toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                }
              ),

            total: 0,
          });
        }

        completedBookings.forEach(
          (booking) => {
            const bookingDate =
              getBookingDate(booking);

            if (!bookingDate) return;

            const key =
              formatDateKey(bookingDate);

            const matchingDay =
              days.find(
                (day) => day.key === key
              );

            if (matchingDay) {
              matchingDay.total +=
                Number(booking.price) || 0;
            }
          }
        );

        setSalesData(days);
      }


      // ==========================================
      // LAST 12 MONTHS
      // ==========================================

      if (salesFilter === "12months") {
        const months = [];

        for (let i = 11; i >= 0; i--) {
          const date = new Date(
            today.getFullYear(),
            today.getMonth() - i,
            1
          );

          months.push({
            year: date.getFullYear(),

            month: date.getMonth(),

            label:
              date.toLocaleDateString(
                "en-US",
                {
                  month: "short",
                }
              ),

            dateLabel:
              date.toLocaleDateString(
                "en-US",
                {
                  month: "long",
                  year: "numeric",
                }
              ),

            total: 0,
          });
        }

        completedBookings.forEach(
          (booking) => {
            const bookingDate =
              getBookingDate(booking);

            if (!bookingDate) return;

            const bookingYear =
              bookingDate.getFullYear();

            const bookingMonth =
              bookingDate.getMonth();

            const matchingMonth =
              months.find(
                (month) =>
                  month.year ===
                    bookingYear &&
                  month.month ===
                    bookingMonth
              );

            if (matchingMonth) {
              matchingMonth.total +=
                Number(booking.price) || 0;
            }
          }
        );

        setSalesData(months);
      }

    } catch (error) {
      console.error(
        "Error loading sales graph:",
        error
      );
    }
  }, [dateFrom, dateTo, salesFilter]);

  useEffect(() => {
    fetchSalesGraph();
  }, [fetchSalesGraph]);

  useEffect(() => {
    fetchDashboardData();
    fetchTopPackages();
  }, [fetchDashboardData, fetchTopPackages]);


  // ==========================================
  // GRAPH MAX VALUE
  // ==========================================

  const maxSales = Math.max(
    ...salesData.map(
      (item) => item.total
    ),
    1
  );


  // ==========================================
  // GRAPH HEIGHT
  // ==========================================

  const getBarHeight = (amount) => {
    if (amount === 0) {
      return 0;
    }

    return (
      (amount / maxSales) * 100
    );
  };


  return (
    <div className="dashboard-page">

      {/* ==========================================
          HEADER
      ========================================== */}

      <div className="dashboard-header">

        <div>
          <h1>Dashboard</h1>

          <p>
            Overview of your booking
            management system.
          </p>
        </div>

        <div className="dashboard-date-filter" aria-label="Filter dashboard by date">
          <label>
            <span>From</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              className="dashboard-date-clear"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear
            </button>
          )}
        </div>

      </div>


      {/* ==========================================
          DASHBOARD CARDS
      ========================================== */}

      <div className="dashboard-cards">

        {/* Total Bookings */}

        <div className="dashboard-card">

          <div className="dashboard-card-content">

            <p>Total Bookings</p>

            <h2>
              {loading
                ? "..."
                : totalBookings}
            </h2>

            <span>
              Active bookings
            </span>

          </div>

        </div>


        {/* Completed Bookings */}

        <div className="dashboard-card completed-card">

          <div className="dashboard-card-content">

            <p>
              Total Completed Bookings
            </p>

            <h2>
              {loading
                ? "..."
                : completedBookings}
            </h2>

            <span>
              Completed bookings
            </span>

          </div>

        </div>


        {/* Present Members */}

        <div className="dashboard-card present-card">

          <div className="dashboard-card-content">

            <p>
              {dateFrom || dateTo
                ? "Total Present Members"
                : "Total Present Members Today"}
            </p>

            <h2>
              {loading
                ? "..."
                : presentMembers}
            </h2>

            <span>
              {dateFrom || dateTo
                ? "Present within selected dates"
                : "Present today"}
            </span>

          </div>

        </div>


        {/* Sales Revenue */}

        <div className="dashboard-card revenue-card">

          <div className="dashboard-card-content">

            <p>
              Total Firearm Package Sales
            </p>

            <h2>
              {loading
                ? "..."
                : formatCurrency(
                    totalSalesRevenue
                  )}
            </h2>

            <span>
              Completed bookings only
            </span>

          </div>

        </div>

          {/* Range Package Sales */}

          <div className="dashboard-card range-sales-card">

            <div className="dashboard-card-content">

              <p>Total Range Sales</p>

              <h2>
                {loading
                  ? "..."
                  : formatCurrency(totalRangeSales)}
              </h2>

              <span>
                Selected items from completed bookings
              </span>

            </div>

          </div>

          {/* Membership Sales */}

          <div className="dashboard-card membership-sales-card">

            <div className="dashboard-card-content">

              <p>Total Membership Sales</p>

              <h2>
                {loading
                  ? "..."
                  : formatCurrency(totalMembershipSales)}
              </h2>

              <span>
                Regular, Gold, and Diamond memberships
              </span>

            </div>

          </div>

      </div>


      {/* ==========================================
          SALES GRAPH
      ========================================== */}

      <div className="dashboard-insights">

      <div className="sales-chart-card">

        {/* Chart Header */}

        <div className="sales-chart-header">

          <div>

            <h2>
              Total Sales
            </h2>

            <p>
              Revenue from completed
              bookings
            </p>

          </div>


          {/* Filter */}

          {dateFrom || dateTo ? (
            <span className="sales-custom-range">Custom date range</span>
          ) : (
          <div className="sales-filter">

            <button
              className={
                salesFilter === "7days"
                  ? "active"
                  : ""
              }
              aria-pressed={salesFilter === "7days"}
              onClick={() =>
                setSalesFilter("7days")
              }
            >
              Last 7 Days
            </button>

            <button
              className={
                salesFilter === "30days"
                  ? "active"
                  : ""
              }
              aria-pressed={salesFilter === "30days"}
              onClick={() =>
                setSalesFilter("30days")
              }
            >
              Last 30 Days
            </button>

            <button
              className={
                salesFilter === "12months"
                  ? "active"
                  : ""
              }
              aria-pressed={salesFilter === "12months"}
              onClick={() =>
                setSalesFilter("12months")
              }
            >
              12 Months
            </button>

          </div>
          )}

        </div>


        {/* ==========================================
            CHART
        ========================================== */}

        <div
          className={
            salesFilter === "30days"
              ? "sales-chart-container chart-30-days"
              : "sales-chart-container"
          }
        >

          {/* Y Axis */}

          <div className="sales-y-axis">

            <span>
              {formatCurrency(
                maxSales
              )}
            </span>

            <span>
              {formatCurrency(
                maxSales / 2
              )}
            </span>

            <span>
              ₱0.00
            </span>

          </div>


          {/* Chart */}

          <div className="sales-chart">

            {/* Grid */}

            <div className="chart-grid-line chart-grid-top"></div>

            <div className="chart-grid-line chart-grid-middle"></div>

            <div className="chart-grid-line chart-grid-bottom"></div>


            {/* Bars */}

            <div
              className="sales-bars"
              style={{
                gridTemplateColumns: `repeat(${salesData.length}, minmax(0, 1fr))`,
              }}
            >

              {salesData.map(
                (item, index) => {

                  const barHeight =
                    getBarHeight(
                      item.total
                    );

                  return (
                    <div
                      className="sales-bar-column"
                      key={
                        item.key ||
                        `${item.year}-${item.month}` ||
                        index
                      }
                    >

                      {/* Value */}

                      <div className="sales-bar-value">

                        {item.total > 0
                          ? formatCurrency(
                              item.total
                            )
                          : ""}

                      </div>


                      {/* Bar */}

                      <div className="sales-bar-wrapper">

                        <div
                          className="sales-bar"
                          style={{
                            height: `${barHeight}%`,
                          }}
                          title={`${item.dateLabel}: ${formatCurrency(
                            item.total
                          )}`}
                        ></div>

                      </div>


                      {/* Label */}

                      <div className="sales-bar-label">

                        {item.label}

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          </div>

        </div>

      </div>

      {/* ==========================================
    TOP 5 PACKAGE SALES
========================================== */}

<div className="top-packages-card">

  <div className="top-packages-header">

    <div>
      <h2>Top 5 Package Sales</h2>

      <p>
        Highest sales based on completed bookings
      </p>
    </div>

  </div>


  <div className="top-packages-list">

    {topPackages.length === 0 ? (

      <div className="no-packages">
        No completed package sales yet.
      </div>

    ) : (

      topPackages.map((item, index) => (

        <div
          className="top-package-item"
          key={item.name}
        >

          {/* Rank */}

          <div className="package-rank">
            {index + 1}
          </div>


          {/* Package Information */}

          <div className="package-info">

            <h3>
              {item.name}
            </h3>

            <span>
              Completed bookings
            </span>

          </div>


          {/* Total Sales */}

          <div className="package-total">

            {formatCurrency(
              item.total
            )}

          </div>

        </div>

      ))

    )}

  </div>

</div>

    </div>
    </div>
  );
}