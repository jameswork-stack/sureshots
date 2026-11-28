import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

const isAmmunitionCorkageItem = (category, item) =>
  [category, item.name, item.inventoryName].some(
    (value) =>
      typeof value === "string" &&
      value.toLowerCase().includes("ammunition corkage")
  );

const getCardDetailsUrl = (metric, dateFrom, dateTo) => {
  const searchParams = new URLSearchParams();
  if (dateFrom) searchParams.set("from", dateFrom);
  if (dateTo) searchParams.set("to", dateTo);
  const search = searchParams.toString();
  return `/dashboard/records/${metric}${search ? `?${search}` : ""}`;
};

export default function Dashboard() {
  const [totalBookings, setTotalBookings] = useState(0);
  const [completedBookings, setCompletedBookings] = useState(0);
  const [presentMembers, setPresentMembers] = useState(0);
  const [totalSalesRevenue, setTotalSalesRevenue] = useState(0);
  const [totalRangeSales, setTotalRangeSales] = useState(0);
  const [totalCOGS, setTotalCOGS] = useState(0);
  const [totalRangeFeeAvailed, setTotalRangeFeeAvailed] = useState(0);
  const [topPackages, setTopPackages] = useState([]);
  const [salesData, setSalesData] = useState([]);

  const [salesFilter, setSalesFilter] = useState("7days");
  const [dateFrom, setDateFrom] = useState(getTodayDate);
  const [dateTo, setDateTo] = useState(getTodayDate);

  const [loading, setLoading] = useState(true);

  const totalNetSales = totalSalesRevenue + totalRangeSales;
  const grossProfit =
    Math.round((totalNetSales - totalCOGS) * 100) / 100;

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

  const formatCompactCurrency = (amount) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  };

  const formatCompactAmount = (amount) => {
    return new Intl.NumberFormat("en-PH", {
      notation: "compact",
      maximumFractionDigits: 1,
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
      let rangeFeeQuantity = 0;
      let bookingCOGS = 0;

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
          const ammunitionCOGS = Number(booking.ammunitionCOGS);
          if (Number.isFinite(ammunitionCOGS) && ammunitionCOGS >= 0) {
            bookingCOGS += ammunitionCOGS;
          }

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
                if (item.includedInPackagePrice) {
                  return;
                }

                const quantity =
                  item.quantity == null ? 1 : Number(item.quantity);

                if (
                  category.category === "Range Fee Rates" &&
                  item.name === "Range Fee" &&
                  Number.isFinite(quantity) &&
                  quantity >= 0
                ) {
                  rangeFeeQuantity += quantity;
                }

                const unitPrice = Number(item.unitPrice);

                if (
                  Number.isFinite(unitPrice) &&
                  Number.isFinite(quantity) &&
                  quantity >= 0
                ) {
                  const itemRevenue = unitPrice * quantity;
                  if (isAmmunitionCorkageItem(category.category, item)) {
                    rangeSalesRevenue += itemRevenue;
                  } else if (category.category === "Range Fee Rates" && item.name === "Range Fee") {
                    salesRevenue += itemRevenue;
                  } else if (
                    category.category === "Range Fee Rates" &&
                    (item.name === "Target Board" ||
                      item.inventoryName === "Target Board")
                  ) {
                    salesRevenue += itemRevenue;
                  } else {
                    rangeSalesRevenue += itemRevenue;
                  }
                }
              });
            });
          } else if (Array.isArray(booking.packageItems)) {
            booking.packageItems.forEach((item) => {
              if (item.includedInPackagePrice) {
                return;
              }

              const quantity =
                item.quantity == null ? 1 : Number(item.quantity);

              if (
                item.category === "Range Fee Rates" &&
                item.name === "Range Fee" &&
                Number.isFinite(quantity) &&
                quantity >= 0
              ) {
                rangeFeeQuantity += quantity;
              }

              const unitPrice = Number(item.unitPrice);
              if (
                Number.isFinite(unitPrice) &&
                Number.isFinite(quantity) &&
                quantity >= 0
              ) {
                const itemRevenue = unitPrice * quantity;
                if (isAmmunitionCorkageItem(item.category, item)) {
                  rangeSalesRevenue += itemRevenue;
                } else if (item.category === "Range Fee Rates" && item.name === "Range Fee") {
                  salesRevenue += itemRevenue;
                } else if (
                  item.category === "Range Fee Rates" &&
                  (item.name === "Target Board" ||
                    item.inventoryName === "Target Board")
                ) {
                  salesRevenue += itemRevenue;
                } else {
                  rangeSalesRevenue += itemRevenue;
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
      setTotalRangeFeeAvailed(rangeFeeQuantity);


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

      const rangeSoldSnapshot = await getDocs(collection(db, "rangeSold"));
      const rangeSoldTotals = rangeSoldSnapshot.docs.reduce(
        (totals, soldDoc) => {
          const sale = soldDoc.data();
          const soldDate = getDateFromValue(sale.soldDate);
          if (
            (dateFrom || dateTo) &&
            !isDateInSelectedRange(soldDate, dateFrom, dateTo)
          ) {
            return totals;
          }

          let saleRevenue;
          if (
            sale.totalAmount != null &&
            Number.isFinite(Number(sale.totalAmount))
          ) {
            saleRevenue = Number(sale.totalAmount);
          } else {
            const packageContents = Array.isArray(sale.packageContents)
              ? sale.packageContents
              : [];
            saleRevenue = packageContents.reduce(
              (contentsTotal, category) =>
                contentsTotal +
                (Array.isArray(category.items)
                  ? category.items.reduce((itemsTotal, item) => {
                      const unitPrice = Number(item.unitPrice);
                      const quantity =
                        item.quantity == null ? 1 : Number(item.quantity);
                      return Number.isFinite(unitPrice) &&
                        Number.isFinite(quantity) &&
                        quantity >= 0
                        ? itemsTotal + unitPrice * quantity
                        : itemsTotal;
                    }, 0)
                  : 0),
              0
            );
          }
          const productCOGS = Number(sale.productCOGS);
          const ammunitionCOGS = Number(sale.ammunitionCOGS);

          return {
            revenue: totals.revenue + saleRevenue,
            cogs:
              totals.cogs +
              (Number.isFinite(productCOGS) && productCOGS >= 0
                ? productCOGS
                : 0) +
              (Number.isFinite(ammunitionCOGS) && ammunitionCOGS >= 0
                ? ammunitionCOGS
                : 0),
          };
        },
        { revenue: 0, cogs: 0 }
      );
      setTotalRangeSales(rangeSalesRevenue + rangeSoldTotals.revenue);
      setTotalCOGS(
        Math.round((bookingCOGS + rangeSoldTotals.cogs) * 100) / 100
      );

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
      const snapshot = await getDocs(collection(db, "bookings"));
      const today = new Date();
      const numberOfDays = salesFilter === "today" ? 1 : 7;
      const days = Array.from({ length: numberOfDays }, (_, index) => {
        const date = new Date(today);
        date.setHours(0, 0, 0, 0);
        date.setDate(today.getDate() - (numberOfDays - 1 - index));
        return {
          key: formatDateKey(date),
          label: salesFilter === "today" ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" }),
          dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          total: 0,
        };
      });
      snapshot.docs.forEach((record) => {
        const booking = record.data();
        if (booking.status !== "Completed") return;
        const date = getBookingDate(booking);
        if (!date) return;
        const day = days.find((entry) => entry.key === formatDateKey(date));
        if (day) day.total += Number(booking.price) || 0;
      });
      setSalesData(days);
    } catch (error) {
      console.error("Error loading sales graph:", error);
      setSalesData([]);
    }
  }, [salesFilter]);

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

  {/* Total Net Sales Revenue */}
  <div className="dashboard-card net-sales-card">
    <div className="dashboard-card-content">
      <p>Total Net Sales (Revenue)</p>

      <h2>
        {loading
          ? "..."
          : formatCurrency(totalNetSales)}
      </h2>

      <span>Combined sales revenue</span>
    </div>
  </div>

  <div className="dashboard-card cogs-card">
    <div className="dashboard-card-content">
      <p>Total COGS</p>

      <h2>
        {loading ? "..." : formatCurrency(totalCOGS)}
      </h2>

      <span>Recorded product and ammunition costs</span>
    </div>
  </div>

  <div className="dashboard-card gross-profit-card">
    <div className="dashboard-card-content">
      <p>Total Gross Profit</p>

      <h2>
        {loading ? "..." : formatCurrency(grossProfit)}
      </h2>

      <span>Net sales minus recorded COGS</span>
    </div>
  </div>

        {/* Sales Revenue */}

        <Link
          className="dashboard-card dashboard-card-link revenue-card"
          to={getCardDetailsUrl("firearm-sales", dateFrom, dateTo)}
          aria-label="View records included in Total Firearm Package Sales"
        >

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
              Completed bookings, including Range Fee and Target Board sales; excludes Ammunition Corkage Fee
            </span>

          </div>

        </Link>

        {/* Range Package Sales */}

        <Link
          className="dashboard-card dashboard-card-link range-sales-card"
          to={getCardDetailsUrl("range-sales", dateFrom, dateTo)}
          aria-label="View records included in Total Range Sales"
        >

          <div className="dashboard-card-content">

            <p>Total Range Sales</p>

            <h2>
              {loading
                ? "..."
                : formatCurrency(totalRangeSales)}
            </h2>

            <span>
              Completed range sales and items sold through Sold Management
            </span>

          </div>

        </Link>

        {/* Range Fee Availed */}

          <Link
            className="dashboard-card dashboard-card-link range-sales-card"
            to={getCardDetailsUrl("range-fee-availed", dateFrom, dateTo)}
            aria-label="View bookings included in Total Range Fee Availed"
          >

            <div className="dashboard-card-content">

              <p>Total Range Fee Availed</p>

              <h2>
                {loading
                  ? "..."
                  : totalRangeFeeAvailed}
              </h2>

              <span>
                Range Fee quantity in completed bookings
              </span>

            </div>

          </Link>

        {/* Total Bookings */}

        <Link
          className="dashboard-card dashboard-card-link"
          to={getCardDetailsUrl("bookings", dateFrom, dateTo)}
          aria-label="View active booking records"
        >

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

        </Link>


        {/* Completed Bookings */}

        <Link
          className="dashboard-card dashboard-card-link completed-card"
          to={getCardDetailsUrl("completed-bookings", dateFrom, dateTo)}
          aria-label="View completed booking records"
        >

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

        </Link>


        {/* Present Members */}

        <Link
          className="dashboard-card dashboard-card-link present-card"
          to={getCardDetailsUrl("present-members", dateFrom, dateTo)}
          aria-label="View present attendance records"
        >

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

        </Link>

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

          <div className="sales-filter">
            <button type="button" className={salesFilter === "today" ? "active" : ""}
              aria-pressed={salesFilter === "today"} onClick={() => setSalesFilter("today")}>
              Today
            </button>
            <button type="button" className={salesFilter === "7days" ? "active" : ""}
              aria-pressed={salesFilter === "7days"} onClick={() => setSalesFilter("7days")}>
              Last 7 Days
            </button>
          </div>

        </div>


        {/* ==========================================
            CHART
        ========================================== */}

        <div className="sales-chart-container">

          {/* Y Axis */}

          <div className="sales-y-axis">

            <span>
              {formatCompactCurrency(
                maxSales
              )}
            </span>

            <span>
              {formatCompactCurrency(
                maxSales / 2
              )}
            </span>

            <span>
              {formatCompactCurrency(0)}
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

                        {item.total > 0 && salesData.length <= 15
                          ? formatCompactAmount(
                              item.total
                            )
                          : ""}

                      </div>


                      {/* Bar */}

                      <div className="sales-bar-wrapper">

                        <div
                          className="sales-bar"
                          role="img"
                          aria-label={`${item.dateLabel}: ${formatCurrency(item.total)}`}
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