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
  getAmmunitionTypes,
  getAmmunitionUnitLabel,
  getTargetBoardItem,
  removeAmmunitionItem,
  removeAmmunitionStock,
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
};
const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(amount) || 0);

export default function AmmunitionManagement() {
  const [stockLevels, setStockLevels] = useState({});
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
  const [editingName, setEditingName] = useState("");
  const [editingPrice, setEditingPrice] = useState("");
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
  const todayMovements = Object.values(dailyStockOutByItem).filter(
    (movement) => movement.date === todayDate && movement.quantity > 0
  );
  const dailyStockOutTotal = todayMovements.reduce(
    (total, movement) => total + movement.quantity,
    0
  );

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
    const menuHeight = 82;
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

  const handleCreateItem = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const name = newAmmunitionItem.name.trim();
    const unitPrice = Number(newAmmunitionItem.unitPrice);
    const initialStock = Number(newAmmunitionItem.initialStock);
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
    setEditingItem(item);
    setEditingName(item.name);
    setEditingPrice(String(item.unitPrice ?? ""));
    setError("");
    setSuccess("");
  };

  const handleRenameItem = async (event) => {
    event.preventDefault();
    if (!editingItem) return;

    setError("");
    setSuccess("");
    setItemActionLoading(true);
    const unitPrice = Number(editingPrice);
    try {
      await updateAmmunitionItem(editingItem, editingName, editingPrice);
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
      setSuccess(`Updated ${editingName.trim()}.`);
      setEditingItem(null);
      setEditingName("");
      setEditingPrice("");
    } catch (renameError) {
      console.error("Error renaming ammunition item:", renameError);
      setError(
        renameError instanceof Error
          ? `Unable to rename ammunition item. ${renameError.message}`
          : "Unable to rename ammunition item. Please try again."
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
    if (!input.trim() || !Number.isInteger(amount) || amount < 1) {
      setError("Enter a whole-number stock quantity of at least 1.");
      return;
    }

    setSavingName(ammunitionName);
    try {
      const updatedStock = await addAmmunitionStock(
        ammunitionName,
        amount,
        inventoryName
      );
      const inventoryId = getAmmunitionInventoryId(inventoryName);
      setStockLevels((current) => ({
        ...current,
        [inventoryId]: updatedStock,
      }));
      setStockInputs((current) => ({ ...current, [ammunitionName]: "" }));
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

  const handleStockOut = async (
    ammunitionName,
    inventoryName = ammunitionName
  ) => {
    setError("");
    setSuccess("");
    const input = stockInputs[ammunitionName] || "";
    const amount = Number(input);
    if (!input.trim() || !Number.isInteger(amount) || amount < 1) {
      setError("Enter a whole-number stock-out quantity of at least 1.");
      return;
    }

    setSavingName(ammunitionName);
    try {
      const updatedStock = await removeAmmunitionStock(
        ammunitionName,
        amount,
        inventoryName
      );
      const inventoryId = getAmmunitionInventoryId(inventoryName);
      setStockLevels((current) => ({
        ...current,
        [inventoryId]: updatedStock,
      }));
      setStockInputs((current) => ({ ...current, [ammunitionName]: "" }));
      setSuccess(
        `Stocked out ${amount} ${getAmmunitionUnitLabel(
          ammunitionName,
          customAmmunitionTypes,
          inventoryName
        )} for ${ammunitionName}.`
      );
    } catch (stockOutError) {
      console.error("Error stocking out ammunition:", stockOutError);
      setError(
        stockOutError instanceof Error
          ? `Unable to stock out ammunition. ${stockOutError.message}`
          : "Unable to stock out ammunition. Please try again."
      );
    } finally {
      setSavingName("");
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
              onClick={() => handleStartRename(selectedMenuItem)}
            >
              Edit
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
          Add or stock out ammunition and target boards. Stock is also
          deducted automatically when bookings are completed or items are
          sold.
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
            Today's total resets automatically tomorrow.
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

        {showCreateForm && (
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
        )}

        {editingItem && (
          <form
            className="ammunition-rename-form"
            onSubmit={handleRenameItem}
          >
            <label htmlFor="rename-ammunition-item">
              Item name
              <input
                id="rename-ammunition-item"
                type="text"
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
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
                onChange={(event) => setEditingPrice(event.target.value)}
                required
                disabled={itemActionLoading}
              />
            </label>
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
              {itemActionLoading ? "Saving..." : "Save changes"}
            </button>
          </form>
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
                  <th>Stock actions</th>
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
                  const isSaving = savingName === item.name;
                  return (
                    <tr key={item.name}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td className="ammunition-item-price">
                        {formatCurrency(item.unitPrice)} / {item.unit}
                      </td>
                      <td className="ammunition-stock-level">
                        {stockLevels[inventoryId] || 0} {unit}
                      </td>
                      <td>
                        <div className="ammunition-add-stock">
                          <label
                            className="visually-hidden"
                            htmlFor={`stock-${inventoryId}`}
                          >
                            Quantity of {unit} to add or stock out for {item.name}
                          </label>
                          <input
                            id={`stock-${inventoryId}`}
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={stockInputs[item.name] || ""}
                            onChange={(event) => {
                              const { value } = event.target;
                              setStockInputs((current) => ({
                                ...current,
                                [item.name]: value,
                              }));
                            }}
                            placeholder={`Qty in ${unit}`}
                            disabled={Boolean(savingName)}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleAddStock(item.name, inventoryName)
                            }
                            disabled={Boolean(savingName)}
                          >
                            {isSaving ? "Saving..." : "Add stock"}
                          </button>
                          <button
                            className="ammunition-stock-out-button"
                            type="button"
                            onClick={() =>
                              handleStockOut(item.name, inventoryName)
                            }
                            disabled={Boolean(savingName)}
                          >
                            {isSaving ? "Saving..." : "Stock out"}
                          </button>
                        </div>
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
