export const RANGE_PACKAGE_CATALOG = {
  "Range Fee Rates": [
    { name: "Range Fee", unitPrice: 800, unit: "booking" },
    { name: "Target Board", unitPrice: 50, unit: "board" },
    {
      name: "Exclusive use of the range",
      unitPrice: 2000,
      unit: "hour",
    },
  ],
  "Ammunition Corkage": [
    {
      name: "1–100 rounds (₱8 per round)",
      unitPrice: 8,
      unit: "round",
      pricing: "corkage-per-round",
    },
    {
      name: "101+ rounds (₱1,000 flat)",
      unitPrice: 1000,
      unit: "rounds",
      pricing: "corkage-flat",
    },
  ],
  "Ammunition Prices": [
    { name: ".22 High Velocity (50s)", unitPrice: 1000, unit: "box of 50" },
    { name: ".38 Special", unitPrice: 38, unit: "piece" },
    { name: "9MM FMJ", unitPrice: 35, unit: "piece" },
    { name: "12 Gauge Birdshots", unitPrice: 60, unit: "piece" },
    { name: "5.56", unitPrice: 75, unit: "piece" },
    { name: "9m.m Teflon", unitPrice: 20, unit: "piece" },
    { name: "40 cal teflon", unitPrice: 20, unit: "piece" },
    { name: "45 acp teflon", unitPrice: 28, unit: "piece" },
  ],
  Others: [],
};

export const RANGE_PACKAGE_CATEGORY_LABELS = {
  "Range Fee Rates": "Range Fee",
  "Ammunition Corkage": "Ammunition Corkage Fee",
  "Ammunition Prices": "Ammunition Fee",
  Others: "Others",
};

export const RANGE_PACKAGE_QUANTITY_ITEMS = {
  "Range Fee Rates": ["Range Fee", "Target Board"],
  "Ammunition Prices": RANGE_PACKAGE_CATALOG["Ammunition Prices"].map(
    (item) => item.name
  ),
};

export const getRangePackageContents = (
  categories,
  selectedItems,
  quantities,
  otherRangeItem
) =>
  categories
    .filter((category) => RANGE_PACKAGE_CATALOG[category])
    .map((category) => ({
      category,
      items:
        category === "Others"
          ? [
              {
                name: otherRangeItem.details.trim(),
                details: otherRangeItem.details.trim(),
                unitPrice: Number(otherRangeItem.price),
                unit: "item",
                pricing: "custom-flat",
              },
            ]
          : RANGE_PACKAGE_CATALOG[category]
              .filter((item) => selectedItems[category]?.includes(item.name))
              .map((item) => ({
                name: item.name,
                unitPrice: item.unitPrice,
                unit: item.unit,
                pricing: item.pricing || "",
                ...(RANGE_PACKAGE_QUANTITY_ITEMS[category]?.includes(item.name)
                  ? { quantity: Number(quantities[category]?.[item.name]) || 0 }
                  : {}),
              })),
    }))
    .filter(
      ({ category, items }) =>
        items.length > 0 &&
        (category !== "Others" || items[0].name)
    );

export const getRangePackageItemsTotal = (contents) =>
  contents.reduce(
    (total, { items }) =>
      total +
      items.reduce((categoryTotal, item) => {
        const quantity = "quantity" in item ? Number(item.quantity) || 0 : 1;
        return categoryTotal + Number(item.unitPrice) * quantity;
      }, 0),
    0
  );
