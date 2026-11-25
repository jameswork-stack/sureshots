import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
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
import { getLocalDateKey } from "./date";

export const AMMUNITION_INVENTORY_COLLECTION = "ammunitionInventory";
export const AMMUNITION_CATALOG_COLLECTION = "ammunitionCatalog";
export const AMMUNITION_CATEGORY = "Ammunition Prices";
export const CUSTOM_AMMUNITION_UNITS = ["piece", "round", "box of 50"];
const TARGET_BOARD_NAME = "Target Board";
const roundCurrency = (amount) => Math.round(amount * 100) / 100;
const isValidCost = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const getInventoryStockValue = (inventoryData, quantity) => {
  if (isValidCost(inventoryData.stockValue)) return inventoryData.stockValue;
  if (isValidCost(inventoryData.unitCost)) {
    return roundCurrency(quantity * inventoryData.unitCost);
  }
  return null;
};

const inventoryItems = [
  ...RANGE_PACKAGE_CATALOG[AMMUNITION_CATEGORY],
  ...RANGE_PACKAGE_CATALOG["Range Fee Rates"].filter(
    (item) => item.name === "Target Board"
  ),
];

const getDailyStockOutUpdate = (inventoryData, quantity, today) => {
  const previousQuantity =
    inventoryData.dailyStockOutDate === today
      ? Number(inventoryData.dailyStockOutQuantity)
      : 0;
  if (!Number.isInteger(previousQuantity) || previousQuantity < 0) {
    throw new Error("Invalid daily ammunition stock-out quantity.");
  }
  return {
    dailyStockOutDate: today,
    dailyStockOutQuantity: previousQuantity + quantity,
  };
};

export const getAmmunitionInventoryId = (ammunitionName) =>
  encodeURIComponent(normalizeAmmunitionName(ammunitionName));

const getAmmunitionMovementsCollection = (inventoryName) =>
  collection(
    doc(
      db,
      AMMUNITION_INVENTORY_COLLECTION,
      getAmmunitionInventoryId(inventoryName)
    ),
    "movements"
  );

export const getAmmunitionMovements = async (inventoryName) => {
  const movementSnapshot = await getDocs(
    query(
      getAmmunitionMovementsCollection(inventoryName),
      orderBy("createdAt", "desc")
    )
  );

  return movementSnapshot.docs.map((movementDoc) => ({
    id: movementDoc.id,
    ...movementDoc.data(),
  }));
};

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
      const targetQuantity = Number(targetData.quantity) || 0;
      const legacyQuantity = Number(legacyData.quantity) || 0;
      const targetStockValue =
        targetQuantity === 0
          ? 0
          : getInventoryStockValue(targetData, targetQuantity);
      const legacyStockValue =
        legacyQuantity === 0
          ? 0
          : getInventoryStockValue(legacyData, legacyQuantity);
      const mergedStockValue =
        targetStockValue == null || legacyStockValue == null
          ? null
          : roundCurrency(targetStockValue + legacyStockValue);

      transaction.set(
        normalizedRef,
        {
          ...targetData,
          name: normalizedName,
          quantity: mergedQuantity,
          stockValue:
            mergedStockValue == null ? deleteField() : mergedStockValue,
          unitCost:
            mergedStockValue == null
              ? deleteField()
              : mergedQuantity > 0
                ? mergedStockValue / mergedQuantity
                : null,
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

export const updateAmmunitionItem = async (
  item,
  nextName,
  nextUnitPrice,
  inventoryChanges = {}
) => {
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

  const inventoryName = item.inventoryName || item.name;
  const inventoryRef = doc(
    db,
    AMMUNITION_INVENTORY_COLLECTION,
    getAmmunitionInventoryId(inventoryName)
  );
  const isCatalogItem = item.builtIn || item.targetBoard;
  const isTargetBoard =
    normalizeAmmunitionName(inventoryName) ===
    normalizeAmmunitionName(TARGET_BOARD_NAME);
  const catalogRef = isCatalogItem
    ? doc(db, AMMUNITION_CATALOG_COLLECTION, item.catalogId)
    : null;
  const stockOutAmount =
    inventoryChanges.stockOutAmount == null ||
    inventoryChanges.stockOutAmount === ""
      ? 0
      : Number(inventoryChanges.stockOutAmount);
  const stockOutReason =
    typeof inventoryChanges.stockOutReason === "string"
      ? inventoryChanges.stockOutReason.trim()
      : "";
  if (!Number.isInteger(stockOutAmount) || stockOutAmount < 0) {
    throw new Error("Stock-out quantity must be a whole number of 0 or more.");
  }
  if (stockOutAmount > 0 && !stockOutReason) {
    throw new Error("Enter a reason for the stock out.");
  }

  const stockValueInput = inventoryChanges.stockValue;
  const hasStockValueInput =
    stockValueInput != null && stockValueInput !== "";
  const numericStockValue = Number(stockValueInput);
  if (
    hasStockValueInput &&
    (!Number.isFinite(numericStockValue) || numericStockValue < 0)
  ) {
    throw new Error("Enter a valid total cost for the current stock.");
  }

  return runTransaction(db, async (transaction) => {
    const inventorySnapshot = await transaction.get(inventoryRef);

    if (!isCatalogItem && !inventorySnapshot.exists()) {
      throw new Error("The ammunition item could not be found.");
    }

    const inventoryData = inventorySnapshot.exists()
      ? inventorySnapshot.data()
      : {};
    const currentStock = inventorySnapshot.exists()
      ? Number(inventoryData.quantity)
      : 0;
    if (!Number.isInteger(currentStock) || currentStock < 0) {
      throw new Error(`Invalid inventory quantity for ${inventoryName}.`);
    }
    if (stockOutAmount > currentStock) {
      throw new Error(
        `Not enough stock for ${name}. Available: ${currentStock}; requested: ${stockOutAmount}.`
      );
    }
    const previousStockValue = getInventoryStockValue(
      inventoryData,
      currentStock
    );
    let updatedStockValue = previousStockValue;
    let stockCostChanged = false;
    if (!isTargetBoard && currentStock > 0) {
      if (!hasStockValueInput && previousStockValue == null) {
        throw new Error(
          `Enter the total cost of the existing ${currentStock} units of ${name}.`
        );
      }
      if (hasStockValueInput) {
        updatedStockValue = roundCurrency(numericStockValue);
        stockCostChanged = updatedStockValue !== previousStockValue;
      }
    }

    if (!isTargetBoard && stockOutAmount > 0 && updatedStockValue == null) {
      throw new Error(
        `Set the total cost of existing stock for ${name} before recording ammunition usage.`
      );
    }

    const unitCost =
      !isTargetBoard && currentStock > 0 && updatedStockValue != null
        ? updatedStockValue / currentStock
        : null;
    const stockOutCOGS =
      stockOutAmount > 0 && unitCost != null
        ? roundCurrency(unitCost * stockOutAmount)
        : 0;
    const nextStock = currentStock - stockOutAmount;
    const nextStockValue =
      updatedStockValue == null
        ? null
        : roundCurrency(updatedStockValue - stockOutCOGS);
    const dailyStockOut =
      stockOutAmount > 0 && !isTargetBoard
        ? getDailyStockOutUpdate(
            inventoryData,
            stockOutAmount,
            getLocalDateKey()
          )
        : {};

    if (catalogRef) {
      transaction.set(
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
    }

    const shouldUpdateInventory =
      !isCatalogItem || stockOutAmount > 0 || stockCostChanged;
    if (shouldUpdateInventory) {
      transaction.set(
        inventoryRef,
        {
          name: isCatalogItem ? inventoryData.name || inventoryName : name,
          ...(!isCatalogItem ? { unitPrice } : {}),
          quantity: nextStock,
          ...(nextStockValue == null
            ? {}
            : {
                stockValue: nextStockValue,
                unitCost:
                  nextStock > 0 ? nextStockValue / nextStock : null,
              }),
          ...dailyStockOut,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (stockCostChanged) {
      const movementRef = doc(collection(inventoryRef, "movements"));
      transaction.set(movementRef, {
        type: "cost_adjustment",
        quantityChange: 0,
        ...(previousStockValue == null
          ? {}
          : { previousTotalCost: previousStockValue }),
        totalCost: updatedStockValue,
        unitCost: updatedStockValue / currentStock,
        reason:
          previousStockValue == null
            ? "Opening stock valuation"
            : "Inventory cost edited",
        createdAt: serverTimestamp(),
      });
    }

    if (stockOutAmount > 0) {
      const movementRef = doc(collection(inventoryRef, "movements"));
      transaction.set(movementRef, {
        type: "manual_stock_out",
        quantityChange: -stockOutAmount,
        ...(unitCost == null ? {} : { unitCost }),
        cogsChange: stockOutCOGS,
        reason: stockOutReason,
        createdAt: serverTimestamp(),
      });
    }

    return {
      quantity: nextStock,
      stockValue: nextStockValue,
      unitCost:
        !isTargetBoard && nextStock > 0 && nextStockValue != null
          ? nextStockValue / nextStock
          : null,
    };
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
  initialStockCost,
}) => {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const numericPrice = Number(unitPrice);
  const numericInitialStockCost = Number(initialStockCost);
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
  if (
    initialStockCost === "" ||
    !Number.isFinite(numericInitialStockCost) ||
    numericInitialStockCost < 0 ||
    (initialStock === 0 && numericInitialStockCost !== 0)
  ) {
    throw new Error("Enter a valid total cost for the starting stock.");
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

    const stockValue = roundCurrency(numericInitialStockCost);
    transaction.set(inventoryRef, {
      name: normalizedName,
      unit,
      unitPrice: numericPrice,
      quantity: initialStock,
      stockValue,
      unitCost:
        initialStock > 0
          ? stockValue / initialStock
          : null,
      custom: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (initialStock > 0) {
      const movementRef = doc(collection(inventoryRef, "movements"));
      transaction.set(movementRef, {
        type: "stock_in",
        quantityChange: initialStock,
        unitCost: stockValue / initialStock,
        totalCost: stockValue,
        reason: "Initial stock",
        createdAt: serverTimestamp(),
      });
    }
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
  nextRecord,
  movementDetails = {}
) => {
  const today = getLocalDateKey();
  const previousQuantities = getInventoryQuantity(currentRecord);
  const nextQuantities = getAmmunitionQuantities(nextRecord);
  const previousCosts =
    currentRecord?.inventoryStockOutCOGS &&
    typeof currentRecord.inventoryStockOutCOGS === "object" &&
    !Array.isArray(currentRecord.inventoryStockOutCOGS)
      ? currentRecord.inventoryStockOutCOGS
      : {};
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
  const inventoryStockOutCOGS = {};

  inventorySnapshots.forEach((snapshot, index) => {
    const name = ammunitionNames[index];
    const previous = Number(previousQuantities[name] || 0);
    const next = Number(nextQuantities[name] || 0);
    const change = next - previous;
    if (!Number.isInteger(previous) || previous < 0) {
      throw new Error(`Invalid recorded stock usage for ${name}.`);
    }
    const currentStock = snapshot.exists()
      ? Number(snapshot.data().quantity)
      : 0;
    if (!Number.isInteger(currentStock) || currentStock < 0) {
      throw new Error(`Invalid inventory quantity for ${name}.`);
    }
    const inventoryData = snapshot.exists() ? snapshot.data() : {};
    const restoredStock = currentStock + previous;
    if (next > restoredStock) {
      throw new Error(
        `Not enough stock for ${name}. Available: ${restoredStock}; needed: ${next}.`
      );
    }

    const isTargetBoard =
      normalizeAmmunitionName(name) ===
      normalizeAmmunitionName(TARGET_BOARD_NAME);
    let updatedStockValue;
    let cogsChange = 0;
    let movementUnitCost;
    if (!isTargetBoard) {
      const currentStockValue = getInventoryStockValue(
        inventoryData,
        currentStock
      );
      if (currentStock > 0 && currentStockValue == null) {
        throw new Error(
          `Set the total cost of existing stock for ${name} before recording ammunition usage.`
        );
      }

      const previousCost = previousCosts[name];
      const recordedPreviousCost =
        previousCost &&
        Number(previousCost.quantity) === previous &&
        isValidCost(Number(previousCost.totalCost))
          ? Number(previousCost.totalCost)
          : null;
      const restoreCost =
        previous === 0
          ? 0
          : recordedPreviousCost ??
            (currentStockValue == null || currentStock === 0
              ? 0
              : roundCurrency(
                  (currentStockValue / currentStock) * previous
                ));
      const restoredStockValue = roundCurrency(
        (currentStockValue ?? 0) + restoreCost
      );
      const averageCost =
        restoredStock > 0 ? restoredStockValue / restoredStock : 0;
      const issueCost = roundCurrency(averageCost * next);
      updatedStockValue = roundCurrency(restoredStockValue - issueCost);
      cogsChange = roundCurrency(issueCost - restoreCost);
      if (change !== 0) {
        movementUnitCost = Math.abs(cogsChange / change);
      }

      if (next > 0) {
        inventoryStockOutCOGS[name] = {
          quantity: next,
          unitCost: averageCost,
          totalCost: issueCost,
        };
      }
    }

    const dailyStockOut =
      change > 0 && !isTargetBoard
        ? getDailyStockOutUpdate(inventoryData, change, today)
        : {};
    transaction.set(
      inventoryRefs[index],
      {
        name,
        quantity: restoredStock - next,
        ...(isTargetBoard
          ? {}
          : {
              stockValue: updatedStockValue,
              unitCost:
                restoredStock - next > 0
                  ? updatedStockValue / (restoredStock - next)
                  : null,
            }),
        ...dailyStockOut,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (change !== 0 || cogsChange !== 0) {
      const movementRef = doc(collection(inventoryRefs[index], "movements"));
      const movementType =
        change < 0
          ? `${movementDetails.type || "usage"}_return`
          : change > 0
            ? `${movementDetails.type || "usage"}_out`
            : `${movementDetails.type || "usage"}_cost_adjustment`;
      transaction.set(movementRef, {
        type: movementType,
        quantityChange: -change,
        ...(movementUnitCost == null ? {} : { unitCost: movementUnitCost }),
        cogsChange,
        reason: movementDetails.reason || "Inventory usage adjusted",
        ...(movementDetails.referenceId
          ? { referenceId: movementDetails.referenceId }
          : {}),
        createdAt: serverTimestamp(),
      });
    }
  });

  return {
    inventoryStockOut: nextQuantities,
    inventoryStockOutCOGS,
    ammunitionCOGS: roundCurrency(
      Object.values(inventoryStockOutCOGS).reduce(
        (total, cost) => total + cost.totalCost,
        0
      )
    ),
  };
};

export const addAmmunitionStock = async (
  ammunitionName,
  amount,
  purchaseCost,
  inventoryName = ammunitionName
) => {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error("Stock quantity must be a whole number of at least 1.");
  }
  const numericPurchaseCost = Number(purchaseCost);
  if (
    purchaseCost === "" ||
    !Number.isFinite(numericPurchaseCost) ||
    numericPurchaseCost < 0
  ) {
    throw new Error("Enter a valid total cost for the new stock.");
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
    const existingStockValue = getInventoryStockValue(
      snapshot.exists() ? snapshot.data() : {},
      currentStock
    );
    if (currentStock > 0 && existingStockValue == null) {
      throw new Error(
        `Set the total cost of the existing ${currentStock} units of ${ammunitionName} in Edit before adding stock.`
      );
    }
    const nextStock = currentStock + amount;
    const nextStockValue = roundCurrency(
      (existingStockValue ?? 0) + numericPurchaseCost
    );

    transaction.set(
      inventoryRef,
      {
        name: ammunitionName,
        quantity: nextStock,
        stockValue: nextStockValue,
        unitCost: nextStockValue / nextStock,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    const movementRef = doc(collection(inventoryRef, "movements"));
    transaction.set(movementRef, {
      type: "stock_in",
      quantityChange: amount,
      unitCost: numericPurchaseCost / amount,
      totalCost: numericPurchaseCost,
      reason: "Stock purchase",
      createdAt: serverTimestamp(),
    });
    return {
      quantity: nextStock,
      unitCost: nextStockValue / nextStock,
      stockValue: nextStockValue,
    };
  });
};
