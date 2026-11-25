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
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { formatDisplayDate } from "../utils/date";
import {
  AMMUNITION_CATEGORY,
  adjustAmmunitionInventory,
  getAmmunitionTypes,
  getTargetBoardItem,
} from "../utils/ammunitionInventory";
import {
  RANGE_PACKAGE_CATALOG,
  RANGE_PACKAGE_CATEGORY_LABELS,
  RANGE_PACKAGE_QUANTITY_ITEMS,
  getRangePackageContents,
} from "../utils/rangePackage";
import "../styles/bookingManagement.css";

const getManagedPackageAmmoItems = (packageItem) =>
  Array.isArray(packageItem.ammoItems) && packageItem.ammoItems.length > 0
    ? packageItem.ammoItems
    : packageItem.ammoType
    ? [
        {
          ammoType: packageItem.ammoType,
          ammoQuantity: packageItem.ammoQuantity,
        },
      ]
    : [];

const getDiscountedPrice = (price, discountPercent) => {
  const priceInCents = Math.round((price + Number.EPSILON) * 100);
  return Math.round((priceInCents * (100 - discountPercent)) / 100) / 100;
};

const LEGACY_MEMBER_OPTION = "__existing_booking_member__";
const OPENING_TIME_MINUTES = 10 * 60;
const CLOSING_TIME_MINUTES = 19 * 60;

const parseBookingTimeRange = (value) => {
  const match = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(
    value || ""
  );
  if (!match) return null;

  const toMinutes = (hourValue, minuteValue, period) => {
    const hour = Number(hourValue);
    const minute = Number(minuteValue);
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    return ((hour % 12) + (period.toUpperCase() === "PM" ? 12 : 0)) * 60 + minute;
  };
  const startMinutes = toMinutes(match[1], match[2], match[3]);
  const endMinutes = toMinutes(match[4], match[5], match[6]);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return null;
  }
  return { startMinutes, endMinutes };
};

const formatBookingClockTime = (minutes) => {
  const hour = Math.floor(minutes / 60);
  const hour12 = hour % 12 || 12;
  const period = hour < 12 ? "AM" : "PM";
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${period}`;
};

const createBookingTimeSlots = (durationMinutes) => {
  const duration = Number(durationMinutes);
  if (![30, 60].includes(duration)) return [];

  const slots = [];
  for (
    let startMinutes = OPENING_TIME_MINUTES;
    startMinutes + duration <= CLOSING_TIME_MINUTES;
    startMinutes += 30
  ) {
    const endMinutes = startMinutes + duration;
    slots.push({
      value: `${formatBookingClockTime(startMinutes)} - ${formatBookingClockTime(endMinutes)}`,
      startMinutes,
      endMinutes,
    });
  }
  return slots;
};

const getDurationFromBookingTime = (bookTime) => {
  const interval = parseBookingTimeRange(bookTime);
  return interval ? interval.endMinutes - interval.startMinutes : 60;
};

const formatBookingDuration = (durationMinutes) =>
  Number(durationMinutes) === 30 ? "30 minutes" : "1 hour";

export default function BookingManagement() {
  const [showForm, setShowForm] = useState(false);

  const [bookings, setBookings] = useState([]);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
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
  discountPercent: "",
  bookDate: "",
  bookTime: "",
  durationMinutes: "",

  // Sureshots Member
  memberName: "",
  memberId: "",
  memberType: "Regular",
  memberNumber: "",
  expirationDate: "",
  phoneNumber: "",
});
  const [rangePackageCategories, setRangePackageCategories] = useState([]);
const [selectedRangePackageItems, setSelectedRangePackageItems] = useState({});
  const [rangePackageItemQuantities, setRangePackageItemQuantities] = useState({});
    const [managedPackages, setManagedPackages] = useState([]);
  const [ammunitionTypes, setAmmunitionTypes] = useState([]);
    const [targetBoardItem, setTargetBoardItem] = useState(
      RANGE_PACKAGE_CATALOG["Range Fee Rates"].find(
        (item) => item.name === "Target Board"
      )
    );
    const [managedPackageCategory, setManagedPackageCategory] = useState("");
    const [selectedManagedPackageId, setSelectedManagedPackageId] = useState("");
    const [managedPackageError, setManagedPackageError] = useState("");
  const [ammunitionCatalogError, setAmmunitionCatalogError] = useState("");
    const [otherRangeItem, setOtherRangeItem] = useState({
    details: "",
    price: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completionError, setCompletionError] = useState("");

  const timeSlots = createBookingTimeSlots(booking.durationMinutes);
  const managedPackageCategories = [
    ...new Set(managedPackages.map((packageItem) => packageItem.category)),
  ].filter(Boolean);
  const rangePackageCatalog = {
    ...RANGE_PACKAGE_CATALOG,
    [AMMUNITION_CATEGORY]: ammunitionTypes,
    "Range Fee Rates": RANGE_PACKAGE_CATALOG["Range Fee Rates"].flatMap(
      (item) =>
        item.name === "Target Board"
          ? targetBoardItem
            ? [targetBoardItem]
            : []
          : [item]
    ),
  };
  const packagesInSelectedCategory = managedPackages.filter(
    (packageItem) => packageItem.category === managedPackageCategory
  );
  const selectedBookingMember =
    members.find((member) => member.id === booking.memberId) ||
    members.find(
      (member) =>
        booking.memberNumber
          ? member.memberNumber === booking.memberNumber
          : booking.memberName && member.memberName === booking.memberName
    );

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
    let isCurrent = true;
    const fetchMembers = async () => {
      try {
        const snapshot = await getDocs(collection(db, "sureshotsMembers"));
        const memberList = snapshot.docs.map((memberDoc) => ({
          id: memberDoc.id,
          ...memberDoc.data(),
        }));
        memberList.sort((first, second) =>
          (first.memberName || "").localeCompare(second.memberName || "")
        );
        if (isCurrent) setMembers(memberList);
      } catch (loadError) {
        console.error("Error loading Sureshots members:", loadError);
        if (isCurrent) {
          setMembersError("Unable to load Sureshots members. Please try again.");
        }
      } finally {
        if (isCurrent) setMembersLoading(false);
      }
    };

    fetchMembers();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const fetchManagedPackages = async () => {
      try {
        const snapshot = await getDocs(collection(db, "rangePackages"));
        const packageList = snapshot.docs.map((packageDoc) => ({
          id: packageDoc.id,
          ...packageDoc.data(),
        }));
        packageList.sort(
          (first, second) =>
            (first.category || "").localeCompare(second.category || "") ||
            (first.gunName || "").localeCompare(second.gunName || "")
        );
        setManagedPackages(packageList);
      } catch (loadError) {
        console.error("Error loading managed packages:", loadError);
        setManagedPackageError(
          "Unable to load Package Management packages. Please try again."
        );
      }
    };

    fetchManagedPackages();
  }, []);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([getAmmunitionTypes(), getTargetBoardItem()])
      .then(([items, targetBoard]) => {
        if (isCurrent) {
          setAmmunitionTypes(items);
          setTargetBoardItem(targetBoard);
        }
      })
      .catch((loadError) => {
        console.error("Error loading custom ammunition items:", loadError);
        if (isCurrent) {
          setAmmunitionCatalogError(
            "Unable to load custom ammunition items. Please try again."
          );
        }
      });

    return () => {
      isCurrent = false;
    };
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

const isTimeBooked = (date, selectedSlot) => {
  return bookings.some(
    (item) => {
      if (
        item.id === editingBookingId ||
        item.status !== "Booked" ||
        item.bookDate !== date
      ) {
        return false;
      }

      const existingSlot = parseBookingTimeRange(item.bookTime);
      if (!existingSlot) return item.bookTime === selectedSlot.value;

      return (
        selectedSlot.startMinutes < existingSlot.endMinutes &&
        existingSlot.startMinutes < selectedSlot.endMinutes
      );
    }
  );
};


  // ================================
  // HANDLE INPUT
  // ================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setBooking((prev) => {
      const next = {
        ...prev,
        [name]: value,
        ...(name === "durationMinutes" ? { bookTime: "" } : {}),
      };

      if (name === "customerType") {
        if (value === "member") {
          next.bookName = prev.memberName || "";
          next.price = "0";
          next.discountPercent = "";
        } else if (prev.customerType === "member") {
          next.bookName = "";
          next.price = "";
          next.discountPercent = "";
        }
      }

      return next;
    });

    setError("");
  };

  const handleMemberSelect = (memberId) => {
    const selectedMember = members.find((member) => member.id === memberId);
    if (!selectedMember) return;

    setBooking((current) => ({
      ...current,
      memberId: selectedMember.id,
      memberName: selectedMember.memberName || "",
      bookName: selectedMember.memberName || "",
      price: "0",
      discountPercent: "",
      memberType: selectedMember.membershipType || "Regular",
      memberNumber: selectedMember.memberNumber || "",
      expirationDate: selectedMember.expirationDate || "",
      phoneNumber: selectedMember.memberPhoneNumber || "",
    }));
    setError("");
  };

  const handleRangePackageCategoryChange = (category) => {
    const isCategorySelected = rangePackageCategories.includes(category);

    if (isCategorySelected) {
      setRangePackageCategories((categories) =>
        categories.filter((selectedCategory) => selectedCategory !== category)
      );
      setSelectedRangePackageItems((items) => ({
        ...items,
        [category]: [],
      }));
      setRangePackageItemQuantities((quantities) => ({
        ...quantities,
        [category]: {},
      }));
      if (category === "Others") {
        setOtherRangeItem({ details: "", price: "" });
      }
    } else {
      setRangePackageCategories((categories) =>
        categories.includes(category) ? categories : [...categories, category]
      );
    }
    setError("");
  };

  const handleRangePackageItemChange = (category, itemName) => {
    const isSelected = selectedRangePackageItems[category]?.includes(itemName);
    setSelectedRangePackageItems((items) => {
      const categoryItems = items[category] || [];
      const nextCategoryItems = categoryItems.includes(itemName)
        ? categoryItems.filter((name) => name !== itemName)
        : [...categoryItems, itemName];

      return {
        ...items,
        [category]: nextCategoryItems,
      };
    });
    if (isSelected) {
      setRangePackageItemQuantities((quantities) => ({
        ...quantities,
        [category]: {
          ...quantities[category],
          [itemName]: "",
        },
      }));
    }
    setError("");
  };

  const handleRangePackageQuantityChange = (category, itemName, quantity) => {
    setRangePackageItemQuantities((quantities) => ({
      ...quantities,
      [category]: {
        ...quantities[category],
        [itemName]: quantity,
      },
    }));
    setError("");
  };

  const handleManagedPackageCategoryChange = (category) => {
    setManagedPackageCategory(category);
    setSelectedManagedPackageId("");
    setBooking((current) => ({
      ...current,
      bookName: current.customerType === "member" ? current.memberName : "",
      details: "",
      price: current.customerType === "member" ? "0" : "",
      discountPercent: "",
    }));
    setError("");
  };

  const handleManagedPackageChange = (packageId) => {
    const selectedPackage = managedPackages.find(
      (packageItem) => packageItem.id === packageId
    );
    setSelectedManagedPackageId(packageId);
    if (selectedPackage) {
      setBooking((current) => ({
        ...current,
        bookName:
          current.customerType === "member"
            ? current.memberName || ""
            : selectedPackage.gunName || "",
        details: selectedPackage.details || "",
        price:
          current.customerType === "member"
            ? "0"
            : selectedPackage.price == null
            ? ""
            : String(selectedPackage.price),
      }));
    }
    setError("");
  };


  // ================================
  // OPEN ADD FORM
  // ================================

  const handleAddBooking = () => {
  setEditingBookingId(null);
    setManagedPackageCategory("");
    setSelectedManagedPackageId("");
    setRangePackageCategories([]);
    setSelectedRangePackageItems({});
    setRangePackageItemQuantities({});
    setOtherRangeItem({ details: "", price: "" });

    setBooking({
    customerType: "",
    bookName: "",
    details: "",
    price: "",
    discountPercent: "",
    bookDate: "",
    bookTime: "",
    durationMinutes: "",
    memberName: "",
    memberId: "",
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
    const savedMember =
      members.find((member) => member.id === item.memberId) ||
      members.find(
        (member) =>
          member.memberNumber &&
          member.memberNumber === item.memberNumber
      ) ||
      (!item.memberNumber
        ? members.find((member) => member.memberName === item.memberName)
        : null);
    const existingManagedPackage = managedPackages.find(
      (packageItem) => packageItem.id === item.managedPackageId
    );
    const storedPackageContents = Array.isArray(item.packageContents)
      ? item.packageContents
      : [];
    const existingPackageContents = existingManagedPackage
      ? storedPackageContents
          .map(({ category, items }) => {
            const remainingItems = [...(Array.isArray(items) ? items : [])];
            const removeManagedItem = (name, quantity) => {
              const itemIndex = remainingItems.findIndex(
                (packageItem) =>
                  packageItem.name === name &&
                  Number(packageItem.quantity) === Number(quantity)
              );
              if (itemIndex >= 0) remainingItems.splice(itemIndex, 1);
            };

            if (category === AMMUNITION_CATEGORY) {
              getManagedPackageAmmoItems(existingManagedPackage).forEach(
                ({ ammoType, ammoQuantity }) =>
                  removeManagedItem(ammoType, ammoQuantity)
              );
            } else if (category === "Range Fee Rates") {
              removeManagedItem(
                "Target Board",
                existingManagedPackage.targetBoardQuantity
              );
            }
            return { category, items: remainingItems };
          })
          .filter(({ items }) => items.length > 0)
      : storedPackageContents;
    const existingPackageItems = Array.isArray(item.packageItems)
      ? item.packageItems
      : [];
    const existingPackageCategories = (
      storedPackageContents.length > 0
        ? existingPackageContents.map((content) => content.category)
        : Array.isArray(item.packageCategories) && item.packageCategories.length > 0
        ? item.packageCategories
        : existingPackageItems.map((packageItem) => packageItem.category)
    ).filter((category) => rangePackageCatalog[category]);
    const existingOtherItem =
      existingPackageContents.find(({ category }) => category === "Others")
        ?.items?.[0] ||
      existingPackageItems.find(
        (packageItem) => packageItem.category === "Others"
      );
    const selectedItems = {};
    const itemQuantities = {};

    if (storedPackageContents.length > 0) {
      existingPackageContents.forEach(({ category, items }) => {
        selectedItems[category] = items.map((packageItem) => packageItem.name);
        itemQuantities[category] = Object.fromEntries(
          items.map((packageItem) => [
            packageItem.name,
            packageItem.quantity ? String(packageItem.quantity) : "",
          ])
        );
      });
    } else if (existingPackageItems.length > 0) {
      existingPackageItems.forEach((packageItem) => {
        selectedItems[packageItem.category] = [
          ...(selectedItems[packageItem.category] || []),
          packageItem.name,
        ];
        itemQuantities[packageItem.category] = {
          ...itemQuantities[packageItem.category],
          [packageItem.name]: packageItem.quantity
            ? String(packageItem.quantity)
            : "",
        };
      });
    } else {
      existingPackageCategories.forEach((category) => {
        selectedItems[category] = rangePackageCatalog[category]?.map(
          (packageItem) => packageItem.name
        ) || [];
      });
    }

    setEditingBookingId(item.id);
    setManagedPackageCategory(
      existingManagedPackage?.category || item.managedPackageCategory || ""
    );
    setSelectedManagedPackageId(existingManagedPackage?.id || "");
    setRangePackageCategories(existingPackageCategories);
    setSelectedRangePackageItems(selectedItems);
    setRangePackageItemQuantities(itemQuantities);
    setOtherRangeItem({
      details: existingOtherItem?.details || existingOtherItem?.name || "",
      price:
        existingOtherItem?.unitPrice == null
          ? ""
          : String(existingOtherItem.unitPrice),
    });
    setBooking({
      customerType:
        item.customerType ||
        (item.memberName || item.memberNumber ? "member" : "regular"),
      bookName: item.bookName || "",
      details: item.details || "",
      price: item.originalPrice ?? item.price ?? "",
      discountPercent:
        Number(item.discountPercent) > 0 ? String(item.discountPercent) : "",
      bookDate: item.bookDate || "",
      bookTime: item.bookTime || "",
      durationMinutes: String(
        item.durationMinutes || getDurationFromBookingTime(item.bookTime)
      ),
      memberName: item.memberName || "",
      memberId: savedMember?.id || item.memberId || "",
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

    if (
      rangePackageCategories.includes("Others") &&
      (!otherRangeItem.details.trim() ||
        otherRangeItem.price === "" ||
        !Number.isFinite(Number(otherRangeItem.price)) ||
        Number(otherRangeItem.price) < 0)
    ) {
      setError("Enter a description and a valid price for Others.");
      return;
    }

    const selectedPackageContents = bookingPackageContents;
    if (
      selectedManagedPackage &&
      (!selectedManagedAmmoItems.length ||
        selectedManagedAmmoItems.some(
          ({ ammoType, ammoQuantity }) =>
            !ammunitionTypes.some(
              (item) => item.name === ammoType
            ) ||
            !Number.isInteger(Number(ammoQuantity)) ||
            Number(ammoQuantity) < 1
        ) ||
        !Number.isInteger(Number(selectedManagedPackage.targetBoardQuantity)) ||
        Number(selectedManagedPackage.targetBoardQuantity) < 1)
    ) {
      setError(
        "The selected package has invalid ammunition or target board quantities. Update it in Package Management."
      );
      return;
    }
    const itemsMissingQuantity = selectedPackageContents.some(
      ({ items }) =>
        items.some(
          (item) =>
            "quantity" in item &&
            (!Number.isInteger(item.quantity) || item.quantity < 1)
        )
    );
    if (itemsMissingQuantity) {
      setError("Enter a whole-number quantity of at least 1 for each selected Range Fee, Target Board, and ammunition item.");
      return;
    }

    const isRangePackage = selectedPackageContents.length > 0;
    const bookName =
      booking.customerType === "member"
        ? booking.memberName.trim()
        : booking.bookName.trim();
    const details = isRangePackage
      ? rangePackageDetails
      : booking.details.trim();
    const originalPrice =
      booking.customerType === "member" ? 0 : Number(booking.price);
    const discountPercent =
      booking.discountPercent === "" ? 0 : Number(booking.discountPercent);

    if (
      booking.discountPercent !== "" &&
      (!Number.isInteger(discountPercent) ||
        discountPercent < 1 ||
        discountPercent > 100)
    ) {
      setError("Discount must be a whole percentage from 1 to 100.");
      return;
    }

    if (
      !booking.customerType ||
      !bookName ||
      !details ||
      (booking.customerType !== "member" &&
        (booking.price === "" ||
          !Number.isFinite(originalPrice) ||
          originalPrice < 0)) ||
      !booking.bookDate ||
      !booking.bookTime ||
      !booking.durationMinutes
    ) {
  setError("Please complete all required booking fields.");
  return;
}

const selectedTimeSlot = timeSlots.find(
  (slot) => slot.value === booking.bookTime
);
if (
  ![30, 60].includes(Number(booking.durationMinutes)) ||
  !selectedTimeSlot
) {
  setError("Select a booking duration and available time.");
  return;
}
if (isTimeBooked(booking.bookDate, selectedTimeSlot)) {
  setError("This time overlaps another booking. Please select another time.");
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

    const price = getDiscountedPrice(originalPrice, discountPercent);
    const discountAmount = Number((originalPrice - price).toFixed(2));

    try {

      setSaving(true);

      const bookingData = {
        customerType: booking.customerType,
        bookName,
        details,
        price,
        originalPrice,
        discountPercent,
        discountAmount,
        packageCategory: isRangePackage ? "Range Package" : "",
        packageCategories: selectedPackageContents.map(
          ({ category }) => category
        ),
        packageContents: selectedPackageContents,
        packageItems: [],
        managedPackageId: selectedManagedPackage?.id || "",
        managedPackageCategory: selectedManagedPackage?.category || "",
        managedGunName: selectedManagedPackage?.gunName || "",
        bookDate: booking.bookDate,
        bookTime: booking.bookTime,
        durationMinutes: Number(booking.durationMinutes),
        memberName:
          booking.customerType === "member" ? booking.memberName.trim() : "",
        memberId:
          booking.customerType === "member"
            ? booking.memberId || selectedBookingMember?.id || ""
            : "",
        memberType:
          booking.customerType === "member" ? booking.memberType : "",
        memberNumber:
          booking.customerType === "member" ? booking.memberNumber.trim() : "",
        expirationDate:
          booking.customerType === "member" ? booking.expirationDate : "",
        phoneNumber:
          booking.customerType === "member" ? booking.phoneNumber.trim() : "",
      };

      const querySnapshot = await getDocs(collection(db, "bookings"));
      const conflictingBooking = querySnapshot.docs.find((bookingDoc) => {
        if (bookingDoc.id === editingBookingId) return false;
        const existingBooking = bookingDoc.data();
        if (
          existingBooking.status !== "Booked" ||
          existingBooking.bookDate !== booking.bookDate
        ) {
          return false;
        }

        const existingSlot = parseBookingTimeRange(existingBooking.bookTime);
        if (!existingSlot) {
          return existingBooking.bookTime === booking.bookTime;
        }
        return (
          selectedTimeSlot.startMinutes < existingSlot.endMinutes &&
          existingSlot.startMinutes < selectedTimeSlot.endMinutes
        );
      });

      if (conflictingBooking) {
        setError("This time overlaps another booking. Please select another time.");
        await fetchBookings();
        return;
      }

      if (editingBookingId) {
        const bookingRef = doc(db, "bookings", editingBookingId);
        await updateDoc(bookingRef, {
          ...bookingData,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "bookings"), {
          ...bookingData,
          status: "Booked",
          createdAt: serverTimestamp(),
        });
      }

      // Reset form

      setBooking({
        customerType: "",
        bookName: "",
        details: "",
        price: "",
        discountPercent: "",
        bookDate: "",
        bookTime: "",
        durationMinutes: "",

        memberName: "",
  memberId: "",
  memberType: "Regular",
  memberNumber: "",
  expirationDate: "",
  phoneNumber: "",
      });
      setManagedPackageCategory("");
      setSelectedManagedPackageId("");
      setRangePackageCategories([]);
      setSelectedRangePackageItems({});
      setRangePackageItemQuantities({});

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

  setCompletionError("");

  try {
    const bookingRef = doc(db, "bookings", id);
    await runTransaction(db, async (transaction) => {
      const bookingSnapshot = await transaction.get(bookingRef);
      if (!bookingSnapshot.exists()) {
        throw new Error("This booking could not be found.");
      }

      const currentBooking = bookingSnapshot.data();
      if (currentBooking.status !== "Booked") {
        throw new Error("This booking is no longer active.");
      }

      const inventoryCosts = await adjustAmmunitionInventory(
        transaction,
        currentBooking,
        currentBooking,
        {
          type: "booking",
          reason: "Booking completed",
          referenceId: id,
        }
      );
      transaction.update(bookingRef, {
        status: "Completed",
        completedAt: serverTimestamp(),
        ...inventoryCosts,
      });
    });

    setOpenMenuId(null);
    setMenuPosition(null);

    await fetchBookings();

  } catch (error) {
    console.error("Error completing booking:", error);

    if (error instanceof Error && error.message.startsWith("Not enough stock for ")) {
      setCompletionError(
        `Not enough item stock for ${error.message.slice("Not enough stock for ".length)}`
      );
    } else {
      setCompletionError(
        error instanceof Error
          ? `Failed to mark booking as completed. ${error.message}`
          : "Failed to mark booking as completed."
      );
    }
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
    item.pricing === "corkage-flat" || item.pricing === "custom-flat"
      ? `${formatPrice(item.unitPrice)} flat rate`
      : `${formatPrice(item.unitPrice)} per ${item.unit}`;

  const getRangePackageItemDetails = (item, category) =>
    (category === AMMUNITION_CATEGORY ||
      RANGE_PACKAGE_QUANTITY_ITEMS[category]?.includes(item.name))
      ? item.quantity
        ? category === "Range Fee Rates" && item.unit === "booking"
          ? `${item.quantity} ${item.quantity === 1 ? "booking" : "bookings"}`
          : item.unit === "round"
          ? `${item.quantity} ${item.quantity === 1 ? "round" : "rounds"}`
          : item.unit === "board"
          ? `${item.quantity} ${item.quantity === 1 ? "board" : "boards"}`
          : `${item.quantity} × ${item.unit}`
        : "Quantity not recorded"
      : getRangePackageItemRate(item);

  const getRangePackageItemsTotal = (contents) =>
    contents.reduce(
      (total, { items }) =>
        total +
        items.reduce((categoryTotal, item) => {
          if (item.includedInPackagePrice) {
            return categoryTotal;
          }

          const quantity =
            "quantity" in item ? Number(item.quantity) || 0 : 1;
          const unitPrice = Number(item.unitPrice) || 0;
          return categoryTotal + unitPrice * quantity;
        }, 0),
      0
    );

  const getBookingTotalAmount = (bookingRecord) => {
    const packageContents = Array.isArray(bookingRecord.packageContents)
      ? bookingRecord.packageContents
      : [];
    const packageItems = Array.isArray(bookingRecord.packageItems)
      ? bookingRecord.packageItems
      : [];
    const selectedItemsTotal =
      packageContents.length > 0
        ? getRangePackageItemsTotal(packageContents)
        : packageItems.reduce((total, item) => {
            if (item.includedInPackagePrice) {
              return total;
            }

            const quantity =
              "quantity" in item ? Number(item.quantity) || 0 : 1;
            const unitPrice = Number(item.unitPrice) || 0;
            return total + unitPrice * quantity;
          }, 0);

    return (Number(bookingRecord.price) || 0) + selectedItemsTotal;
  };

  const getRangePackageDetails = (contents) =>
    `${contents
      .map(
        ({ category, items }) =>
          `${RANGE_PACKAGE_CATEGORY_LABELS[category] || category}:\n${items
            .map(
              (item) =>
                `- ${item.name}: ${getRangePackageItemDetails(item, category)}`
            )
            .join("\n")}`
      )
      .join("\n\n")}\n\nSelected Items Total (informational): ${formatPrice(
      getRangePackageItemsTotal(contents)
    )}`;

  const selectedRangePackageContents = getRangePackageContents(
    rangePackageCategories,
    selectedRangePackageItems,
    rangePackageItemQuantities,
    otherRangeItem,
    rangePackageCatalog
  );
  const selectedManagedPackage = managedPackages.find(
    (packageItem) => packageItem.id === selectedManagedPackageId
  );
  const selectedManagedAmmoItems = selectedManagedPackage
    ? getManagedPackageAmmoItems(selectedManagedPackage)
    : [];
  const enteredPackagePrice = Number(booking.price);
  const formDiscountPercent =
    booking.discountPercent === "" ? 0 : Number(booking.discountPercent);
  const isValidFormDiscount =
    booking.discountPercent === "" ||
    (Number.isInteger(formDiscountPercent) &&
      formDiscountPercent >= 1 &&
      formDiscountPercent <= 100);
  const discountedPackagePrice =
    booking.price !== "" &&
    Number.isFinite(enteredPackagePrice) &&
    isValidFormDiscount
      ? getDiscountedPrice(enteredPackagePrice, formDiscountPercent)
      : null;
  const formDiscountAmount =
    discountedPackagePrice == null
      ? 0
      : Number((enteredPackagePrice - discountedPackagePrice).toFixed(2));
  const managedPackageContents = selectedManagedPackage
    ? [
        {
          category: AMMUNITION_CATEGORY,
          items: selectedManagedAmmoItems.flatMap(
            ({ ammoType, ammoQuantity }) => {
              const ammunition = ammunitionTypes.find(
                (item) => item.name === ammoType
              );
              return ammunition
                ? [
                    {
                      name: ammunition.name,
                      unitPrice: ammunition.unitPrice,
                      unit: ammunition.unit,
                      inventoryName: ammunition.inventoryName || ammunition.name,
                      quantity: Number(ammoQuantity),
                      includedInPackagePrice: true,
                    },
                  ]
                : [];
            }
          ),
        },
        ...(targetBoardItem
          ? [
              {
                category: "Range Fee Rates",
                items: [
                  {
                    name: targetBoardItem.name,
                    unitPrice: targetBoardItem.unitPrice,
                    unit: targetBoardItem.unit,
                    inventoryName: targetBoardItem.inventoryName,
                    quantity: Number(
                      selectedManagedPackage.targetBoardQuantity
                    ),
                    includedInPackagePrice: true,
                  },
                ],
              },
            ]
          : []),
      ].filter(({ items }) => items.length > 0)
    : [];
  const combinedContentsByCategory = new Map();
  [...selectedRangePackageContents, ...managedPackageContents].forEach(
    ({ category, items }) => {
      combinedContentsByCategory.set(category, [
        ...(combinedContentsByCategory.get(category) || []),
        ...items,
      ]);
    }
  );
  const bookingPackageContents = [...combinedContentsByCategory].map(
    ([category, items]) => ({ category, items })
  );
  const hasRangePackageCategories = bookingPackageContents.length > 0;
  const rangePackageDetails = bookingPackageContents.length
    ? [
        selectedManagedPackage?.details?.trim(),
        getRangePackageDetails(bookingPackageContents),
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  const getBookingDetails = (bookingRecord) => {
    if (bookingRecord.details?.trim()) {
      return bookingRecord.details;
    }

    if (
      Array.isArray(bookingRecord.packageContents) &&
      bookingRecord.packageContents.length > 0
    ) {
      return getRangePackageDetails(bookingRecord.packageContents);
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
  const filteredBookings = activeBookings
    .filter((item) =>
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
        .some((name) =>
          (name || "").toLocaleLowerCase().includes(normalizedSearch)
        )
    )
    .sort((first, second) => {
      const dateOrder = (first.bookDate || "").localeCompare(
        second.bookDate || ""
      );
      if (dateOrder !== 0) return dateOrder;

      const firstStart = parseBookingTimeRange(first.bookTime)?.startMinutes;
      const secondStart = parseBookingTimeRange(second.bookTime)?.startMinutes;
      if (firstStart != null && secondStart != null) {
        return firstStart - secondStart;
      }

      return (first.bookTime || "").localeCompare(second.bookTime || "");
    });


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
      {completionError && (
        <p className="booking-error" role="alert">
          {completionError}
        </p>
      )}
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
                    Package Name
                  </th>

                  <th>
                    Total Amount
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
                      {formatPrice(getBookingTotalAmount(item))}
                    </td>

                    <td>
                      {formatDisplayDate(item.bookDate)}
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
                  <h3>Package Management Packages</h3>
                  <p>
                    Choose a package category and gun to automatically include
                    its ammunition in the booking.
                  </p>
                </div>

                {managedPackageError && (
                  <p className="booking-error" role="alert">
                    {managedPackageError}
                  </p>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="managed-package-category">
                      Package category
                    </label>
                    <select
                      id="managed-package-category"
                      value={managedPackageCategory}
                      onChange={(event) =>
                        handleManagedPackageCategoryChange(event.target.value)
                      }
                    >
                      <option value="">Select a package category</option>
                      {managedPackageCategories.map((category) => (
                        <option value={category} key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="managed-package-gun">Gun name</label>
                    <select
                      id="managed-package-gun"
                      value={selectedManagedPackageId}
                      onChange={(event) =>
                        handleManagedPackageChange(event.target.value)
                      }
                      disabled={!managedPackageCategory}
                    >
                      <option value="">Select a gun / package</option>
                      {packagesInSelectedCategory.map((packageItem) => (
                        <option value={packageItem.id} key={packageItem.id}>
                          {packageItem.gunName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedManagedPackage && (
                  <div className="range-package-category-content">
                    <h4>{selectedManagedPackage.gunName}</h4>
                    <p>
                      {selectedManagedPackage.details || "No package details"}
                    </p>
                    <ul>
                      {selectedManagedAmmoItems.map(
                        ({ ammoType, ammoQuantity }, index) => {
                          const ammunition = ammunitionTypes.find(
                            (item) => item.name === ammoType
                          );
                          return (
                            <li key={`${ammoType}-${index}`}>
                              <span>
                                {ammoType} · {ammoQuantity}{" "}
                                {ammunition?.unit || "rounds"}
                              </span>
                            </li>
                          );
                        }
                      )}
                      <li>
                        <span>
                          Target Board ·{" "}
                          {selectedManagedPackage.targetBoardQuantity || 0}{" "}
                          boards
                        </span>
                      </li>
                    </ul>
                  </div>
                )}
              </section>

              <section className="range-package-builder">
                <div className="range-package-heading">
                  <h3>Range Package</h3>
                  <p>
                    Select a section to show its catalog, then check the items
                    to include. Enter the booking price separately.
                  </p>
                </div>

                {ammunitionCatalogError && (
                  <p className="booking-error" role="alert">
                    {ammunitionCatalogError}
                  </p>
                )}

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

                {rangePackageCategories.map((category) => (
                  <div className="range-package-category-content" key={category}>
                    <h4>{RANGE_PACKAGE_CATEGORY_LABELS[category]}</h4>
                    {category === "Others" ? (
                      <div className="range-package-other-fields">
                        <label>
                          Details
                          <input
                            type="text"
                            value={otherRangeItem.details}
                            onChange={(event) => {
                              setOtherRangeItem((current) => ({
                                ...current,
                                details: event.target.value,
                              }));
                              setError("");
                            }}
                            placeholder="Enter other item details"
                            required
                          />
                        </label>
                        <label>
                          Price
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={otherRangeItem.price}
                            onChange={(event) => {
                              setOtherRangeItem((current) => ({
                                ...current,
                                price: event.target.value,
                              }));
                              setError("");
                            }}
                            placeholder="Enter price"
                            required
                          />
                        </label>
                      </div>
                    ) : (
                      <ul>
                        {rangePackageCatalog[category].map((item) => (
                          <li key={item.name}>
                            <label className="range-package-item-option">
                              <input
                                type="checkbox"
                                checked={
                                  selectedRangePackageItems[category]?.includes(
                                    item.name
                                  ) || false
                                }
                                onChange={() =>
                                  handleRangePackageItemChange(
                                    category,
                                    item.name
                                  )
                                }
                              />
                              <span>{item.name}</span>
                            </label>
                            <strong>
                              {getRangePackageItemRate(item)}
                            </strong>
                            {(category === AMMUNITION_CATEGORY ||
                              RANGE_PACKAGE_QUANTITY_ITEMS[category]?.includes(
                                item.name
                              )) &&
                              selectedRangePackageItems[category]?.includes(
                                item.name
                              ) && (
                                <label className="range-package-quantity">
                                  Quantity
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={
                                      rangePackageItemQuantities[category]?.[
                                        item.name
                                      ] || ""
                                    }
                                    onChange={(event) =>
                                      handleRangePackageQuantityChange(
                                        category,
                                        item.name,
                                        event.target.value
                                      )
                                    }
                                    aria-label={`Quantity for ${item.name}`}
                                  />
                                </label>
                              )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>


              {/* BOOK NAME */}
              {booking.customerType !== "member" && (
                <div className="form-group">
                  <label>
                    Package Name
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
              )}

              {/* PRICE */}
              {booking.customerType !== "member" && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="booking-package-price">Package Price</label>
                    <input
                      id="booking-package-price"
                      type="number"
                      name="price"
                      placeholder="Enter the package price"
                      min="0"
                      step="0.01"
                      value={booking.price}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="booking-discount-percent">Discount (%)</label>
                    <input
                      id="booking-discount-percent"
                      type="number"
                      name="discountPercent"
                      placeholder="1-100"
                      min="1"
                      max="100"
                      step="1"
                      value={booking.discountPercent}
                      onChange={handleChange}
                      aria-describedby="booking-discount-hint"
                    />
                    <small id="booking-discount-hint">
                      Leave blank for no discount.
                    </small>
                  </div>
                </div>
              )}

              {booking.customerType !== "member" &&
                discountedPackagePrice != null && (
                <div
                  className="booking-discount-summary"
                  id="booking-discount-summary"
                  aria-live="polite"
                >
                  <span>
                    {formDiscountPercent > 0
                      ? `Price after ${formDiscountPercent}% discount`
                      : "Package price"}
                  </span>
                  <strong>{formatPrice(discountedPackagePrice)}</strong>
                  {formDiscountPercent > 0 && (
                    <span>You save {formatPrice(formDiscountAmount)}</span>
                  )}
                </div>
              )}


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

              {/* =========================
    SURESHOTS MEMBER
========================= */}

{booking.customerType === "member" && (
  <div className="member-section">
  <h3>Sureshots Member Information</h3>

  <div className="form-group">
    <label htmlFor="booking-member-name">Member Name</label>
    <select
      id="booking-member-name"
      value={selectedBookingMember?.id || (booking.memberName ? LEGACY_MEMBER_OPTION : "")}
      onChange={(event) => {
        if (event.target.value !== LEGACY_MEMBER_OPTION) {
          handleMemberSelect(event.target.value);
        }
      }}
      disabled={membersLoading}
      required
    >
      <option value="">
        {membersLoading ? "Loading members..." : "Select a member"}
      </option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.memberName}
          {member.memberNumber ? ` (${member.memberNumber})` : ""}
        </option>
      ))}
      {booking.memberName && !selectedBookingMember && (
        <option value={LEGACY_MEMBER_OPTION}>
          {booking.memberName} (not in Members list)
        </option>
      )}
    </select>
    {membersError && <small role="alert">{membersError}</small>}
    {!membersLoading && !membersError && members.length === 0 && (
      <small>No Sureshots members have been added yet.</small>
    )}
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
                <label htmlFor="booking-duration">Booking Duration</label>
                <select
                  id="booking-duration"
                  name="durationMinutes"
                  value={booking.durationMinutes}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select duration</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="booking-time">Booking Time</label>

                <select
                  id="booking-time"
                  name="bookTime"
                  value={booking.bookTime}
                  onChange={handleChange}
                  required
                  disabled={!booking.bookDate || !booking.durationMinutes}
                >

                  <option value="">
                    {!booking.bookDate
                      ? "Select a date first"
                      : !booking.durationMinutes
                        ? "Select duration first"
                        : "Select time"}
                  </option>


                  {timeSlots.map((slot) => {

                    const booked =
                      isTimeBooked(
                        booking.bookDate,
                        slot
                      );

                    return (

                      <option
                        key={slot.value}
                        value={slot.value}
                        disabled={booked}
                      >
                        {slot.value}

                        {booked
                          ? " - UNAVAILABLE"
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
            <span>
              {Number(viewingBooking.discountPercent) > 0
                ? "Price after discount"
                : "Price"}
            </span>
            <strong>
              {formatPrice(viewingBooking.price)}
            </strong>
          </div>

          {Number(viewingBooking.discountPercent) > 0 && (
            <>
              <div className="view-item">
                <span>Original Package Price</span>
                <strong>
                  {formatPrice(
                    viewingBooking.originalPrice ?? viewingBooking.price
                  )}
                </strong>
              </div>
              <div className="view-item">
                <span>Discount ({viewingBooking.discountPercent}%)</span>
                <strong>
                  -{formatPrice(viewingBooking.discountAmount)}
                </strong>
              </div>
            </>
          )}

          <div className="view-item">
            <span>Booking Date</span>
            <strong>
              {formatDisplayDate(viewingBooking.bookDate)}
            </strong>
          </div>

          <div className="view-item">
            <span>Booking Time</span>
            <strong>
              {viewingBooking.bookTime || "-"}
            </strong>
          </div>

          <div className="view-item">
            <span>Duration</span>
            <strong>
              {formatBookingDuration(
                viewingBooking.durationMinutes ||
                  getDurationFromBookingTime(viewingBooking.bookTime)
              )}
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
                          {getRangePackageItemDetails(item, category)}
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
            {Array.isArray(viewingBooking.packageContents) &&
              viewingBooking.packageContents.length > 0 && (
                <div className="view-package-total">
                  <span>Selected Items Total (informational)</span>
                  <strong>
                    {formatPrice(
                      getRangePackageItemsTotal(viewingBooking.packageContents)
                    )}
                  </strong>
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
              {formatDisplayDate(viewingBooking.expirationDate)}
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
                <dd>{formatDisplayDate(printingBooking.bookDate)}</dd>
              </div>
              <div>
                <dt>Booking Time</dt>
                <dd>{printingBooking.bookTime || "-"}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>
                  {formatBookingDuration(
                    printingBooking.durationMinutes ||
                      getDurationFromBookingTime(printingBooking.bookTime)
                  )}
                </dd>
              </div>
              {Number(printingBooking.discountPercent) > 0 && (
                <>
                  <div>
                    <dt>Original Package Price</dt>
                    <dd>
                      {formatPrice(
                        printingBooking.originalPrice ?? printingBooking.price
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Discount ({printingBooking.discountPercent}%)</dt>
                    <dd>-{formatPrice(printingBooking.discountAmount)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>
                  {Number(printingBooking.discountPercent) > 0
                    ? "Price after discount"
                    : "Total Price"}
                </dt>
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
                        <strong>
                          {getRangePackageItemDetails(item, category)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="booking-print-package-total">
                Selected Items Total (informational):{" "}
                {formatPrice(
                  getRangePackageItemsTotal(printingBooking.packageContents)
                )}
              </p>
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
                  <dd>{formatDisplayDate(printingBooking.expirationDate)}</dd>
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