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
import {
  AMMUNITION_CATEGORY,
  adjustAmmunitionInventory,
  getAmmunitionTypes,
  getTargetBoardItem,
} from "../utils/ammunitionInventory";
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

const getProductQuantities = (sale) =>
  (Array.isArray(sale?.productItems) ? sale.productItems : []).reduce(
    (quantities, item) => {
      if (!item.productId) return quantities;
      quantities[item.productId] =
        (quantities[item.productId] || 0) + Number(item.quantity);
      return quantities;
    },
    {}
  );

const getProductItemsTotal = (items) =>
  (Array.isArray(items) ? items : []).reduce((total, item) => {
    const price = Number(item.unitPrice);
    const quantity = Number(item.quantity);
    return Number.isFinite(price) && Number.isFinite(quantity)
      ? total + price * quantity
      : total;
  }, 0);

const fetchProducts = async () => {
  const snapshot = await getDocs(collection(db, "products"));
  const productList = snapshot.docs.map((productDoc) => ({
    id: productDoc.id,
    ...productDoc.data(),
  }));
  productList.sort((first, second) =>
    (first.productName || "").localeCompare(second.productName || "")
  );
  return productList;
};

export default function SoldManagement() {
  const [soldItems, setSoldItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productLoadError, setProductLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [viewingSale, setViewingSale] = useState(null);
  const [printingSale, setPrintingSale] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [soldDate, setSoldDate] = useState(getTodayDate);
  const [soldTo, setSoldTo] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});
  const [quantities, setQuantities] = useState({});
  const [productLines, setProductLines] = useState([]);
  const [otherItem, setOtherItem] = useState(emptyOtherItem);
  const [ammunitionTypes, setAmmunitionTypes] = useState([]);
  const [targetBoardItem, setTargetBoardItem] = useState(
    RANGE_PACKAGE_CATALOG["Range Fee Rates"].find(
      (item) => item.name === "Target Board"
    )
  );
  const rangePackageCatalog = useMemo(
    () => ({
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
    }),
    [ammunitionTypes, targetBoardItem]
  );

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

  const loadProducts = async () => {
    try {
      setProducts(await fetchProducts());
      setProductLoadError("");
    } catch (loadError) {
      console.error("Error loading products for sold items:", loadError);
      setProductLoadError("Unable to load products from Product Management.");
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    loadSoldItems();
  }, [loadSoldItems]);

  useEffect(() => {
    let isCurrent = true;
    fetchProducts()
      .then((productList) => {
        if (isCurrent) {
          setProducts(productList);
          setProductLoadError("");
        }
      })
      .catch((loadError) => {
        console.error("Error loading products for sold items:", loadError);
        if (isCurrent) {
          setProductLoadError("Unable to load products from Product Management.");
        }
      })
      .finally(() => {
        if (isCurrent) setProductsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
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
        if (isCurrent) setError("Unable to load custom ammunition items.");
      });

    return () => {
      isCurrent = false;
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

  const addProductLine = () => {
    setProductLines((current) => [...current, { productId: "", quantity: "" }]);
  };

  const updateProductLine = (index, field, value) => {
    setProductLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
              ...(field === "productId" ? { quantity: value ? "1" : "" } : {}),
            }
          : line
      )
    );
    setError("");
  };

  const removeProductLine = (index) => {
    setProductLines((current) =>
      current.filter((_, lineIndex) => lineIndex !== index)
    );
    setError("");
  };

  const packageContents = useMemo(
    () =>
      getRangePackageContents(
        categories,
        selectedItems,
        quantities,
        otherItem,
        rangePackageCatalog
      ),
    [categories, selectedItems, quantities, otherItem, rangePackageCatalog]
  );
  const rangePackageTotal = getRangePackageItemsTotal(packageContents);
  const productSalesTotal = productLines.reduce((total, line) => {
    const product = products.find((item) => item.id === line.productId);
    const quantity = Number(line.quantity);
    return product && Number.isInteger(quantity) && quantity > 0
      ? total + Number(product.price) * quantity
      : total;
  }, 0);
  const totalAmount = rangePackageTotal + productSalesTotal;
  const discountRate = discountPercentage === "" ? 0 : Number(discountPercentage);
  const discountAmount =
    Number.isInteger(discountRate) && discountRate >= 1 && discountRate <= 100
      ? totalAmount * (discountRate / 100)
      : 0;
  const discountedTotal = totalAmount - discountAmount;
  const editingSale = soldItems.find((sale) => sale.id === editingSaleId);
  const previousProductQuantities = getProductQuantities(editingSale);
  const getAvailableProductStock = (productId) => {
    const product = products.find((item) => item.id === productId);
    const stock = Number(product?.stock);
    const quantityToRestore = Number(previousProductQuantities[productId] || 0);
    return Number.isInteger(stock) && stock >= 0
      ? stock + quantityToRestore
      : 0;
  };

  const resetForm = () => {
    setEditingSaleId(null);
    setSoldDate(getTodayDate());
    setSoldTo("");
    setDiscountPercentage("");
    setCategories([]);
    setSelectedItems({});
    setQuantities({});
    setProductLines([]);
    setOtherItem(emptyOtherItem);
    setError("");
  };

  const openEditForm = (sale) => {
    const contents = Array.isArray(sale.packageContents)
      ? sale.packageContents
      : [];
    const existingItems = Array.isArray(sale.packageItems)
      ? sale.packageItems
      : [];
    const existingProductLines = Array.isArray(sale.productItems)
      ? sale.productItems
          .filter((item) => item.productId)
          .map((item) => ({
            productId: item.productId,
            quantity: String(item.quantity ?? ""),
          }))
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
    setDiscountPercentage(
      sale.discountPercentage ? String(sale.discountPercentage) : ""
    );
    setCategories(existingCategories);
    setSelectedItems(nextSelectedItems);
    setQuantities(nextQuantities);
    setProductLines(existingProductLines);
    setOtherItem({
      details: other?.details || other?.name || "",
      price: other?.unitPrice == null ? "" : String(other.unitPrice),
    });
    setOpenMenuId(null);
    setMenuPosition(null);
    setError("");
  };

  const closeActionMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (
      discountPercentage !== "" &&
      (!Number.isInteger(discountRate) || discountRate < 1 || discountRate > 100)
    ) {
      setError("Discount must be a whole number from 1% to 100%.");
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
    const selectedProductLines = productLines.filter((line) => line.productId);
    if (
      productLines.some((line) => !line.productId && line.quantity !== "")
    ) {
      setError("Select a product for each entered quantity.");
      return;
    }
    if (!packageContents.length && !selectedProductLines.length) {
      setError("Select at least one Range Package item or product.");
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
    if (
      selectedProductLines.some(
        (line) =>
          !Number.isInteger(Number(line.quantity)) ||
          Number(line.quantity) < 1
      )
    ) {
      setError("Enter a whole-number quantity of at least 1 for each product.");
      return;
    }
    if (
      new Set(selectedProductLines.map((line) => line.productId)).size !==
      selectedProductLines.length
    ) {
      setError("Select each product only once.");
      return;
    }

    const productItems = [];
    for (const line of selectedProductLines) {
      const product = products.find((item) => item.id === line.productId);
      if (!product) {
        setError("A selected product could not be found. Refresh the product list and try again.");
        return;
      }

      const quantity = Number(line.quantity);
      const unitPrice = Number(product.price);
      const availableStock = getAvailableProductStock(product.id);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setError(`${product.productName} has an invalid price in Product Management.`);
        return;
      }
      if (quantity > availableStock) {
        setError(
          `Not enough stock for ${product.productName}. Available: ${availableStock}.`
        );
        return;
      }

      productItems.push({
        productId: product.id,
        name: product.productName || "Product",
        barcode: product.barcode || "",
        unitPrice,
        quantity,
      });
    }

    try {
      setSaving(true);
      const subtotalAmount =
        rangePackageTotal + getProductItemsTotal(productItems);
      const discountAmount = subtotalAmount * (discountRate / 100);
      const saleData = {
        packageCategory: packageContents.length ? "Range Package" : "",
        packageCategories: packageContents.map(({ category }) => category),
        packageContents,
        packageItems: [],
        productItems,
        soldDate: editingSaleId ? soldDate : getTodayDate(),
        soldTo: soldTo.trim(),
        subtotalAmount,
        discountPercentage: discountRate,
        discountAmount,
        totalAmount: subtotalAmount - discountAmount,
        updatedAt: serverTimestamp(),
      };
      const saleRef = editingSaleId
        ? doc(db, "rangeSold", editingSaleId)
        : doc(collection(db, "rangeSold"));

      const productStocks = await runTransaction(db, async (transaction) => {
        const saleSnapshot = editingSaleId
          ? await transaction.get(saleRef)
          : null;
        if (saleSnapshot && !saleSnapshot.exists()) {
          throw new Error("This sold items record could not be found.");
        }

        const currentSale = saleSnapshot?.data() || null;
        const previousProductQuantities = getProductQuantities(currentSale);
        const nextProductQuantities = getProductQuantities(saleData);
        const productIds = [
          ...new Set([
            ...Object.keys(previousProductQuantities),
            ...Object.keys(nextProductQuantities),
          ]),
        ];
        const productRefs = productIds.map((productId) =>
          doc(db, "products", productId)
        );
        const productSnapshots = await Promise.all(
          productRefs.map((productRef) => transaction.get(productRef))
        );
        const productSnapshotById = new Map(
          productIds.map((productId, index) => [
            productId,
            productSnapshots[index],
          ])
        );
        const pricedProductItems = saleData.productItems.map((item) => {
          const productSnapshot = productSnapshotById.get(item.productId);
          if (!productSnapshot?.exists()) {
            throw new Error(`${item.name} could not be found in Product Management.`);
          }

          const productData = productSnapshot.data();
          const unitPrice = Number(productData.price);
          if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error(`${productData.productName || item.name} has an invalid price.`);
          }
          return {
            ...item,
            name: productData.productName || item.name,
            barcode: productData.barcode || "",
            unitPrice,
          };
        });
        const productStockUpdates = {};
        productIds.forEach((productId) => {
          const productSnapshot = productSnapshotById.get(productId);
          if (!productSnapshot?.exists()) {
            throw new Error("A product in this sale no longer exists.");
          }

          const productData = productSnapshot.data();
          const currentStock = Number(productData.stock);
          const previousQuantity = Number(
            previousProductQuantities[productId] || 0
          );
          const nextQuantity = Number(nextProductQuantities[productId] || 0);
          if (
            !Number.isInteger(currentStock) ||
            currentStock < 0 ||
            !Number.isInteger(previousQuantity) ||
            previousQuantity < 0 ||
            !Number.isInteger(nextQuantity) ||
            nextQuantity < 0
          ) {
            throw new Error(
              `Invalid stock or sale quantity for ${productData.productName || productId}.`
            );
          }

          const stockChange = nextQuantity - previousQuantity;
          if (stockChange > currentStock) {
            throw new Error(
              `Not enough stock for ${productData.productName || productId}. Available: ${currentStock}; needed: ${stockChange}.`
            );
          }
          if (stockChange !== 0) {
            productStockUpdates[productId] = {
              stock: currentStock - stockChange,
            };
          }
        });
        const nextSubtotalAmount =
          rangePackageTotal + getProductItemsTotal(pricedProductItems);
        const nextDiscountAmount = nextSubtotalAmount * (discountRate / 100);
        const nextSaleData = {
          ...saleData,
          productItems: pricedProductItems,
          subtotalAmount: nextSubtotalAmount,
          discountAmount: nextDiscountAmount,
          totalAmount: nextSubtotalAmount - nextDiscountAmount,
        };
        const inventoryStockOut = await adjustAmmunitionInventory(
          transaction,
          currentSale,
          nextSaleData
        );
        Object.entries(productStockUpdates).forEach(([productId, update]) => {
          transaction.update(doc(db, "products", productId), {
            ...update,
            updatedAt: serverTimestamp(),
          });
        });
        const savedSaleData = { ...nextSaleData, inventoryStockOut };

        if (editingSaleId) {
          transaction.update(saleRef, savedSaleData);
        } else {
          transaction.set(saleRef, {
            ...savedSaleData,
            createdAt: serverTimestamp(),
          });
        }
        return Object.fromEntries(
          Object.entries(productStockUpdates).map(([productId, update]) => [
            productId,
            update.stock,
          ])
        );
      });
      setProducts((current) =>
        current.map((product) =>
          productStocks[product.id] == null
            ? product
            : { ...product, stock: productStocks[product.id] }
        )
      );
      resetForm();
      await Promise.all([loadSoldItems(), loadProducts()]);
    } catch (saveError) {
      console.error("Error saving sold range items:", saveError);
      setError(
        saveError instanceof Error
          ? `Failed to save sold items. ${saveError.message}`
          : "Failed to save sold items. Please try again."
      );
      await loadProducts();
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
        const productQuantities = getProductQuantities(currentSale);
        const productIds = Object.keys(productQuantities);
        const productRefs = productIds.map((productId) =>
          doc(db, "products", productId)
        );
        const productSnapshots = await Promise.all(
          productRefs.map((productRef) => transaction.get(productRef))
        );
        const productStockUpdates = [];
        productSnapshots.forEach((productSnapshot, index) => {
          const productId = productIds[index];
          if (!productSnapshot.exists()) {
            throw new Error("A product in this sale no longer exists.");
          }

          const productData = productSnapshot.data();
          const currentStock = Number(productData.stock);
          const quantity = Number(productQuantities[productId]);
          if (
            !Number.isInteger(currentStock) ||
            currentStock < 0 ||
            !Number.isInteger(quantity) ||
            quantity < 0
          ) {
            throw new Error(
              `Invalid stock or sale quantity for ${productData.productName || productId}.`
            );
          }
          productStockUpdates.push({
            productId,
            stock: currentStock + quantity,
          });
        });

        await adjustAmmunitionInventory(
          transaction,
          currentSale,
          { ...currentSale, packageContents: [], packageItems: [] }
        );
        productStockUpdates.forEach(({ productId, stock }) => {
          transaction.update(doc(db, "products", productId), {
            stock,
            updatedAt: serverTimestamp(),
          });
        });
        transaction.delete(saleRef);
      });
      await Promise.all([loadSoldItems(), loadProducts()]);
    } catch (deleteError) {
      console.error("Error deleting sold range items:", deleteError);
      setError(
        deleteError instanceof Error
          ? `Failed to delete this sold items record. ${deleteError.message}`
          : "Failed to delete this sold items record."
      );
      await loadProducts();
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
      : getRangePackageItemsTotal(getSaleContents(sale)) +
        getProductItemsTotal(sale.productItems);

  const getSaleDiscountPercentage = (sale) => {
    const percentage = Number(sale.discountPercentage);
    return Number.isInteger(percentage) && percentage >= 1 && percentage <= 100
      ? percentage
      : 0;
  };

  const getSaleSubtotal = (sale) =>
    sale.subtotalAmount != null && Number.isFinite(Number(sale.subtotalAmount))
      ? Number(sale.subtotalAmount)
      : getSaleTotal(sale);

  const getSaleDiscountAmount = (sale) =>
    sale.discountAmount != null && Number.isFinite(Number(sale.discountAmount))
      ? Number(sale.discountAmount)
      : getSaleSubtotal(sale) * (getSaleDiscountPercentage(sale) / 100);

  return (
    <div className="sold-management-page">
      <header className="sold-management-header">
        <div>
          <h1>Sold Management</h1>
          <p>Record and review Range Package items and products sold.</p>
        </div>
      </header>

      <div className="sold-pos-layout">
        <section className="sold-list">
          <div className="sold-list-header">
            <h2>Sales</h2>
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

        <section className="sold-form-card sold-entry-panel" aria-labelledby="sold-form-title">
          <header className="sold-form-header">
            <div>
              <h2 id="sold-form-title">{editingSaleId ? "Edit Sold Items" : "Add Sold Items"}</h2>
              <p>New sales use today's date; edits keep the original date.</p>
            </div>
          </header>
          <form onSubmit={handleSubmit}>
            <div className="sold-form-fields">
              <label>
                Sold To <span>(optional)</span>
                <input
                  type="text"
                  value={soldTo}
                  onChange={(event) => setSoldTo(event.target.value)}
                  placeholder="Customer name"
                />
              </label>
              <label>
                Discount (%) <span>(optional, 1–100)</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={discountPercentage}
                  onChange={(event) => setDiscountPercentage(event.target.value)}
                  placeholder="No discount"
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
                      {rangePackageCatalog[category].map((item) => (
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
                          {(category === AMMUNITION_CATEGORY ||
                            RANGE_PACKAGE_QUANTITY_ITEMS[category]?.includes(item.name)) &&
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

            <section className="sold-products-builder">
              <div className="range-package-heading">
                <h3>Products</h3>
                <p>Select products and quantities to add them to this sale.</p>
              </div>
              {productLoadError && (
                <p className="sold-form-error" role="alert">
                  {productLoadError}
                </p>
              )}
              {productsLoading && (
                <p className="sold-products-empty" role="status">
                  Loading products...
                </p>
              )}
              {!productsLoading && !productLoadError && products.length === 0 && (
                <p className="sold-products-empty">
                  No products are available. Add products in Product Management first.
                </p>
              )}
              {productLines.map((line, index) => {
                const selectedProduct = products.find(
                  (product) => product.id === line.productId
                );
                const quantity = Number(line.quantity);
                const subtotal =
                  selectedProduct &&
                  Number.isInteger(quantity) &&
                  quantity > 0
                    ? Number(selectedProduct.price) * quantity
                    : 0;
                return (
                  <div className="sold-product-row" key={`product-line-${index}`}>
                    <label>
                      Product
                      <select
                        value={line.productId}
                        onChange={(event) =>
                          updateProductLine(index, "productId", event.target.value)
                        }
                        disabled={productsLoading || Boolean(productLoadError)}
                      >
                        <option value="">Select a product</option>
                        {products.map((product) => {
                          const selectedElsewhere = productLines.some(
                            (otherLine, otherIndex) =>
                              otherIndex !== index &&
                              otherLine.productId === product.id
                          );
                          const available = getAvailableProductStock(product.id);
                          return (
                            <option
                              key={product.id}
                              value={product.id}
                              disabled={selectedElsewhere || available < 1}
                            >
                              {product.productName} · {formatCurrency(Number(product.price) || 0)} · Stock {available}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        max={
                          selectedProduct
                            ? getAvailableProductStock(selectedProduct.id)
                            : undefined
                        }
                        step="1"
                        value={line.quantity}
                        onChange={(event) =>
                          updateProductLine(index, "quantity", event.target.value)
                        }
                        disabled={!selectedProduct}
                      />
                    </label>
                    <div className="sold-product-subtotal">
                      <span>Subtotal</span>
                      <strong>{formatCurrency(subtotal)}</strong>
                    </div>
                    <button
                      className="sold-product-remove"
                      type="button"
                      onClick={() => removeProductLine(index)}
                      aria-label={`Remove product row ${index + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              <button
                className="sold-product-add"
                type="button"
                onClick={addProductLine}
                disabled={
                  productsLoading ||
                  Boolean(productLoadError) ||
                  products.length === 0
                }
              >
                + Add Product
              </button>
            </section>

            {error && <p className="sold-form-error" role="alert">{error}</p>}
            <div className="sold-price-summary">
              <div>
                <span>Subtotal</span>
                <strong>{formatCurrency(totalAmount)}</strong>
              </div>
              <div>
                <span>Discount ({discountRate || 0}%)</span>
                <strong>−{formatCurrency(discountAmount)}</strong>
              </div>
              <div className="sold-total">
                <span>Total due</span>
                <strong>{formatCurrency(discountedTotal)}</strong>
              </div>
            </div>
            <div className="sold-form-actions">
              {editingSaleId && (
                <button
                  className="sold-cancel-button"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel Edit
                </button>
              )}
              <button className="sold-save-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : editingSaleId ? "Save Changes" : "Save Sold Items"}
              </button>
            </div>
          </form>
        </section>
      </div>

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
                <p>Sale record</p>
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
              <div><dt>Subtotal</dt><dd>{formatCurrency(getSaleSubtotal(viewingSale))}</dd></div>
              <div>
                <dt>Discount</dt>
                <dd>
                  {getSaleDiscountPercentage(viewingSale)}% (
                  {formatCurrency(getSaleDiscountAmount(viewingSale))})
                </dd>
              </div>
            </dl>
            {getSaleContents(viewingSale).length > 0 && (
              <>
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
              </>
            )}
            {Array.isArray(viewingSale.productItems) &&
              viewingSale.productItems.length > 0 && (
                <>
                  <h3>Products</h3>
                  <div className="sold-detail-categories">
                    <section>
                      <ul>
                        {viewingSale.productItems.map((item, index) => (
                          <li key={`${item.productId}-${index}`}>
                            <span>
                              {item.name} · Qty {item.quantity}
                              {item.barcode && ` · Barcode ${item.barcode}`}
                            </span>
                            <strong>
                              {formatCurrency(
                                Number(item.unitPrice) * Number(item.quantity)
                              )}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </>
              )}
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

      {printingSale && (
        <article className="sold-print-sheet" aria-hidden="true">
          <header>
            <p>SURESHOTS · SOLD ITEMS</p>
            <h1>Sold Items Record</h1>
          </header>
          <dl className="sold-print-details">
            <div><dt>Sale Date</dt><dd>{formatDisplayDate(printingSale.soldDate)}</dd></div>
            <div><dt>Sold To</dt><dd>{printingSale.soldTo || "Walk-in sale"}</dd></div>
            <div><dt>Subtotal</dt><dd>{formatCurrency(getSaleSubtotal(printingSale))}</dd></div>
            <div>
              <dt>Discount</dt>
              <dd>
                {getSaleDiscountPercentage(printingSale)}% (
                {formatCurrency(getSaleDiscountAmount(printingSale))})
              </dd>
            </div>
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
          {Array.isArray(printingSale.productItems) &&
            printingSale.productItems.length > 0 && (
              <section>
                <h2>Products</h2>
                <ul>
                  {printingSale.productItems.map((item, index) => (
                    <li key={`${item.productId}-${index}`}>
                      <span>
                        {item.name} · {item.quantity}
                        {item.barcode && ` · Barcode ${item.barcode}`}
                      </span>
                      <strong>
                        {formatCurrency(
                          Number(item.unitPrice) * Number(item.quantity)
                        )}
                      </strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          <footer>
            <span>Total</span>
            <strong>{formatCurrency(getSaleTotal(printingSale))}</strong>
          </footer>
        </article>
      )}
    </div>
  );
}