import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase";
import {
  RANGE_PACKAGE_CATALOG,
  normalizeAmmunitionName,
} from "./rangePackage";

export const AMMUNITION_INVENTORY_COLLECTION = "ammunitionInventory";
export const AMMUNITION_CATALOG_COLLECTION = "ammunitionCatalog";
export const AMMUNITION_CATEGORY = "Ammunition Prices";
export const CUSTOM_AMMUNITION_UNITS = ["piece", "round", "box of 50"];
const TARGET_BOARD_NAME = "Target Board";

const inventoryItems = [
  ...RANGE_PACKAGE_CATALOG[AMMUNITION_CATEGORY],
  ...RANGE_PACKAGE_CATALOG["Range Fee Rates"].filter(
    (item) => item.name === "Target Board"
  ),
];

export const getAmmunitionInventoryId = (ammunitionName) =>
  encodeURIComponent(normalizeAmmunitionName(ammunitionName));

export const syncLegacyAmmunitionNames = async () => {
  const snapshot = await getDocs(collection(db, AMMUNITION_INVENTORY_COLLECTION));

  for (const inventoryDoc of snapshot.docs) {
    const data = inventoryDoc.data();
    const originalName = typeof data.name === "string" ? data.name.trim() : "";
    if (!originalName || normalizeAmmunitionName(originalName) === originalName) {
      continue;
    }

    const normalizedName = normalizeAmmunitionName(originalName);
    const normalizedId = getAmmunitionInventoryId(normalizedName);
    const normalizedRef = doc(db, AMMUNITION_INVENTORY_COLLECTION, normalizedId);

    await runTransaction(db, async (transaction) => {
      const legacySnapshot = await transaction.get(inventoryDoc.ref);
      const targetSnapshot = await transaction.get(normalizedRef);

      if (!legacySnapshot.exists()) return;

      const legacyData = legacySnapshot.data();
      const targetData = targetSnapshot.exists() ? targetSnapshot.data() : {};
      const mergedQuantity =
        (Number(targetData.quantity) || 0) + (Number(legacyData.quantity) || 0);

      transaction.set(
        normalizedRef,
        {
          ...targetData,
          name: normalizedName,
          quantity: mergedQuantity,
          unit: targetData.unit ?? legacyData.unit,
          unitPrice: targetData.unitPrice ?? legacyData.unitPrice,
          custom: targetData.custom ?? legacyData.custom,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (inventoryDoc.id !== normalizedId) {
        transaction.delete(inventoryDoc.ref);
      }
    });
  }
};

export const getCustomAmmunitionTypes = async () => {
  const snapshot = await getDocs(
    collection(db, AMMUNITION_INVENTORY_COLLECTION)
  );
  const items = snapshot.docs.flatMap((inventoryDoc) => {
    const data = inventoryDoc.data();
    if (data.custom !== true) return [];

    if (data.active === false) return [];
    const name = normalizeAmmunitionName(
      typeof data.name === "string" ? data.name.trim() : ""
    );
    const unitPrice = Number(data.unitPrice);
    if (
      !name ||
      !CUSTOM_AMMUNITION_UNITS.includes(data.unit) ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new Error(`Invalid custom ammunition item in ${inventoryDoc.id}.`);
    }

    return [{
      name,
      inventoryName: decodeURIComponent(inventoryDoc.id),
      unit: data.unit,
      unitPrice,
      custom: true,
    }];
  });

  return items.sort((first, second) => first.name.localeCompare(second.name));
};

export const getAmmunitionTypes = async () => {
  const [catalogSnapshot, inventorySnapshot] = await Promise.all([
    getDocs(collection(db, AMMUNITION_CATALOG_COLLECTION)),
    getDocs(collection(db, AMMUNITION_INVENTORY_COLLECTION)),
  ]);
  const catalogOverrides = new Map(
    catalogSnapshot.docs.map((catalogDoc) => [
      catalogDoc.id,
      catalogDoc.data(),
    ])
  );
  const builtInItems = RANGE_PACKAGE_CATALOG[AMMUNITION_CATEGORY].flatMap(
    (item) => {
      const catalogId = getAmmunitionInventoryId(item.name);
      const override = catalogOverrides.get(catalogId);
      if (override?.active === false) return [];
      const unitPrice =
        override?.unitPrice == null ? item.unitPrice : Number(override.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Invalid price for ammunition item ${item.name}.`);
      }
      return [{
        ...item,
        name: typeof override?.name === "string" ? override.name : item.name,
        unitPrice,
        inventoryName: item.name,
        catalogId,
        builtIn: true,
      }];
    }
  );
  const customItems = inventorySnapshot.docs.flatMap((inventoryDoc) => {
    const data = inventoryDoc.data();
    if (data.custom !== true || data.active === false) return [];

    const name = normalizeAmmunitionName(
      typeof data.name === "string" ? data.name.trim() : ""
    );
    const unitPrice = Number(data.unitPrice);
    if (
      !name ||
      !CUSTOM_AMMUNITION_UNITS.includes(data.unit) ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      throw new Error(`Invalid custom ammunition item in ${inventoryDoc.id}.`);
    }

    return [{
      name,
      inventoryName: decodeURIComponent(inventoryDoc.id),
      unit: data.unit,
      unitPrice,
      custom: true,
    }];
  });

  return [...builtInItems, ...customItems].sort((first, second) =>
    first.name.localeCompare(second.name)
  );
};

export const getTargetBoardItem = async () => {
  const catalogId = getAmmunitionInventoryId(TARGET_BOARD_NAME);
  const targetBoardRef = doc(
    db,
    AMMUNITION_CATALOG_COLLECTION,
    catalogId
  );
  const targetBoardSnapshot = await getDoc(targetBoardRef);
  const override = targetBoardSnapshot.exists()
    ? targetBoardSnapshot.data()
    : null;

  if (override?.active === false) return null;
  const defaultItem = RANGE_PACKAGE_CATALOG["Range Fee Rates"].find(
    (item) => item.name === TARGET_BOARD_NAME
  );
  const unitPrice =
    override?.unitPrice == null
      ? defaultItem.unitPrice
      : Number(override.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error(`Invalid price for ${TARGET_BOARD_NAME}.`);
  }

  return {
    ...defaultItem,
    name: typeof override?.name === "string" ? override.name : TARGET_BOARD_NAME,
    unitPrice,
    inventoryName: TARGET_BOARD_NAME,
    catalogId,
    targetBoard: true,
  };
};

export const updateAmmunitionItem = async (item, nextName, nextUnitPrice) => {
  const name = typeof nextName === "string" ? nextName.trim() : "";
  if (!name) throw new Error("Enter an ammunition item name.");
  const unitPrice = Number(nextUnitPrice);
  if (nextUnitPrice === "" || !Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error("Enter a valid price of 0 or more.");
  }
  const [ammunitionTypes, targetBoardItem] = await Promise.all([
    getAmmunitionTypes(),
    getTargetBoardItem(),
  ]);
  if (
    [...ammunitionTypes, targetBoardItem].some(
      (existingItem) =>
        existingItem &&
        existingItem.inventoryName !== item.inventoryName &&
        existingItem.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new Error("An ammunition item with this name already exists.");
  }

  if (item.builtIn || item.targetBoard) {
    const catalogRef = doc(
      db,
      AMMUNITION_CATALOG_COLLECTION,
      item.catalogId
    );
    await setDoc(
      catalogRef,
      {
        catalogId: item.catalogId,
        name,
        unitPrice,
        active: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const inventoryRef = doc(
    db,
    AMMUNITION_INVENTORY_COLLECTION,
    getAmmunitionInventoryId(item.inventoryName || item.name)
  );
  await updateDoc(inventoryRef, {
    name,
    unitPrice,
    updatedAt: serverTimestamp(),
  });
};

export const removeAmmunitionItem = async (item) => {
  if (item.builtIn || item.targetBoard) {
    await setDoc(
      doc(db, AMMUNITION_CATALOG_COLLECTION, item.catalogId),
      {
        catalogId: item.catalogId,
        name: item.name,
        active: false,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  await updateDoc(
    doc(
      db,
      AMMUNITION_INVENTORY_COLLECTION,
      getAmmunitionInventoryId(item.inventoryName || item.name)
    ),
    { active: false, updatedAt: serverTimestamp() }
  );
};

export const getAmmunitionUnitLabel = (
  ammunitionName,
  customAmmunitionTypes = [],
  inventoryName = ammunitionName
) => {
  const normalizedLookupName = normalizeAmmunitionName(ammunitionName);
  const unit = [...inventoryItems, ...customAmmunitionTypes].find(
    (item) =>
      normalizeAmmunitionName(item.name) === normalizedLookupName ||
      normalizeAmmunitionName(item.name) ===
        normalizeAmmunitionName(inventoryName)
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
      (item) =>
        normalizeAmmunitionName(item.name).toLowerCase() ===
        normalizeAmmunitionName(normalizedName).toLowerCase()
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
      (inventoryItem) =>
        normalizeAmmunitionName(inventoryItem.name) ===
          normalizeAmmunitionName(item.inventoryName || item.name)
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
    const inventoryName =
      item.inventoryName || catalogItem?.inventoryName || item.name;
    quantities[inventoryName] =
      (quantities[inventoryName] || 0) + enteredQuantity * unitsPerQuantity;
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

export const addAmmunitionStock = async (
  ammunitionName,
  amount,
  inventoryName = ammunitionName
) => {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("Stock quantity must be a whole number of at least 1.");
  }

  const inventoryRef = doc(
    db,
    AMMUNITION_INVENTORY_COLLECTION,
    getAmmunitionInventoryId(inventoryName)
  );

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(inventoryRef);
    const isBuiltIn = inventoryItems.some(
      (item) => item.name === inventoryName
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

export const removeAmmunitionStock = async (
  ammunitionName,
  amount,
  inventoryName = ammunitionName
) => {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("Stock-out quantity must be a whole number of at least 1.");
  }

  const inventoryRef = doc(
    db,
    AMMUNITION_INVENTORY_COLLECTION,
    getAmmunitionInventoryId(inventoryName)
  );

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(inventoryRef);
    const isBuiltIn = inventoryItems.some(
      (item) => item.name === inventoryName
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
