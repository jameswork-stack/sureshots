import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { RANGE_PACKAGE_CATALOG } from "./rangePackage";

export const AMMUNITION_INVENTORY_COLLECTION = "ammunitionInventory";
export const AMMUNITION_CATEGORY = "Ammunition Prices";
export const CUSTOM_AMMUNITION_UNITS = ["piece", "round", "box of 50"];

const inventoryItems = [
  ...RANGE_PACKAGE_CATALOG[AMMUNITION_CATEGORY],
  ...RANGE_PACKAGE_CATALOG["Range Fee Rates"].filter(
    (item) => item.name === "Target Board"
  ),
];

export const getAmmunitionInventoryId = (ammunitionName) =>
  encodeURIComponent(ammunitionName);

export const getCustomAmmunitionTypes = async () => {
  const snapshot = await getDocs(
    collection(db, AMMUNITION_INVENTORY_COLLECTION)
  );
  const items = snapshot.docs.flatMap((inventoryDoc) => {
    const data = inventoryDoc.data();
    if (data.custom !== true) return [];

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const unitPrice = Number(data.unitPrice);
    if (
      !name ||
      !CUSTOM_AMMUNITION_UNITS.includes(data.unit) ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new Error(`Invalid custom ammunition item in ${inventoryDoc.id}.`);
    }

    return [{ name, unit: data.unit, unitPrice, custom: true }];
  });

  return items.sort((first, second) => first.name.localeCompare(second.name));
};

export const getAmmunitionUnitLabel = (
  ammunitionName,
  customAmmunitionTypes = []
) => {
  const unit = [...inventoryItems, ...customAmmunitionTypes].find(
    (item) => item.name === ammunitionName
  )?.unit;

  if (unit === "box of 50" || unit === "round") return "rounds";
  if (unit === "board") return "boards";
  if (unit === "piece") return "pieces";
  return unit || "pieces";
};

export const createAmmunitionItem = async ({
  name,
  unit,
  unitPrice,
  initialStock,
}) => {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const numericPrice = Number(unitPrice);
  if (!normalizedName) {
    throw new Error("Enter an ammunition item name.");
  }
  if (
    inventoryItems.some(
      (item) => item.name.toLowerCase() === normalizedName.toLowerCase()
    )
  ) {
    throw new Error("An inventory item with this name already exists.");
  }
  if (!CUSTOM_AMMUNITION_UNITS.includes(unit)) {
    throw new Error("Select a valid unit for this ammunition item.");
  }
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new Error("Enter a valid unit price of 0 or more.");
  }
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    throw new Error("Starting stock must be a whole number of 0 or more.");
  }

  const inventoryRef = doc(
    db,
    AMMUNITION_INVENTORY_COLLECTION,
    getAmmunitionInventoryId(normalizedName)
  );

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(inventoryRef);
    if (snapshot.exists()) {
      throw new Error("An inventory item with this name already exists.");
    }

    transaction.set(inventoryRef, {
      name: normalizedName,
      unit,
      unitPrice: numericPrice,
      quantity: initialStock,
      custom: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return initialStock;
  });
};

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
          ? items.map((item) => ({ ...item, category }))
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
    const isCustomAmmunition =
      item.category === AMMUNITION_CATEGORY ||
      item.category === "Ammunition Fee";
    if (!catalogItem && !isCustomAmmunition) return;

    const enteredQuantity = item.quantity == null ? 1 : Number(item.quantity);
    if (!Number.isInteger(enteredQuantity) || enteredQuantity < 1) {
      throw new Error(`Invalid quantity for ${item.name}.`);
    }

    const unit = catalogItem?.unit || item.unit;
    if (!unit) {
      throw new Error(`Missing unit for ammunition item ${item.name}.`);
    }
    const unitsPerQuantity = unit === "box of 50" ? 50 : 1;
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
    const isBuiltIn = inventoryItems.some(
      (item) => item.name === ammunitionName
    );
    if (!isBuiltIn && (!snapshot.exists() || snapshot.data().custom !== true)) {
      throw new Error("Select a valid inventory item.");
    }
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
    const isBuiltIn = inventoryItems.some(
      (item) => item.name === ammunitionName
    );
    if (!isBuiltIn && (!snapshot.exists() || snapshot.data().custom !== true)) {
      throw new Error("Select a valid inventory item.");
    }
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
