import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { RANGE_PACKAGE_CATALOG } from "./rangePackage";

export const AMMUNITION_INVENTORY_COLLECTION = "ammunitionInventory";
export const AMMUNITION_CATEGORY = "Ammunition Prices";

const inventoryItems = [
  ...RANGE_PACKAGE_CATALOG[AMMUNITION_CATEGORY],
  ...RANGE_PACKAGE_CATALOG["Range Fee Rates"].filter(
    (item) => item.name === "Target Board"
  ),
];

export const getAmmunitionInventoryId = (ammunitionName) =>
  encodeURIComponent(ammunitionName);

export const getAmmunitionUnitLabel = (ammunitionName) =>
  inventoryItems.find((item) => item.name === ammunitionName)?.unit ===
  "box of 50"
    ? "rounds"
    : inventoryItems.find((item) => item.name === ammunitionName)?.unit ===
      "board"
    ? "boards"
    : "pieces";

const getInventoryQuantity = (record) => {
  if (!record || typeof record !== "object") return {};
  return record.inventoryStockOut &&
    typeof record.inventoryStockOut === "object" &&
    !Array.isArray(record.inventoryStockOut)
    ? record.inventoryStockOut
    : {};
};

const getPackageItems = (record) => {
  const contentItems = Array.isArray(record?.packageContents)
    ? record.packageContents.flatMap(({ category, items }) =>
        (category === AMMUNITION_CATEGORY ||
          category === "Ammunition Fee" ||
          category === "Range Fee Rates") &&
        Array.isArray(items)
          ? items
          : []
      )
    : [];
  if (contentItems.length > 0) {
    return contentItems;
  }

  return Array.isArray(record?.packageItems)
    ? record.packageItems.filter(
        (item) =>
          item.category === AMMUNITION_CATEGORY ||
          item.category === "Ammunition Fee" ||
          item.category === "Range Fee Rates"
      )
    : [];
};

export const getAmmunitionQuantities = (record) => {
  const quantities = {};

  getPackageItems(record).forEach((item) => {
    const catalogItem = inventoryItems.find(
      (inventoryItem) => inventoryItem.name === item.name
    );
    if (!catalogItem) return;

    const enteredQuantity = item.quantity == null ? 1 : Number(item.quantity);
    if (!Number.isInteger(enteredQuantity) || enteredQuantity < 1) {
      throw new Error(`Invalid quantity for ${item.name}.`);
    }

    const unitsPerQuantity = catalogItem.unit === "box of 50" ? 50 : 1;
    quantities[item.name] =
      (quantities[item.name] || 0) + enteredQuantity * unitsPerQuantity;
  });

  return quantities;
};

export const adjustAmmunitionInventory = async (
  transaction,
  currentRecord,
  nextRecord
) => {
  const previousQuantities = getInventoryQuantity(currentRecord);
  const nextQuantities = getAmmunitionQuantities(nextRecord);
  const ammunitionNames = [
    ...new Set([
      ...Object.keys(previousQuantities),
      ...Object.keys(nextQuantities),
    ]),
  ];
  const inventoryRefs = ammunitionNames.map((name) =>
    doc(
      db,
      AMMUNITION_INVENTORY_COLLECTION,
      getAmmunitionInventoryId(name)
    )
  );
  const inventorySnapshots = await Promise.all(
    inventoryRefs.map((inventoryRef) => transaction.get(inventoryRef))
  );

  inventorySnapshots.forEach((snapshot, index) => {
    const name = ammunitionNames[index];
    const previous = Number(previousQuantities[name] || 0);
    const next = Number(nextQuantities[name] || 0);
    const change = next - previous;
    if (!Number.isInteger(previous) || previous < 0) {
      throw new Error(`Invalid recorded stock usage for ${name}.`);
    }
    if (change === 0) return;

    const currentStock = snapshot.exists()
      ? Number(snapshot.data().quantity)
      : 0;
    if (!Number.isInteger(currentStock) || currentStock < 0) {
      throw new Error(`Invalid inventory quantity for ${name}.`);
    }
    if (change > currentStock) {
      throw new Error(
        `Not enough stock for ${name}. Available: ${currentStock}; needed: ${change}.`
      );
    }

    transaction.set(
      inventoryRefs[index],
      {
        name,
        quantity: currentStock - change,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  return nextQuantities;
};

export const addAmmunitionStock = async (ammunitionName, amount) => {
  if (!inventoryItems.some((item) => item.name === ammunitionName)) {
    throw new Error("Select a valid inventory item.");
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("Stock quantity must be a whole number of at least 1.");
  }

  const inventoryRef = doc(
    db,
    AMMUNITION_INVENTORY_COLLECTION,
    getAmmunitionInventoryId(ammunitionName)
  );

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(inventoryRef);
    const currentStock = snapshot.exists()
      ? Number(snapshot.data().quantity)
      : 0;
    if (!Number.isInteger(currentStock) || currentStock < 0) {
      throw new Error(`Invalid inventory quantity for ${ammunitionName}.`);
    }

    transaction.set(
      inventoryRef,
      {
        name: ammunitionName,
        quantity: currentStock + amount,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return currentStock + amount;
  });
};

export const removeAmmunitionStock = async (ammunitionName, amount) => {
  if (!inventoryItems.some((item) => item.name === ammunitionName)) {
    throw new Error("Select a valid inventory item.");
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("Stock-out quantity must be a whole number of at least 1.");
  }

  const inventoryRef = doc(
    db,
    AMMUNITION_INVENTORY_COLLECTION,
    getAmmunitionInventoryId(ammunitionName)
  );

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(inventoryRef);
    const currentStock = snapshot.exists()
      ? Number(snapshot.data().quantity)
      : 0;
    if (!Number.isInteger(currentStock) || currentStock < 0) {
      throw new Error(`Invalid inventory quantity for ${ammunitionName}.`);
    }
    if (amount > currentStock) {
      throw new Error(
        `Not enough stock for ${ammunitionName}. Available: ${currentStock}; requested: ${amount}.`
      );
    }

    const updatedStock = currentStock - amount;
    transaction.set(
      inventoryRef,
      {
        name: ammunitionName,
        quantity: updatedStock,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return updatedStock;
  });
};
