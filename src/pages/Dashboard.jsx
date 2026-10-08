import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import "../styles/dashboard.css";

export default function Dashboard() {
  const [totalBookings, setTotalBookings] = useState(0);
  const [completedBookings, setCompletedBookings] = useState(0);
  const [presentMembers, setPresentMembers] = useState(0);
  const [totalSalesRevenue, setTotalSalesRevenue] = useState(0);
  const [topPackages, setTopPackages] = useState([]);
  const [salesData, setSalesData] = useState([]);

  const [salesFilter, setSalesFilter] = useState("7days");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSalesGraph();
  }, [salesFilter]);

  useEffect(() => {
    fetchDashboardData();
    fetchTopPackages();
  }, []);


  // ==========================================
  // GET TODAY
  // ==========================================

  const getTodayDate = () => {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };
  const fetchTopPackages = async () => {
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
};


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

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };


  // ==========================================
  // GET BOOKING DATE
  // ==========================================

  const getBookingDate = (booking) => {
    // Prefer completedAt because revenue
    // belongs to completed bookings.
    if (booking.completedAt?.toDate) {
      return booking.completedAt.toDate();
    }

    // Fallback to bookDate
    if (booking.bookDate) {
      const date = new Date(
        `${booking.bookDate}T00:00:00`
      );

      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  };


  // ==========================================
  // FETCH DASHBOARD CARDS
  // ==========================================

  const fetchDashboardData = async () => {
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

      bookingsSnapshot.docs.forEach((doc) => {
        const booking = doc.data();

        // Active bookings
        if (booking.status === "Booked") {
          activeBookingCount++;
        }

        // Completed bookings
        if (booking.status === "Completed") {
          completedBookingCount++;

          const price = Number(booking.price) || 0;

          salesRevenue += price;
        }
      });

      setTotalBookings(activeBookingCount);
      setCompletedBookings(completedBookingCount);
      setTotalSalesRevenue(salesRevenue);


      // ==========================================
      // PRESENT MEMBERS TODAY
      // ==========================================

      const today = getTodayDate();

      const attendanceQuery = query(
        collection(db, "attendance"),
        where("date", "==", today),
        where("status", "==", "Present")
      );

      const attendanceSnapshot = await getDocs(
        attendanceQuery
      );

      setPresentMembers(
        attendanceSnapshot.size
      );

    } catch (error) {
      console.error(
        "Error loading dashboard:",
        error
      );
    } finally {
      setLoading(false);
    }
  };


  // ==========================================
  // FETCH SALES GRAPH
  // ==========================================

  const fetchSalesGraph = async () => {
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
  };


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
              Total Present Members Today
            </p>

            <h2>
              {loading
                ? "..."
                : presentMembers}
            </h2>

            <span>
              Present today
            </span>

          </div>

        </div>


        {/* Sales Revenue */}

        <div className="dashboard-card revenue-card">

          <div className="dashboard-card-content">

            <p>
              Total Sales Revenue
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