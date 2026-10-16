import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { db } from "../firebase";
import {
  addAmmunitionStock,
  AMMUNITION_INVENTORY_COLLECTION,
  getAmmunitionInventoryId,
  getAmmunitionUnitLabel,
  removeAmmunitionStock,
} from "../utils/ammunitionInventory";
import { RANGE_PACKAGE_CATALOG } from "../utils/rangePackage";
import "../styles/ammunitionManagement.css";

const ammunitionTypes = RANGE_PACKAGE_CATALOG["Ammunition Prices"];
const targetBoardItem = RANGE_PACKAGE_CATALOG["Range Fee Rates"].find(
  (item) => item.name === "Target Board"
);
const inventoryItems = [...ammunitionTypes, targetBoardItem];

export default function AmmunitionManagement() {
  const [stockLevels, setStockLevels] = useState({});
  const [stockInputs, setStockInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, AMMUNITION_INVENTORY_COLLECTION),
      (snapshot) => {
        const records = {};
        try {
          snapshot.docs.forEach((inventoryDoc) => {
            const quantity = Number(inventoryDoc.data().quantity);
            if (!Number.isInteger(quantity) || quantity < 0) {
              throw new Error(
                `Invalid stock quantity for ${inventoryDoc.data().name || inventoryDoc.id}.`
              );
            }
            records[inventoryDoc.id] = quantity;
          });
          setStockLevels(records);
          setLoadError("");
        } catch (loadError) {
          console.error("Error reading ammunition inventory:", loadError);
          setLoadError("Unable to read ammunition stock. Please try again.");
        } finally {
          setLoading(false);
        }
      },
      (loadError) => {
        console.error("Error loading ammunition inventory:", loadError);
        setLoadError("Unable to load ammunition stock. Please try again.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const handleAddStock = async (ammunitionName) => {
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
      const updatedStock = await addAmmunitionStock(ammunitionName, amount);
      const inventoryId = getAmmunitionInventoryId(ammunitionName);
      setStockLevels((current) => ({
        ...current,
        [inventoryId]: updatedStock,
      }));
      setStockInputs((current) => ({ ...current, [ammunitionName]: "" }));
      setSuccess(
        `Added ${amount} ${getAmmunitionUnitLabel(ammunitionName)} for ${ammunitionName}.`
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

  const handleStockOut = async (ammunitionName) => {
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
      const updatedStock = await removeAmmunitionStock(ammunitionName, amount);
      const inventoryId = getAmmunitionInventoryId(ammunitionName);
      setStockLevels((current) => ({
        ...current,
        [inventoryId]: updatedStock,
      }));
      setStockInputs((current) => ({ ...current, [ammunitionName]: "" }));
      setSuccess(
        `Stocked out ${amount} ${getAmmunitionUnitLabel(ammunitionName)} for ${ammunitionName}.`
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

      <section className="ammunition-inventory-panel">
        <div className="ammunition-inventory-heading">
          <div>
            <h2>Ammunition stock</h2>
            <p>
              Ammunition is tracked in rounds or pieces; target boards are
              tracked individually.
            </p>
          </div>
          <span>{inventoryItems.length} inventory items</span>
        </div>

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
                  <th>In stock</th>
                  <th>Stock actions</th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map((item) => {
                  const inventoryId = getAmmunitionInventoryId(item.name);
                  const unit = getAmmunitionUnitLabel(item.name);
                  const isSaving = savingName === item.name;
                  return (
                    <tr key={item.name}>
                      <td>
                        <strong>{item.name}</strong>
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
                            onClick={() => handleAddStock(item.name)}
                            disabled={Boolean(savingName)}
                          >
                            {isSaving ? "Saving..." : "Add stock"}
                          </button>
                          <button
                            className="ammunition-stock-out-button"
                            type="button"
                            onClick={() => handleStockOut(item.name)}
                            disabled={Boolean(savingName)}
                          >
                            {isSaving ? "Saving..." : "Stock out"}
                          </button>
                        </div>
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
