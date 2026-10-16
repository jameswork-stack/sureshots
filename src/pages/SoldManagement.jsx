import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { formatDisplayDate } from "../utils/date";
import {
  RANGE_PACKAGE_CATALOG,
  RANGE_PACKAGE_CATEGORY_LABELS,
  RANGE_PACKAGE_QUANTITY_ITEMS,
  getRangePackageContents,
  getRangePackageItemsTotal,
} from "../utils/rangePackage";
import { adjustAmmunitionInventory } from "../utils/ammunitionInventory";
import "../styles/bookingManagement.css";
import "../styles/soldManagement.css";

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

const emptyOtherItem = { details: "", price: "" };

export default function SoldManagement() {
  const [soldItems, setSoldItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [viewingSale, setViewingSale] = useState(null);
  const [printingSale, setPrintingSale] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [soldDate, setSoldDate] = useState(getTodayDate);
  const [soldTo, setSoldTo] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});
  const [quantities, setQuantities] = useState({});
  const [otherItem, setOtherItem] = useState(emptyOtherItem);

  const loadSoldItems = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, "rangeSold"));
      const records = snapshot.docs.map((soldDoc) => ({
        id: soldDoc.id,
        ...soldDoc.data(),
      }));
      records.sort((first, second) => {
        const firstDate = first.soldDate || "";
        const secondDate = second.soldDate || "";
        return secondDate.localeCompare(firstDate);
      });
      setSoldItems(records);
      setError("");
    } catch (loadError) {
      console.error("Error loading sold range items:", loadError);
      setError("Failed to load sold items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSoldItems();
  }, [loadSoldItems]);

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
    if (!printingSale) return undefined;

    const originalTitle = document.title;
    document.title = `Sold Items - ${printingSale.soldTo || printingSale.soldDate}`;

    const handleAfterPrint = () => {
      document.title = originalTitle;
      setPrintingSale(null);
    };

    window.addEventListener("afterprint", handleAfterPrint);
    const printTimeout = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(printTimeout);
      window.removeEventListener("afterprint", handleAfterPrint);
      document.title = originalTitle;
    };
  }, [printingSale]);

  const toggleCategory = (category) => {
    setCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
    if (categories.includes(category)) {
      setSelectedItems((current) => ({ ...current, [category]: [] }));
      setQuantities((current) => ({ ...current, [category]: {} }));
      if (category === "Others") setOtherItem(emptyOtherItem);
    }
    setError("");
  };

  const toggleItem = (category, itemName) => {
    const isSelected = selectedItems[category]?.includes(itemName);
    setSelectedItems((current) => {
      const selected = current[category] || [];
      return {
        ...current,
        [category]: isSelected
          ? selected.filter((name) => name !== itemName)
          : [...selected, itemName],
      };
    });
    if (isSelected) {
      setQuantities((current) => ({
        ...current,
        [category]: { ...current[category], [itemName]: "" },
      }));
    }
    setError("");
  };

  const packageContents = useMemo(
    () => getRangePackageContents(categories, selectedItems, quantities, otherItem),
    [categories, selectedItems, quantities, otherItem]
  );
  const totalAmount = getRangePackageItemsTotal(packageContents);

  const resetForm = () => {
    setEditingSaleId(null);
    setSoldDate(getTodayDate());
    setSoldTo("");
    setCategories([]);
    setSelectedItems({});
    setQuantities({});
    setOtherItem(emptyOtherItem);
    setError("");
    setShowForm(false);
  };

  const openEditForm = (sale) => {
    const contents = Array.isArray(sale.packageContents)
      ? sale.packageContents
      : [];
    const existingItems = Array.isArray(sale.packageItems)
      ? sale.packageItems
      : [];
    const existingCategories = contents.length
      ? contents.map(({ category }) => category)
      : [...new Set(existingItems.map((item) => item.category).filter(Boolean))];
    const nextSelectedItems = {};
    const nextQuantities = {};

    if (contents.length) {
      contents.forEach(({ category, items }) => {
        nextSelectedItems[category] = items.map((item) => item.name);
        nextQuantities[category] = Object.fromEntries(
          items.map((item) => [item.name, item.quantity ? String(item.quantity) : ""])
        );
      });
    } else {
      existingItems.forEach((item) => {
        nextSelectedItems[item.category] = [
          ...(nextSelectedItems[item.category] || []),
          item.name,
        ];
        nextQuantities[item.category] = {
          ...nextQuantities[item.category],
          [item.name]: item.quantity ? String(item.quantity) : "",
        };
      });
    }

    const other = contents.find(({ category }) => category === "Others")
      ?.items?.[0] ||
      existingItems.find((item) => item.category === "Others");

    setEditingSaleId(sale.id);
    setSoldDate(sale.soldDate || getTodayDate());
    setSoldTo(sale.soldTo || "");
    setCategories(existingCategories);
    setSelectedItems(nextSelectedItems);
    setQuantities(nextQuantities);
    setOtherItem({
      details: other?.details || other?.name || "",
      price: other?.unitPrice == null ? "" : String(other.unitPrice),
    });
    setOpenMenuId(null);
    setMenuPosition(null);
    setError("");
    setShowForm(true);
  };

  const closeActionMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!soldDate) {
      setError("Select the sale date.");
      return;
    }
    if (
      categories.includes("Others") &&
      (!otherItem.details.trim() ||
        otherItem.price === "" ||
        !Number.isFinite(Number(otherItem.price)) ||
        Number(otherItem.price) < 0)
    ) {
      setError("Enter a description and a valid price for Others.");
      return;
    }
    if (!categories.length || !packageContents.length) {
      setError("Select at least one Range Package item.");
      return;
    }
    const quantityMissing = packageContents.some(({ items }) =>
      items.some(
        (item) =>
          "quantity" in item &&
          (!Number.isInteger(item.quantity) || item.quantity < 1)
      )
    );
    if (quantityMissing) {
      setError("Enter a whole-number quantity of at least 1 for each selected item that requires a quantity.");
      return;
    }

    try {
      setSaving(true);
      const saleData = {
        packageCategory: "Range Package",
        packageCategories: packageContents.map(({ category }) => category),
        packageContents,
        packageItems: [],
        soldDate,
        soldTo: soldTo.trim(),
        totalAmount,
        updatedAt: serverTimestamp(),
      };
      const saleRef = editingSaleId
        ? doc(db, "rangeSold", editingSaleId)
        : doc(collection(db, "rangeSold"));

      await runTransaction(db, async (transaction) => {
        const saleSnapshot = editingSaleId
          ? await transaction.get(saleRef)
          : null;
        if (saleSnapshot && !saleSnapshot.exists()) {
          throw new Error("This sold items record could not be found.");
        }

        const currentSale = saleSnapshot?.data() || null;
        const inventoryStockOut = await adjustAmmunitionInventory(
          transaction,
          currentSale,
          saleData
        );
        const nextSaleData = { ...saleData, inventoryStockOut };

        if (editingSaleId) {
          transaction.update(saleRef, nextSaleData);
        } else {
          transaction.set(saleRef, {
            ...nextSaleData,
            createdAt: serverTimestamp(),
          });
        }
      });
      resetForm();
      await loadSoldItems();
    } catch (saveError) {
      console.error("Error saving sold range items:", saveError);
      setError(
        saveError instanceof Error
          ? `Failed to save sold items. ${saveError.message}`
          : "Failed to save sold items. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sale) => {
    closeActionMenu();
    if (!window.confirm("Are you sure you want to delete this sold items record?")) {
      return;
    }
    try {
      const saleRef = doc(db, "rangeSold", sale.id);
      await runTransaction(db, async (transaction) => {
        const saleSnapshot = await transaction.get(saleRef);
        if (!saleSnapshot.exists()) {
          throw new Error("This sold items record could not be found.");
        }

        const currentSale = saleSnapshot.data();
        await adjustAmmunitionInventory(
          transaction,
          currentSale,
          { ...currentSale, packageContents: [], packageItems: [] }
        );
        transaction.delete(saleRef);
      });
      await loadSoldItems();
    } catch (deleteError) {
      console.error("Error deleting sold range items:", deleteError);
      setError(
        deleteError instanceof Error
          ? `Failed to delete this sold items record. ${deleteError.message}`
          : "Failed to delete this sold items record."
      );
    }
  };

  const selectedSale = soldItems.find((sale) => sale.id === openMenuId);

  const getSaleContents = (sale) => {
    if (Array.isArray(sale.packageContents) && sale.packageContents.length) {
      return sale.packageContents;
    }
    const items = Array.isArray(sale.packageItems) ? sale.packageItems : [];
    return Object.entries(
      items.reduce((groups, item) => {
        const category = item.category || "Others";
        groups[category] = [...(groups[category] || []), item];
        return groups;
      }, {})
    ).map(([category, categoryItems]) => ({ category, items: categoryItems }));
  };

  const getSaleTotal = (sale) =>
    sale.totalAmount != null && Number.isFinite(Number(sale.totalAmount))
      ? Number(sale.totalAmount)
      : getRangePackageItemsTotal(getSaleContents(sale));

  return (
    <div className="sold-management-page">
      <header className="sold-management-header">
        <div>
          <h1>Sold Management</h1>
          <p>Record and review Range Package items sold.</p>
        </div>
        <button
          className="sold-add-button"
          type="button"
          onClick={() => {
            setError("");
            setShowForm(true);
          }}
        >
          + Add Sold Items
        </button>
      </header>

      {error && !showForm && <p className="sold-page-error" role="alert">{error}</p>}

      <section className="sold-list">
        <div className="sold-list-header">
          <h2>Range Package Sales</h2>
          <span>{soldItems.length} records</span>
        </div>
        {loading ? (
          <p className="sold-list-message" role="status">Loading sold items…</p>
        ) : soldItems.length === 0 ? (
          <p className="sold-list-message">No sold items recorded yet.</p>
        ) : (
          <div className="sold-table-wrap">
            <table className="sold-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sold To</th>
                  <th>Total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {soldItems.map((sale) => {
                  return (
                    <tr key={sale.id}>
                      <td>{formatDisplayDate(sale.soldDate)}</td>
                      <td>{sale.soldTo || "Walk-in sale"}</td>
                      <td>{formatCurrency(getSaleTotal(sale))}</td>
                      <td className="booking-action-cell">
                        <button
                          className="three-dot-btn"
                          type="button"
                          aria-label={`Actions for sale to ${sale.soldTo || "walk-in customer"}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === sale.id}
                          onClick={(event) => {
                            if (openMenuId === sale.id) {
                              closeActionMenu();
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            const menuWidth = 200;
                            const menuHeight = 190;
                            const top =
                              rect.bottom + menuHeight + 8 > window.innerHeight
                                ? rect.top - menuHeight - 4
                                : rect.bottom + 4;
                            setMenuPosition({
                              top: Math.max(
                                8,
                                Math.min(top, window.innerHeight - menuHeight - 8)
                              ),
                              left: Math.max(
                                8,
                                Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
                              ),
                            });
                            setOpenMenuId(sale.id);
                          }}
                        >
                          ⋮
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedSale && menuPosition &&
        createPortal(
          <div
            className="booking-menu"
            role="menu"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setViewingSale(selectedSale);
                closeActionMenu();
              }}
            >
              View
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openEditForm(selectedSale)}
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPrintingSale(selectedSale);
                closeActionMenu();
              }}
            >
              Print / Save as PDF
            </button>
            <button
              className="delete-menu-item"
              type="button"
              role="menuitem"
              onClick={() => handleDelete(selectedSale)}
            >
              Delete
            </button>
          </div>,
          document.body
        )}

      {viewingSale && (
        <div className="sold-overlay" onClick={() => setViewingSale(null)}>
          <section
            className="sold-form-card sold-view-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sold-view-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sold-form-header">
              <div>
                <h2 id="sold-view-title">Sold Items Details</h2>
                <p>Range Package sale record</p>
              </div>
              <button
                className="sold-close-button"
                type="button"
                onClick={() => setViewingSale(null)}
                aria-label="Close details"
              >
                ×
              </button>
            </header>
            <dl className="sold-detail-grid">
              <div><dt>Sale Date</dt><dd>{formatDisplayDate(viewingSale.soldDate)}</dd></div>
              <div><dt>Sold To</dt><dd>{viewingSale.soldTo || "Walk-in sale"}</dd></div>
              <div><dt>Total</dt><dd>{formatCurrency(getSaleTotal(viewingSale))}</dd></div>
            </dl>
            <h3>Range Package Items</h3>
            <div className="sold-detail-categories">
              {getSaleContents(viewingSale).map(({ category, items }) => (
                <section key={category}>
                  <h4>{RANGE_PACKAGE_CATEGORY_LABELS[category] || category}</h4>
                  <ul>
                    {items.map((item, index) => {
                      const quantity = "quantity" in item ? Number(item.quantity) : 1;
                      const itemTotal = Number(item.unitPrice) * quantity;
                      return (
                        <li key={`${item.name}-${index}`}>
                          <span>
                            {item.name}
                            {"quantity" in item && ` · Qty ${quantity} ${item.unit}`}
                          </span>
                          <strong>{formatCurrency(itemTotal)}</strong>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            <div className="sold-total">
              <span>Total</span>
              <strong>{formatCurrency(getSaleTotal(viewingSale))}</strong>
            </div>
            <div className="sold-form-actions">
              <button
                className="sold-cancel-button"
                type="button"
                onClick={() => setViewingSale(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <div className="sold-overlay">
          <section
            className="sold-form-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sold-form-title"
          >
            <header className="sold-form-header">
              <div>
                <h2 id="sold-form-title">{editingSaleId ? "Edit Sold Items" : "Add Sold Items"}</h2>
                <p>Select the sold items and quantities.</p>
              </div>
              <button
                className="sold-close-button"
                type="button"
                onClick={resetForm}
                aria-label="Close form"
                disabled={saving}
              >
                ×
              </button>
            </header>
            <form onSubmit={handleSubmit}>
              <div className="sold-form-fields">
                <label>
                  Sale Date
                  <input
                    type="date"
                    value={soldDate}
                    onChange={(event) => setSoldDate(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Sold To <span>(optional)</span>
                  <input
                    type="text"
                    value={soldTo}
                    onChange={(event) => setSoldTo(event.target.value)}
                    placeholder="Customer name"
                  />
                </label>
              </div>

              <section className="range-package-builder">
                <div className="range-package-heading">
                  <h3>Range Package</h3>
                  <p>Select a category and the items sold.</p>
                </div>
                <div className="range-package-category-options">
                  {Object.keys(RANGE_PACKAGE_CATALOG).map((category) => (
                    <label
                      className={`range-package-category-option ${
                        categories.includes(category) ? "selected" : ""
                      }`}
                      key={category}
                    >
                      <input
                        type="checkbox"
                        checked={categories.includes(category)}
                        onChange={() => toggleCategory(category)}
                      />
                      <span>{RANGE_PACKAGE_CATEGORY_LABELS[category]}</span>
                    </label>
                  ))}
                </div>
                {categories.map((category) => (
                  <div className="range-package-category-content" key={category}>
                    <h4>{RANGE_PACKAGE_CATEGORY_LABELS[category]}</h4>
                    {category === "Others" ? (
                      <div className="range-package-other-fields">
                        <label>
                          Item details
                          <input
                            type="text"
                            value={otherItem.details}
                            onChange={(event) =>
                              setOtherItem((current) => ({
                                ...current,
                                details: event.target.value,
                              }))
                            }
                            placeholder="Enter item details"
                          />
                        </label>
                        <label>
                          Price
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={otherItem.price}
                            onChange={(event) =>
                              setOtherItem((current) => ({
                                ...current,
                                price: event.target.value,
                              }))
                            }
                            placeholder="Enter price"
                          />
                        </label>
                      </div>
                    ) : (
                      <ul>
                        {RANGE_PACKAGE_CATALOG[category].map((item) => (
                          <li key={item.name}>
                            <label className="range-package-item-option">
                              <input
                                type="checkbox"
                                checked={selectedItems[category]?.includes(item.name) || false}
                                onChange={() => toggleItem(category, item.name)}
                              />
                              <span>{item.name}</span>
                            </label>
                            <strong>
                              {item.pricing === "corkage-flat"
                                ? `${formatCurrency(item.unitPrice)} flat rate`
                                : `${formatCurrency(item.unitPrice)} per ${item.unit}`}
                            </strong>
                            {RANGE_PACKAGE_QUANTITY_ITEMS[category]?.includes(item.name) &&
                              selectedItems[category]?.includes(item.name) && (
                                <label className="range-package-quantity">
                                  Quantity
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={quantities[category]?.[item.name] || ""}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setQuantities((current) => ({
                                        ...current,
                                        [category]: {
                                          ...current[category],
                                          [item.name]: value,
                                        },
                                      }));
                                    }}
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

              {error && <p className="sold-form-error" role="alert">{error}</p>}
              <div className="sold-total">
                <span>Items total</span>
                <strong>{formatCurrency(totalAmount)}</strong>
              </div>
              <div className="sold-form-actions">
                <button
                  className="sold-cancel-button"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="sold-save-button" type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingSaleId ? "Save Changes" : "Save Sold Items"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {printingSale && (
        <article className="sold-print-sheet" aria-hidden="true">
          <header>
            <p>SURESHOTS · RANGE PACKAGE SALE</p>
            <h1>Sold Items Record</h1>
          </header>
          <dl className="sold-print-details">
            <div><dt>Sale Date</dt><dd>{formatDisplayDate(printingSale.soldDate)}</dd></div>
            <div><dt>Sold To</dt><dd>{printingSale.soldTo || "Walk-in sale"}</dd></div>
          </dl>
          {getSaleContents(printingSale).map(({ category, items }) => (
            <section key={category}>
              <h2>{RANGE_PACKAGE_CATEGORY_LABELS[category] || category}</h2>
              <ul>
                {items.map((item, index) => {
                  const quantity = "quantity" in item ? Number(item.quantity) : 1;
                  return (
                    <li key={`${item.name}-${index}`}>
                      <span>
                        {item.name}
                        {"quantity" in item && ` · ${quantity} ${item.unit}`}
                      </span>
                      <strong>{formatCurrency(Number(item.unitPrice) * quantity)}</strong>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <footer>
            <span>Total</span>
            <strong>{formatCurrency(getSaleTotal(printingSale))}</strong>
          </footer>
        </article>
      )}
    </div>
  );
}