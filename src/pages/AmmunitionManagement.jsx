import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot } from "firebase/firestore";

import { db } from "../firebase";
import {
  addAmmunitionStock,
  AMMUNITION_INVENTORY_COLLECTION,
  createAmmunitionItem,
  CUSTOM_AMMUNITION_UNITS,
  getAmmunitionInventoryId,
  getAmmunitionMovements,
  getAmmunitionTypes,
  getAmmunitionUnitLabel,
  getTargetBoardItem,
  removeAmmunitionItem,
  syncLegacyAmmunitionNames,
  updateAmmunitionItem,
} from "../utils/ammunitionInventory";
import { getLocalDateKey } from "../utils/date";
import { RANGE_PACKAGE_CATALOG } from "../utils/rangePackage";
import "../styles/ammunitionManagement.css";

const ammunitionTypes = RANGE_PACKAGE_CATALOG["Ammunition Prices"];
const defaultTargetBoardItem = RANGE_PACKAGE_CATALOG["Range Fee Rates"].find(
  (item) => item.name === "Target Board"
);
const EMPTY_AMMUNITION_ITEM = {
  name: "",
  unit: "piece",
  unitPrice: "",
  initialStock: "0",
  initialStockCost: "0",
};
const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(amount) || 0);
const formatMovementDate = (timestamp) => {
  if (typeof timestamp?.toDate === "function") {
    return timestamp.toDate().toLocaleString("en-PH");
  }
  return "Date unavailable";
};
const getMovementDateKey = (timestamp) =>
  typeof timestamp?.toDate === "function"
    ? getLocalDateKey(timestamp.toDate())
    : "";
const getMovementLabel = (type) =>
  ({
    stock_in: "Stock added",
    opening_cost: "Opening cost set",
    cost_adjustment: "Cost updated",
    manual_stock_out: "Manual stock out",
    booking_out: "Booking usage",
    booking_return: "Booking stock returned",
    booking_cost_adjustment: "Booking cost adjusted",
    sale_out: "Sale usage",
    sale_return: "Sale stock returned",
    sale_cost_adjustment: "Sale cost adjusted",
  })[type] || type || "Inventory movement";
const getStockOutActivityLabel = (type) =>
  ({
    booking_out: "Completed booking",
    sale_out: "Sold",
    manual_stock_out: "Manual stock out",
  })[type] || getMovementLabel(type);

export default function AmmunitionManagement() {
  const [stockLevels, setStockLevels] = useState({});
  const [inventoryNamesById, setInventoryNamesById] = useState({});
  const [dailyStockOutByItem, setDailyStockOutByItem] = useState({});
  const [todayDate, setTodayDate] = useState(() => getLocalDateKey(new Date()));
  const [movementError, setMovementError] = useState("");
  const [builtInAmmunitionTypes, setBuiltInAmmunitionTypes] =
    useState(ammunitionTypes);
  const [customAmmunitionTypes, setCustomAmmunitionTypes] = useState([]);
  const [targetBoardItem, setTargetBoardItem] = useState(
    defaultTargetBoardItem
  );
  const [stockInputs, setStockInputs] = useState({});
  const [stockPurchaseCosts, setStockPurchaseCosts] = useState({});
  const [inventoryUnitCosts, setInventoryUnitCosts] = useState({});
  const [inventoryStockValues, setInventoryStockValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAmmunitionItem, setNewAmmunitionItem] = useState(
    EMPTY_AMMUNITION_ITEM
  );
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [stockItem, setStockItem] = useState(null);
  const [viewingMovementsItem, setViewingMovementsItem] = useState(null);
  const [stockMovements, setStockMovements] = useState([]);
  const [movementLogLoading, setMovementLogLoading] = useState(false);
  const [movementLogError, setMovementLogError] = useState("");
  const [viewingStockOutMovements, setViewingStockOutMovements] =
    useState(false);
  const [stockOutMovements, setStockOutMovements] = useState([]);
  const [stockOutMovementsLoading, setStockOutMovementsLoading] =
    useState(false);
  const [stockOutMovementsError, setStockOutMovementsError] = useState("");
  const [stockOutFromDate, setStockOutFromDate] = useState("");
  const [stockOutToDate, setStockOutToDate] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingPrice, setEditingPrice] = useState("");
  const [editingStockCost, setEditingStockCost] = useState("");
  const [editingStockOutAmount, setEditingStockOutAmount] = useState("");
  const [stockOutReason, setStockOutReason] = useState("");
  const [itemActionLoading, setItemActionLoading] = useState(false);
  const inventoryItems = [
    ...builtInAmmunitionTypes,
    ...customAmmunitionTypes,
    targetBoardItem,
  ].filter(Boolean);
  const selectedMenuItem = inventoryItems.find(
    (item) => getAmmunitionInventoryId(item.inventoryName || item.name) === openMenuId
  );
  const startingStockUnit =
    newAmmunitionItem.unit === "piece" ? "pieces" : "rounds";
  const startingStockCostUnit =
    newAmmunitionItem.unit === "piece" ? "piece" : "round";
  const todayMovements = Object.values(dailyStockOutByItem).filter(
    (movement) => movement.date === todayDate && movement.quantity > 0
  );
  const dailyStockOutTotal = todayMovements.reduce(
    (total, movement) => total + movement.quantity,
    0
  );
  const validStockOutDateRange =
    Boolean(stockOutFromDate) &&
    Boolean(stockOutToDate) &&
    stockOutFromDate <= stockOutToDate;
  const filteredStockOutMovements = validStockOutDateRange
    ? stockOutMovements.filter((movement) => {
        const movementDate = getMovementDateKey(movement.createdAt);
        return (
          movementDate >= stockOutFromDate && movementDate <= stockOutToDate
        );
      })
    : [];
  const filteredStockOutTotal = filteredStockOutMovements.reduce(
    (total, movement) => total + Math.abs(Number(movement.quantityChange)),
    0
  );
  const stockItemInventoryName =
    stockItem?.inventoryName || stockItem?.name || "";
  const stockItemInventoryId = stockItem
    ? getAmmunitionInventoryId(stockItemInventoryName)
    : "";
  const stockItemCurrentStock = stockLevels[stockItemInventoryId] || 0;
  const stockItemUnitCost = inventoryUnitCosts[stockItemInventoryId];
  const stockItemUnit = stockItem
    ? getAmmunitionUnitLabel(
        stockItem.name,
        customAmmunitionTypes,
        stockItemInventoryName
      )
    : "units";
  const stockItemCostUnit = stockItemUnit.endsWith("s")
    ? stockItemUnit.slice(0, -1)
    : stockItemUnit;
  const stockItemNeedsOpeningCost =
    stockItemCurrentStock > 0 &&
    (stockItemUnitCost == null || !Number.isFinite(stockItemUnitCost));
  const editingInventoryName =
    editingItem?.inventoryName || editingItem?.name || "";
  const editingInventoryId = editingItem
    ? getAmmunitionInventoryId(editingInventoryName)
    : "";
  const editingCurrentStock = stockLevels[editingInventoryId] || 0;
  const editingStockUnit = editingItem
    ? getAmmunitionUnitLabel(
        editingItem.name,
        customAmmunitionTypes,
        editingInventoryName
      )
    : "units";
  const editingCostUnit = editingStockUnit.endsWith("s")
    ? editingStockUnit.slice(0, -1)
    : editingStockUnit;

  useEffect(() => {
    let isCurrent = true;
    Promise.all([getAmmunitionTypes(), getTargetBoardItem()])
      .then(([items, targetBoard]) => {
        if (isCurrent) {
          setBuiltInAmmunitionTypes(items.filter((item) => item.builtIn));
          setTargetBoardItem(targetBoard);
        }
      })
      .catch((catalogError) => {
        console.error("Error loading ammunition catalog:", catalogError);
        if (isCurrent) {
          setLoadError("Unable to load ammunition catalog. Please try again.");
        }
      });

    syncLegacyAmmunitionNames().catch((syncError) => {
      console.error("Error syncing legacy ammunition names:", syncError);
    });

    const unsubscribe = onSnapshot(
      collection(db, AMMUNITION_INVENTORY_COLLECTION),
      (snapshot) => {
        const records = {};
        const inventoryNames = {};
        const unitCosts = {};
        const stockValues = {};
        const dailyMovements = {};
        const customItems = [];
        try {
          snapshot.docs.forEach((inventoryDoc) => {
            const data = inventoryDoc.data();
            const quantity = Number(data.quantity);
            if (!Number.isInteger(quantity) || quantity < 0) {
              throw new Error(
                `Invalid stock quantity for ${data.name || inventoryDoc.id}.`
              );
            }
            records[inventoryDoc.id] = quantity;
            const fallbackName = decodeURIComponent(inventoryDoc.id);
            inventoryNames[inventoryDoc.id] = {
              inventoryName: fallbackName,
              name:
                typeof data.name === "string" && data.name.trim()
                  ? data.name.trim()
                  : fallbackName,
              unit: data.unit,
            };
            const unitCost = data.unitCost;
            unitCosts[inventoryDoc.id] =
              typeof unitCost === "number" &&
              Number.isFinite(unitCost) &&
              unitCost >= 0
                ? unitCost
                : null;
            const stockValue = data.stockValue;
            stockValues[inventoryDoc.id] =
              typeof stockValue === "number" &&
              Number.isFinite(stockValue) &&
              stockValue >= 0
                ? stockValue
                : unitCosts[inventoryDoc.id] != null
                  ? Math.round(
                      quantity * unitCosts[inventoryDoc.id] * 100
                    ) / 100
                  : null;
            if (
              data.dailyStockOutDate != null ||
              data.dailyStockOutQuantity != null
            ) {
              if (
                typeof data.dailyStockOutDate !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(data.dailyStockOutDate) ||
                !Number.isInteger(data.dailyStockOutQuantity) ||
                data.dailyStockOutQuantity < 0
              ) {
                throw new Error(
                  `Invalid daily stock-out total for ${data.name || inventoryDoc.id}.`
                );
              }
              dailyMovements[inventoryDoc.id] = {
                date: data.dailyStockOutDate,
                quantity: data.dailyStockOutQuantity,
              };
            }
            if (data.custom === true) {
              if (data.active === false) return;
              const unitPrice = Number(data.unitPrice);
              if (
                typeof data.name !== "string" ||
                !data.name.trim() ||
                !CUSTOM_AMMUNITION_UNITS.includes(data.unit) ||
                !Number.isFinite(unitPrice) ||
                unitPrice < 0
              ) {
                throw new Error(`Invalid custom ammunition item ${inventoryDoc.id}.`);
              }
              customItems.push({
                name: data.name.trim(),
                inventoryName: decodeURIComponent(inventoryDoc.id),
                unit: data.unit,
                unitPrice,
                custom: true,
              });
            }
          });
          customItems.sort((first, second) =>
            first.name.localeCompare(second.name)
          );
          setStockLevels(records);
          setInventoryNamesById(inventoryNames);
          setInventoryUnitCosts(unitCosts);
          setInventoryStockValues(stockValues);
          setDailyStockOutByItem(dailyMovements);
          setCustomAmmunitionTypes(customItems);
          setLoadError("");
          setMovementError("");
        } catch (loadError) {
          console.error("Error reading ammunition inventory:", loadError);
          setLoadError("Unable to read ammunition stock. Please try again.");
          setMovementError(
            "Unable to read today's ammunition stock-out total."
          );
        } finally {
          setLoading(false);
        }
      },
      (loadError) => {
        console.error("Error loading ammunition inventory:", loadError);
        setLoadError("Unable to load ammunition stock. Please try again.");
        setMovementError(
          "Unable to load today's ammunition stock-out total."
        );
        setLoading(false);
      }
    );

    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeMenu = () => {
      setOpenMenuId(null);
      setMenuPosition(null);
    };

    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [openMenuId]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    const timeout = window.setTimeout(
      () => setTodayDate(getLocalDateKey(new Date())),
      nextMidnight.getTime() - now.getTime() + 50
    );

    return () => window.clearTimeout(timeout);
  }, [todayDate]);

  const toggleMenu = (item, event) => {
    const inventoryId = getAmmunitionInventoryId(
      item.inventoryName || item.name
    );
    if (openMenuId === inventoryId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }

    const buttonRect = event.currentTarget.getBoundingClientRect();
    const menuHeight = 182;
    setMenuPosition({
      top:
        buttonRect.bottom + menuHeight + 4 > window.innerHeight
          ? buttonRect.top - menuHeight - 4
          : buttonRect.bottom + 4,
      left: Math.max(8, buttonRect.right - 140),
    });
    setOpenMenuId(inventoryId);
  };

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const handleStartAddStock = (item) => {
    closeMenu();
    setError("");
    setSuccess("");
    setStockItem(item);
  };

  const handleCreateItem = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const name = newAmmunitionItem.name.trim();
    const unitPrice = Number(newAmmunitionItem.unitPrice);
    const initialStock = Number(newAmmunitionItem.initialStock);
    const initialStockCost = newAmmunitionItem.initialStockCost;
    if (
      inventoryItems.some(
        (item) => item.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setError("An inventory item with this name already exists.");
      return;
    }

    setCreating(true);
    try {
      await createAmmunitionItem({
        name,
        unit: newAmmunitionItem.unit,
        unitPrice,
        initialStock,
        initialStockCost,
      });
      setNewAmmunitionItem(EMPTY_AMMUNITION_ITEM);
      setShowCreateForm(false);
      setSuccess(`Created ${name} ammunition item.`);
    } catch (createError) {
      console.error("Error creating ammunition item:", createError);
      setError(
        createError instanceof Error
          ? `Unable to create ammunition item. ${createError.message}`
          : "Unable to create ammunition item. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleStartRename = (item) => {
    closeMenu();
    const inventoryId = getAmmunitionInventoryId(
      item.inventoryName || item.name
    );
    setEditingItem(item);
    setEditingName(item.name);
    setEditingPrice(String(item.unitPrice ?? ""));
    setEditingStockCost(
      inventoryStockValues[inventoryId] == null
        ? ""
        : String(inventoryStockValues[inventoryId])
    );
    setEditingStockOutAmount("");
    setStockOutReason("");
    setError("");
    setSuccess("");
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editingItem) return;

    setError("");
    setSuccess("");
    const unitPrice = Number(editingPrice);
    const stockOutAmount =
      editingStockOutAmount === "" ? 0 : Number(editingStockOutAmount);
    const stockOutReasonValue = stockOutReason.trim();
    if (!Number.isInteger(stockOutAmount) || stockOutAmount < 0) {
      setError("Enter a whole-number stock-out quantity of 0 or more.");
      return;
    }
    if (stockOutAmount > editingCurrentStock) {
      setError(
        `Not enough stock. Available: ${editingCurrentStock}; requested: ${stockOutAmount}.`
      );
      return;
    }
    if (stockOutAmount > 0 && !stockOutReasonValue) {
      setError("Enter a reason for the stock out.");
      return;
    }
    if (
      !editingItem.targetBoard &&
      editingCurrentStock > 0 &&
      editingStockCost === ""
    ) {
      setError("Enter the total cost of the current stock.");
      return;
    }

    setItemActionLoading(true);
    try {
      const updatedInventory = await updateAmmunitionItem(
        editingItem,
        editingName,
        editingPrice,
        {
          stockValue: editingItem.targetBoard ? undefined : editingStockCost,
          stockOutAmount,
          stockOutReason: stockOutReasonValue,
        }
      );
      const inventoryId = getAmmunitionInventoryId(
        editingInventoryName
      );
      setStockLevels((current) => ({
        ...current,
        [inventoryId]: updatedInventory.quantity,
      }));
      setInventoryStockValues((current) => ({
        ...current,
        [inventoryId]: updatedInventory.stockValue,
      }));
      setInventoryUnitCosts((current) => ({
        ...current,
        [inventoryId]: updatedInventory.unitCost,
      }));
      if (editingItem.targetBoard) {
        setTargetBoardItem((current) =>
          current
            ? { ...current, name: editingName.trim(), unitPrice }
            : current
        );
      } else if (editingItem.builtIn) {
        setBuiltInAmmunitionTypes((current) =>
          current.map((item) =>
            item.catalogId === editingItem.catalogId
              ? { ...item, name: editingName.trim(), unitPrice }
              : item
          )
        );
      } else {
        setCustomAmmunitionTypes((current) =>
          current.map((item) =>
            item.inventoryName === editingItem.inventoryName
              ? { ...item, name: editingName.trim(), unitPrice }
              : item
          )
        );
      }
      setSuccess(
        stockOutAmount > 0
          ? `Updated ${editingName.trim()} and recorded ${stockOutAmount} units stocked out.`
          : `Updated ${editingName.trim()}.`
      );
      setEditingItem(null);
      setEditingName("");
      setEditingPrice("");
      setEditingStockCost("");
      setEditingStockOutAmount("");
      setStockOutReason("");
    } catch (saveError) {
      console.error("Error updating ammunition item:", saveError);
      setError(
        saveError instanceof Error
          ? `Unable to update ammunition item. ${saveError.message}`
          : "Unable to update ammunition item. Please try again."
      );
    } finally {
      setItemActionLoading(false);
    }
  };

  const handleRemoveItem = async (item) => {
    closeMenu();
    setError("");
    setSuccess("");
    if (
      !window.confirm(
        `Remove ${item.name} from future ammunition selections? Existing booking and sales records will be kept.`
      )
    ) {
      return;
    }

    setItemActionLoading(true);
    try {
      await removeAmmunitionItem(item);
      if (item.targetBoard) {
        setTargetBoardItem(null);
      } else if (item.builtIn) {
        setBuiltInAmmunitionTypes((current) =>
          current.filter((entry) => entry.catalogId !== item.catalogId)
        );
      } else {
        setCustomAmmunitionTypes((current) =>
          current.filter(
            (entry) => entry.inventoryName !== item.inventoryName
          )
        );
      }
      setSuccess(`Removed ${item.name} from future selections.`);
    } catch (removeError) {
      console.error("Error removing ammunition item:", removeError);
      setError(
        removeError instanceof Error
          ? `Unable to remove ammunition item. ${removeError.message}`
          : "Unable to remove ammunition item. Please try again."
      );
    } finally {
      setItemActionLoading(false);
    }
  };

  const handleAddStock = async (
    ammunitionName,
    inventoryName = ammunitionName
  ) => {
    setError("");
    setSuccess("");
    const input = stockInputs[ammunitionName] || "";
    const amount = Number(input);
    const purchaseCostInput = stockPurchaseCosts[inventoryName] || "";
    const purchaseCost = Number(purchaseCostInput);
    if (!input.trim() || !Number.isInteger(amount) || amount < 1) {
      setError("Enter a whole-number stock quantity of at least 1.");
      return;
    }
    if (
      !purchaseCostInput.trim() ||
      !Number.isFinite(purchaseCost) ||
      purchaseCost < 0
    ) {
      setError("Enter the total purchase cost for the new stock.");
      return;
    }

    setSavingName(ammunitionName);
    try {
      const updatedInventory = await addAmmunitionStock(
        ammunitionName,
        amount,
        purchaseCost,
        inventoryName
      );
      const inventoryId = getAmmunitionInventoryId(inventoryName);
      setStockLevels((current) => ({
        ...current,
        [inventoryId]: updatedInventory.quantity,
      }));
      setInventoryUnitCosts((current) => ({
        ...current,
        [inventoryId]: updatedInventory.unitCost,
      }));
      setInventoryStockValues((current) => ({
        ...current,
        [inventoryId]: updatedInventory.stockValue,
      }));
      setStockInputs((current) => ({ ...current, [ammunitionName]: "" }));
      setStockPurchaseCosts((current) => ({
        ...current,
        [inventoryName]: "",
      }));
      setStockItem(null);
      setSuccess(
        `Added ${amount} ${getAmmunitionUnitLabel(
          ammunitionName,
          customAmmunitionTypes,
          inventoryName
        )} for ${ammunitionName}.`
      );
    } catch (saveError) {
      console.error("Error adding ammunition stock:", saveError);
      setError(
        saveError instanceof Error
          ? `Unable to add stock. ${saveError.message}`
          : "Unable to add stock. Please try again."
      );
    } finally {
      setSavingName("");
    }
  };

  const handleViewMovements = async (item) => {
    closeMenu();
    setViewingMovementsItem(item);
    setStockMovements([]);
    setMovementLogError("");
    setMovementLogLoading(true);
    try {
      const movements = await getAmmunitionMovements(
        item.inventoryName || item.name
      );
      setStockMovements(movements);
    } catch (movementError) {
      console.error("Error loading ammunition stock movements:", movementError);
      setMovementLogError(
        "Unable to load stock movements. Please try again."
      );
    } finally {
      setMovementLogLoading(false);
    }
  };

  const handleViewStockOutMovements = async () => {
    const today = getLocalDateKey();
    setStockOutFromDate(`${today.slice(0, 7)}-01`);
    setStockOutToDate(today);
    setViewingStockOutMovements(true);
    setStockOutMovements([]);
    setStockOutMovementsError("");
    setStockOutMovementsLoading(true);
    try {
      const currentItemsById = new Map(
        inventoryItems.map((item) => [
          getAmmunitionInventoryId(item.inventoryName || item.name),
          item,
        ])
      );
      const targetBoardInventoryId = getAmmunitionInventoryId(
        targetBoardItem?.inventoryName || "Target Board"
      );
      const movementSources = new Map();
      Object.entries(inventoryNamesById).forEach(([inventoryId, source]) => {
        if (inventoryId === targetBoardInventoryId) return;
        const currentItem = currentItemsById.get(inventoryId);
        movementSources.set(inventoryId, {
          inventoryName: source.inventoryName,
          ammunitionName: currentItem?.name || source.name,
          unit: currentItem?.unit || source.unit,
        });
      });
      inventoryItems.forEach((item) => {
        if (item.targetBoard) return;
        const inventoryName = item.inventoryName || item.name;
        const inventoryId = getAmmunitionInventoryId(inventoryName);
        if (!movementSources.has(inventoryId)) {
          movementSources.set(inventoryId, {
            inventoryName,
            ammunitionName: item.name,
            unit: item.unit,
          });
        }
      });

      const itemMovements = await Promise.all(
        [...movementSources.entries()].map(
          async ([inventoryId, source]) => {
            const movements = await getAmmunitionMovements(
              source.inventoryName
            );
            return movements
              .filter(
                (movement) =>
                  Number(movement.quantityChange) < 0 &&
                  getMovementDateKey(movement.createdAt)
              )
              .map((movement) => ({
                ...movement,
                ammunitionName: source.ammunitionName,
                inventoryName: source.inventoryName,
                ammunitionUnit: source.unit,
                key: `${inventoryId}-${movement.id}`,
              }));
          }
        )
      );
      setStockOutMovements(
        itemMovements
          .flat()
          .sort(
            (first, second) =>
              (second.createdAt?.toMillis?.() || 0) -
              (first.createdAt?.toMillis?.() || 0)
          )
      );
    } catch (movementError) {
      console.error("Error loading ammunition stock-out movements:", movementError);
      setStockOutMovementsError(
        "Unable to load stock-out movements. Please try again."
      );
    } finally {
      setStockOutMovementsLoading(false);
    }
  };

  return (
    <main className="ammunition-management-page">
      {selectedMenuItem && menuPosition &&
        createPortal(
          <div
            className="ammunition-row-menu"
            role="menu"
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => handleStartAddStock(selectedMenuItem)}
            >
              Add stock
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleStartRename(selectedMenuItem)}
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleViewMovements(selectedMenuItem)}
            >
              View log
            </button>
            <button
              className="ammunition-row-menu-remove"
              type="button"
              role="menuitem"
              onClick={() => handleRemoveItem(selectedMenuItem)}
            >
              Remove
            </button>
          </div>,
          document.body
        )}

      <header className="ammunition-management-header">
        <div>
          <p className="ammunition-management-eyebrow">INVENTORY MANAGEMENT</p>
          <h1>Ammunition &amp; Target Board Management</h1>
          <p>
          Enter each stock purchase's total cost to calculate weighted-average
          cost per round or piece. COGS is recorded automatically when bookings
          are completed or ammunition is sold.
          </p>
        </div>
      </header>

      {error && (
        <p className="ammunition-feedback ammunition-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="ammunition-feedback ammunition-success" role="status">
          {success}
        </p>
      )}

      <section
        className="ammunition-daily-summary"
        aria-label="Today's ammunition stock-out"
      >
        <button
          type="button"
          className="ammunition-daily-summary-trigger"
          onClick={handleViewStockOutMovements}
          disabled={loading || stockOutMovementsLoading}
          aria-label="View today's ammunition stock-out movements"
        >
          <div>
            <p className="ammunition-daily-summary-eyebrow">
              {new Date(`${todayDate}T00:00:00`).toLocaleDateString("en-PH", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <h2>Total ammunition units out</h2>
            <p className="ammunition-daily-summary-caption">
              Click to view stock-out history; date filter defaults to this
              month.
            </p>
          </div>
          <div className="ammunition-daily-summary-total" aria-live="polite">
            <strong>
              {loading
                ? "..."
                : movementError
                  ? "—"
                  : dailyStockOutTotal.toLocaleString()}
            </strong>
            <span>
              {movementError ||
                `${dailyStockOutTotal === 1 ? "unit" : "units"} out | ${
                  todayMovements.length
                } ammunition ${
                  todayMovements.length === 1 ? "type" : "types"
                } moved`}
            </span>
          </div>
        </button>
      </section>

      <section className="ammunition-inventory-panel">
        <div className="ammunition-inventory-heading">
          <div>
            <h2>Ammunition stock</h2>
            <p>
              Ammunition is tracked in rounds or pieces; target boards are
              tracked individually.
            </p>
          </div>
          <div className="ammunition-inventory-actions">
            <span>{inventoryItems.length} inventory items</span>
            <button
              className="ammunition-add-item-button"
              type="button"
              aria-expanded={showCreateForm}
              aria-controls="create-ammunition-form"
              onClick={() => {
                setError("");
                setSuccess("");
                setShowCreateForm((current) => !current);
              }}
            >
              Add ammunition item
            </button>
          </div>
        </div>

        {showCreateForm && createPortal(
  <div className="ammunition-modal-overlay">
    <section
      className="ammunition-modal-card"
      role="dialog"
      aria-modal="true"
      aria-label="Add ammunition item"
    >
      <div className="ammunition-modal-header">
        <h2>Add Ammunition Item</h2>

        <button
          type="button"
          className="ammunition-modal-close"
          disabled={creating}
          onClick={() => {
            setShowCreateForm(false);
            setError("");
          }}
          aria-label="Close form"
        >
          ×
        </button>
      </div>

      <form
        id="create-ammunition-form"
        className="ammunition-create-form"
        onSubmit={handleCreateItem}
      >
            <div className="ammunition-create-fields">
              <label>
                Item name
                <input
                  type="text"
                  value={newAmmunitionItem.name}
                  onChange={(event) =>
                    setNewAmmunitionItem((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  maxLength="100"
                  required
                />
              </label>
              <label>
                Unit
                <select
                  value={newAmmunitionItem.unit}
                  onChange={(event) =>
                    setNewAmmunitionItem((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                >
                  {CUSTOM_AMMUNITION_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Price per {newAmmunitionItem.unit}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAmmunitionItem.unitPrice}
                  onChange={(event) =>
                    setNewAmmunitionItem((current) => ({
                      ...current,
                      unitPrice: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Starting stock ({startingStockUnit})
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={newAmmunitionItem.initialStock}
                  onChange={(event) =>
                    setNewAmmunitionItem((current) => ({
                      ...current,
                      initialStock: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Total cost of starting stock (₱)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAmmunitionItem.initialStockCost}
                  onChange={(event) =>
                    setNewAmmunitionItem((current) => ({
                      ...current,
                      initialStockCost: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Cost per {startingStockCostUnit} (automatic)
                <input
                  type="text"
                  readOnly
                  value={
                    Number(newAmmunitionItem.initialStock) > 0
                      ? formatCurrency(
                          Number(newAmmunitionItem.initialStockCost) /
                            Number(newAmmunitionItem.initialStock)
                        )
                      : "—"
                  }
                />
              </label>
            </div>
            <div className="ammunition-create-actions">
              <button
                className="ammunition-create-cancel"
                type="button"
                onClick={() => {
                  setNewAmmunitionItem(EMPTY_AMMUNITION_ITEM);
                  setShowCreateForm(false);
                  setError("");
                }}
                disabled={creating}
              >
                Cancel
              </button>
              <button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create item"}
              </button>
            </div>
                </form>
    </section>
  </div>,
  document.body
)}

        {stockItem && createPortal(
          <div className="ammunition-modal-overlay">
            <section
              className="ammunition-modal-card"
              role="dialog"
              aria-modal="true"
              aria-label={`Add stock for ${stockItem.name}`}
            >
              <div className="ammunition-modal-header">
                <h2>Add stock — {stockItem.name}</h2>
                <button
                  type="button"
                  className="ammunition-modal-close"
                  disabled={Boolean(savingName)}
                  onClick={() => setStockItem(null)}
                  aria-label="Close form"
                >
                  ×
                </button>
              </div>
              <form
                className="ammunition-stock-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleAddStock(stockItem.name, stockItemInventoryName);
                }}
              >
                <label htmlFor="add-stock-quantity">
                  Quantity to add ({stockItemUnit})
                  <input
                    id="add-stock-quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={stockInputs[stockItem.name] || ""}
                    onChange={(event) =>
                      setStockInputs((current) => ({
                        ...current,
                        [stockItem.name]: event.target.value,
                      }))
                    }
                    required
                    disabled={Boolean(savingName)}
                  />
                </label>
                <label htmlFor="add-stock-purchase-cost">
                  Total purchase cost (₱)
                  <input
                    id="add-stock-purchase-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={stockPurchaseCosts[stockItemInventoryName] || ""}
                    onChange={(event) =>
                      setStockPurchaseCosts((current) => ({
                        ...current,
                        [stockItemInventoryName]: event.target.value,
                      }))
                    }
                    required
                    disabled={Boolean(savingName)}
                  />
                </label>
                {stockItemNeedsOpeningCost && (
                  <p className="ammunition-form-error" role="alert">
                    Set the current stock cost in Edit before adding stock.
                  </p>
                )}
                {!stockItemNeedsOpeningCost &&
                  Number(stockInputs[stockItem.name]) > 0 &&
                  stockPurchaseCosts[stockItemInventoryName] !== "" &&
                  stockPurchaseCosts[stockItemInventoryName] != null &&
                  Number.isFinite(
                    Number(stockPurchaseCosts[stockItemInventoryName])
                  ) && (
                    <p className="ammunition-cost-preview">
                      Estimated average cost:{" "}
                      {formatCurrency(
                        (stockItemCurrentStock *
                          (stockItemUnitCost || 0) +
                          Number(stockPurchaseCosts[stockItemInventoryName])) /
                          (stockItemCurrentStock +
                            Number(stockInputs[stockItem.name]))
                      )}{" "}
                      / {stockItemCostUnit}
                    </p>
                  )}
                {error && (
                  <p className="ammunition-form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="ammunition-create-actions">
                  <button
                    className="ammunition-create-cancel"
                    type="button"
                    onClick={() => setStockItem(null)}
                    disabled={Boolean(savingName)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      Boolean(savingName) || stockItemNeedsOpeningCost
                    }
                  >
                    {savingName === stockItem.name ? "Saving..." : "Add stock"}
                  </button>
                </div>
              </form>
            </section>
          </div>,
          document.body
        )}

        {editingItem &&
          createPortal(
            <div className="ammunition-modal-overlay">
              <section
                className="ammunition-modal-card"
                role="dialog"
                aria-modal="true"
                aria-label="Edit ammunition item"
              >
                <div className="ammunition-modal-header">
                  <h2>Edit {editingItem.name}</h2>
                  <button
                    type="button"
                    className="ammunition-modal-close"
                    disabled={itemActionLoading}
                    onClick={() => setEditingItem(null)}
                    aria-label="Close form"
                  >
                    ×
                  </button>
                </div>

                <form
                  className="ammunition-rename-form"
                  onSubmit={handleSaveEdit}
                >
                  <label htmlFor="rename-ammunition-item">
                    Item name
                    <input
                      id="rename-ammunition-item"
                      type="text"
                      value={editingName}
                      onChange={(event) =>
                        setEditingName(event.target.value)
                      }
                      maxLength="100"
                      required
                      disabled={itemActionLoading}
                      autoFocus
                    />
                  </label>
                  <label htmlFor="edit-ammunition-price">
                    Price per {editingItem.unit}
                    <input
                      id="edit-ammunition-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editingPrice}
                      onChange={(event) =>
                        setEditingPrice(event.target.value)
                      }
                      required
                      disabled={itemActionLoading}
                    />
                  </label>
                  {!editingItem.targetBoard && editingCurrentStock > 0 && (
                    <>
                      <label htmlFor="edit-current-stock-cost">
                        Total cost of current stock (₱)
                        <input
                          id="edit-current-stock-cost"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingStockCost}
                          onChange={(event) =>
                            setEditingStockCost(event.target.value)
                          }
                          required
                          disabled={itemActionLoading}
                        />
                      </label>
                      <p className="ammunition-cost-preview">
                        Cost per {editingCostUnit}:{" "}
                        {editingStockCost === "" ||
                        !Number.isFinite(Number(editingStockCost))
                          ? "—"
                          : formatCurrency(
                              Number(editingStockCost) / editingCurrentStock
                            )}
                      </p>
                    </>
                  )}
                  {!editingItem.targetBoard && editingCurrentStock === 0 && (
                    <p className="ammunition-cost-preview">
                      No current stock to value. Enter the purchase cost when
                      adding stock.
                    </p>
                  )}
                  <label htmlFor="edit-stock-out-quantity">
                    Stock-out quantity ({editingStockUnit}; current stock:{" "}
                    {editingCurrentStock})
                    <input
                      id="edit-stock-out-quantity"
                      type="number"
                      min="0"
                      max={editingCurrentStock}
                      step="1"
                      value={editingStockOutAmount}
                      onChange={(event) =>
                        setEditingStockOutAmount(event.target.value)
                      }
                      disabled={itemActionLoading}
                    />
                  </label>
                  <label htmlFor="edit-stock-out-reason">
                    Stock-out reason
                    <textarea
                      id="edit-stock-out-reason"
                      value={stockOutReason}
                      onChange={(event) =>
                        setStockOutReason(event.target.value)
                      }
                      maxLength={300}
                      required={Number(editingStockOutAmount) > 0}
                      disabled={itemActionLoading}
                    />
                  </label>
                  {error && (
                    <p className="ammunition-form-error" role="alert">
                      {error}
                    </p>
                  )}
                  {success && (
                    <p className="ammunition-success" role="status">
                      {success}
                    </p>
                  )}
                  <div className="ammunition-edit-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setEditingPrice("");
                      }}
                      disabled={itemActionLoading}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={itemActionLoading}>
                      {itemActionLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )}

        {viewingStockOutMovements &&
          createPortal(
            <div className="ammunition-modal-overlay">
              <section
                className="ammunition-modal-card ammunition-movement-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Ammunition stock-out movements"
              >
                <div className="ammunition-modal-header">
                  <h2>Ammunition stock-out movements</h2>
                  <button
                    type="button"
                    className="ammunition-modal-close"
                    onClick={() => setViewingStockOutMovements(false)}
                    disabled={stockOutMovementsLoading}
                    aria-label="Close stock-out movements"
                  >
                    ×
                  </button>
                </div>
                <div className="ammunition-stock-out-filters">
                  <label htmlFor="stock-out-from-date">
                    From
                    <input
                      id="stock-out-from-date"
                      type="date"
                      value={stockOutFromDate}
                      max={stockOutToDate || undefined}
                      onChange={(event) =>
                        setStockOutFromDate(event.target.value)
                      }
                    />
                  </label>
                  <label htmlFor="stock-out-to-date">
                    To
                    <input
                      id="stock-out-to-date"
                      type="date"
                      value={stockOutToDate}
                      min={stockOutFromDate || undefined}
                      onChange={(event) =>
                        setStockOutToDate(event.target.value)
                      }
                    />
                  </label>
                </div>
                {!validStockOutDateRange ? (
                  <p className="ammunition-list-message" role="alert">
                    Select a valid date range with the start date on or before
                    the end date.
                  </p>
                ) : stockOutMovementsLoading ? (
                  <p className="ammunition-list-message" role="status">
                    Loading stock-out movements...
                  </p>
                ) : stockOutMovementsError ? (
                  <p className="ammunition-list-message" role="alert">
                    {stockOutMovementsError}
                  </p>
                ) : (
                  <>
                    <p className="ammunition-stock-out-filter-total">
                      {filteredStockOutTotal.toLocaleString()} ammunition{" "}
                      {filteredStockOutTotal === 1 ? "unit" : "units"} out in
                      the selected date range
                    </p>
                    {filteredStockOutMovements.length === 0 ? (
                      <p className="ammunition-list-message">
                        No stock-out movements found in this date range.
                      </p>
                    ) : (
                      <div className="ammunition-movement-table-wrap">
                        <table className="ammunition-movement-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Ammunition</th>
                              <th>Activity</th>
                              <th>Quantity out</th>
                              <th>Reason / reference</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStockOutMovements.map((movement) => (
                              <tr key={movement.key}>
                                <td>
                                  {formatMovementDate(movement.createdAt)}
                                </td>
                                <td>{movement.ammunitionName}</td>
                                <td>
                                  {getStockOutActivityLabel(movement.type)}
                                </td>
                                <td>
                                  {Math.abs(
                                    Number(movement.quantityChange)
                                  )}{" "}
                                  {getAmmunitionUnitLabel(
                                    movement.ammunitionName,
                                    movement.ammunitionUnit
                                      ? [
                                          ...customAmmunitionTypes,
                                          {
                                            name: movement.ammunitionName,
                                            unit: movement.ammunitionUnit,
                                          },
                                        ]
                                      : customAmmunitionTypes,
                                    movement.inventoryName
                                  )}
                                </td>
                                <td>
                                  {movement.reason || "—"}
                                  {movement.referenceId && (
                                    <small>
                                      Ref: {movement.referenceId}
                                    </small>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>,
            document.body
          )}

        {viewingMovementsItem && createPortal(
          <div className="ammunition-modal-overlay">
            <section
              className="ammunition-modal-card ammunition-movement-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Stock movements for ${viewingMovementsItem.name}`}
            >
              <div className="ammunition-modal-header">
                <h2>Stock log — {viewingMovementsItem.name}</h2>
                <button
                  type="button"
                  className="ammunition-modal-close"
                  onClick={() => setViewingMovementsItem(null)}
                  aria-label="Close stock log"
                >
                  ×
                </button>
              </div>
              {movementLogLoading ? (
                <p className="ammunition-list-message" role="status">
                  Loading stock movements...
                </p>
              ) : movementLogError ? (
                <p className="ammunition-form-error" role="alert">
                  {movementLogError}
                </p>
              ) : stockMovements.length === 0 ? (
                <p className="ammunition-list-message">
                  No stock movements recorded yet.
                </p>
              ) : (
                <div className="ammunition-movement-table-wrap">
                  <table className="ammunition-movement-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Movement</th>
                        <th>Quantity</th>
                        <th>Cost / COGS</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovements.map((movement) => {
                        const quantityChange =
                          Number(movement.quantityChange) || 0;
                        const quantityLabel =
                          quantityChange > 0
                            ? `+${quantityChange}`
                            : quantityChange;
                        const cost =
                          movement.totalCost ?? movement.cogsChange;
                        return (
                          <tr key={movement.id}>
                            <td>{formatMovementDate(movement.createdAt)}</td>
                            <td>{getMovementLabel(movement.type)}</td>
                            <td>
                              {quantityChange === 0
                                ? "—"
                                : `${quantityLabel} ${getAmmunitionUnitLabel(
                                    viewingMovementsItem.name,
                                    customAmmunitionTypes,
                                    viewingMovementsItem.inventoryName ||
                                      viewingMovementsItem.name
                                  )}`}
                            </td>
                            <td>
                              {cost == null ? "—" : formatCurrency(cost)}
                            </td>
                            <td>
                              {movement.reason || "—"}
                              {movement.referenceId && (
                                <small>
                                  Ref: {movement.referenceId}
                                </small>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>,
          document.body
        )}

        {loading ? (
          <p className="ammunition-list-message" role="status">
            Loading ammunition stock...
          </p>
        ) : loadError ? (
          <p className="ammunition-list-message" role="alert">
            {loadError}
          </p>
        ) : (
          <div className="ammunition-table-wrap">
            <table className="ammunition-table">
              <thead>
                <tr>
                  <th>Inventory item</th>
                  <th>Price</th>
                  <th>In stock</th>
                  <th>Avg. cost / unit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map((item) => {
                  const inventoryName = item.inventoryName || item.name;
                  const inventoryId = getAmmunitionInventoryId(inventoryName);
                  const unit = getAmmunitionUnitLabel(
                    item.name,
                    customAmmunitionTypes,
                    inventoryName
                  );
                  const costUnit = unit.endsWith("s")
                    ? unit.slice(0, -1)
                    : unit;
                  const currentStock = stockLevels[inventoryId] || 0;
                  const currentUnitCost = inventoryUnitCosts[inventoryId];
                  return (
                    <tr key={item.name}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td className="ammunition-item-price">
                        {formatCurrency(item.unitPrice)} / {item.unit}
                      </td>
                      <td className="ammunition-stock-level">
                        {currentStock} {unit}
                      </td>
                      <td className="ammunition-item-cost">
                        {currentUnitCost == null ||
                        !Number.isFinite(currentUnitCost)
                          ? "Not set"
                          : `${formatCurrency(currentUnitCost)} / ${costUnit}`}
                      </td>
                      <td>
                        {(item.builtIn || item.custom || item.targetBoard) && (
                          <div className="ammunition-row-menu-wrap">
                            <button
                              className="ammunition-row-menu-button"
                              type="button"
                              aria-label={`Actions for ${item.name}`}
                              aria-expanded={openMenuId === inventoryId}
                              aria-haspopup="menu"
                              disabled={itemActionLoading}
                              onClick={(event) => toggleMenu(item, event)}
                            >
                              <span aria-hidden="true">⋮</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
