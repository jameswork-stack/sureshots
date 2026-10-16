import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase";
import { RANGE_PACKAGE_CATALOG } from "../utils/rangePackage";
import "../styles/packageManagement.css";

const PACKAGES_COLLECTION = "rangePackages";

const EMPTY_PACKAGE = {
  category: "",
  gunName: "",
  ammoItems: [{ ammoType: "", ammoQuantity: "" }],
  targetBoardQuantity: "",
  details: "",
  price: "",
};

const ammunitionTypes = RANGE_PACKAGE_CATALOG["Ammunition Prices"];
const targetBoardItem = RANGE_PACKAGE_CATALOG["Range Fee Rates"].find(
  (item) => item.name === "Target Board"
);

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(amount);

export default function PackageManagement() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [packageForm, setPackageForm] = useState(EMPTY_PACKAGE);

  useEffect(() => {
    const loadPackages = async () => {
      try {
        const snapshot = await getDocs(collection(db, PACKAGES_COLLECTION));
        const records = snapshot.docs.map((packageDoc) => ({
          id: packageDoc.id,
          ...packageDoc.data(),
        }));
        records.sort((first, second) =>
          (first.category || "").localeCompare(second.category || "") ||
          (first.gunName || "").localeCompare(second.gunName || "")
        );
        setPackages(records);
      } catch (loadError) {
        console.error("Error loading packages:", loadError);
        setPageError("Unable to load packages. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadPackages();
  }, []);

  const packagesByCategory = useMemo(
    () =>
      packages.reduce((grouped, packageItem) => {
        const category = packageItem.category || "Uncategorized";
        grouped[category] = [...(grouped[category] || []), packageItem];
        return grouped;
      }, {}),
    [packages]
  );

  const openForm = (packageItem = null) => {
    setEditingPackageId(packageItem?.id || null);
    setPackageForm(
      packageItem
        ? {
            category: packageItem.category || "",
            gunName: packageItem.gunName || "",
            ammoItems:
              packageItem.ammoItems?.length > 0
                ? packageItem.ammoItems.map((item) => ({
                    ammoType: item.ammoType || "",
                    ammoQuantity: String(item.ammoQuantity ?? ""),
                  }))
                : packageItem.ammoType
                ? [
                    {
                      ammoType: packageItem.ammoType,
                      ammoQuantity: String(packageItem.ammoQuantity ?? ""),
                    },
                  ]
                : [{ ammoType: "", ammoQuantity: "" }],
            targetBoardQuantity: String(
              packageItem.targetBoardQuantity ?? ""
            ),
            details: packageItem.details || "",
            price: String(packageItem.price ?? ""),
          }
        : EMPTY_PACKAGE
    );
    setFormError("");
    setPageError("");
    setOpenMenu(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingPackageId(null);
    setPackageForm(EMPTY_PACKAGE);
    setFormError("");
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setPackageForm((current) => ({ ...current, [name]: value }));
    setFormError("");
  };

  const handleAmmoItemChange = (index, field, value) => {
    setPackageForm((current) => ({
      ...current,
      ammoItems: current.ammoItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
    setFormError("");
  };

  const addAmmoItem = () => {
    setPackageForm((current) => ({
      ...current,
      ammoItems: [...current.ammoItems, { ammoType: "", ammoQuantity: "" }],
    }));
  };

  const removeAmmoItem = (index) => {
    setPackageForm((current) => ({
      ...current,
      ammoItems: current.ammoItems.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
    setFormError("");
  };

  const handleSavePackage = async (event) => {
    event.preventDefault();
    setFormError("");

    const category = packageForm.category.trim();
    const gunName = packageForm.gunName.trim();
    const ammoItems = packageForm.ammoItems.map(
      ({ ammoType, ammoQuantity }) => ({
        ammoType,
        ammoQuantity: Number(ammoQuantity),
      })
    );
    const targetBoardQuantity = Number(packageForm.targetBoardQuantity);
    const details = packageForm.details.trim();
    const price = Number(packageForm.price);

    if (!category || !gunName || !ammoItems.length || !details) {
      setFormError("Complete all package details before saving.");
      return;
    }

    if (
      ammoItems.some(
        ({ ammoType, ammoQuantity }) =>
          !ammunitionTypes.some((ammunition) => ammunition.name === ammoType) ||
          !Number.isInteger(ammoQuantity) ||
          ammoQuantity < 1
      )
    ) {
      setFormError("Select a valid ammo type and quantity for each entry.");
      return;
    }

    if (
      new Set(ammoItems.map(({ ammoType }) => ammoType)).size !==
      ammoItems.length
    ) {
      setFormError("Each ammo type can only be added once to a package.");
      return;
    }

    if (
      !Number.isInteger(targetBoardQuantity) ||
      targetBoardQuantity < 1
    ) {
      setFormError("Enter a whole-number target board quantity of at least 1.");
      return;
    }

    if (
      !packageForm.price.trim() ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setFormError("Enter a valid package price of 0 or more.");
      return;
    }

    setSaving(true);
    try {
      const packageRecord = {
        category,
        gunName,
        ammoItems,
        ammoType: ammoItems[0].ammoType,
        ammoQuantity: ammoItems[0].ammoQuantity,
        targetBoardQuantity,
        details,
        price,
      };
      if (editingPackageId) {
        await updateDoc(
          doc(db, PACKAGES_COLLECTION, editingPackageId),
          packageRecord
        );
      } else {
        const packageDoc = await addDoc(
          collection(db, PACKAGES_COLLECTION),
          { ...packageRecord, createdAt: serverTimestamp() }
        );
        packageRecord.id = packageDoc.id;
      }

      setPackages((current) =>
        (editingPackageId
          ? current.map((item) =>
              item.id === editingPackageId
                ? { ...item, ...packageRecord }
                : item
            )
          : [...current, packageRecord]
        ).sort(
          (first, second) =>
            (first.category || "").localeCompare(second.category || "") ||
            (first.gunName || "").localeCompare(second.gunName || "")
        )
      );
      setShowForm(false);
      setEditingPackageId(null);
      setPackageForm(EMPTY_PACKAGE);
      setPageError("");
    } catch (saveError) {
      console.error("Error saving package:", saveError);
      setFormError("Unable to save this package. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePackage = async (packageItem) => {
    setOpenMenu(null);
    if (
      !window.confirm(`Delete ${packageItem.gunName} from Package Management?`)
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, PACKAGES_COLLECTION, packageItem.id));
      setPackages((current) =>
        current.filter((item) => item.id !== packageItem.id)
      );
      setPageError("");
    } catch (deleteError) {
      console.error("Error deleting package:", deleteError);
      setPageError("Unable to delete this package. Please try again.");
    }
  };

  const handleRenameCategory = async (category) => {
    setOpenMenu(null);
    const nextCategory = window.prompt("Enter the new category name:", category);
    if (nextCategory === null) return;

    const trimmedCategory = nextCategory.trim();
    if (!trimmedCategory) {
      setPageError("Category name cannot be empty.");
      return;
    }
    if (trimmedCategory === category) return;

    const categoryPackages = packages.filter(
      (packageItem) => packageItem.category === category
    );
    try {
      for (let start = 0; start < categoryPackages.length; start += 500) {
        const batch = writeBatch(db);
        categoryPackages
          .slice(start, start + 500)
          .forEach((packageItem) => {
            batch.update(doc(db, PACKAGES_COLLECTION, packageItem.id), {
              category: trimmedCategory,
            });
          });
        await batch.commit();
      }
      setPackages((current) =>
        current.map((packageItem) =>
          packageItem.category === category
            ? { ...packageItem, category: trimmedCategory }
            : packageItem
        )
      );
      setPageError("");
    } catch (renameError) {
      console.error("Error renaming package category:", renameError);
      setPageError(
        "Unable to rename this category completely. Reload the page and verify the category."
      );
    }
  };

  const handleDeleteCategory = async (category) => {
    setOpenMenu(null);
    const categoryPackages = packages.filter(
      (packageItem) => packageItem.category === category
    );
    if (
      !window.confirm(
        `Delete the "${category}" category and all ${categoryPackages.length} ${
          categoryPackages.length === 1 ? "package" : "packages"
        } inside it? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      for (let start = 0; start < categoryPackages.length; start += 500) {
        const batch = writeBatch(db);
        categoryPackages
          .slice(start, start + 500)
          .forEach((packageItem) => {
            batch.delete(doc(db, PACKAGES_COLLECTION, packageItem.id));
          });
        await batch.commit();
      }
      setPackages((current) =>
        current.filter((packageItem) => packageItem.category !== category)
      );
      setPageError("");
    } catch (deleteError) {
      console.error("Error deleting package category:", deleteError);
      setPageError(
        "Unable to delete this category completely. Reload the page and verify the packages."
      );
    }
  };

  return (
    <main className="package-management-page">
      <header className="package-management-header">
        <div>
          <p className="package-management-eyebrow">PACKAGE MANAGEMENT</p>
          <h1>Packages</h1>
          <p>Build and organize shooting packages by category.</p>
        </div>
        <button
          type="button"
          className="package-add-button"
          onClick={openForm}
        >
          <span aria-hidden="true">+</span> Add Package
        </button>
      </header>

      {pageError && (
        <p className="package-page-error" role="alert">
          {pageError}
        </p>
      )}

      {loading ? (
        <div className="package-list-message">Loading packages...</div>
      ) : packages.length === 0 ? (
        <div className="package-list-message">
          <strong>No packages yet</strong>
          <span>Add a package to start organizing your offerings.</span>
        </div>
      ) : (
        <div className="package-category-list">
          {Object.entries(packagesByCategory).map(([category, items]) => (
            <section className="package-category-section" key={category}>
              <div className="package-category-heading">
                <div>
                  <h2>{category}</h2>
                  <span>
                    {items.length} {items.length === 1 ? "package" : "packages"}
                  </span>
                </div>
                <div className="package-actions">
                  <button
                    className="package-menu-button"
                    type="button"
                    aria-label={`Category actions for ${category}`}
                    aria-haspopup="menu"
                    aria-expanded={
                      openMenu?.type === "category" &&
                      openMenu.id === category
                    }
                    onClick={() =>
                      setOpenMenu((current) =>
                        current?.type === "category" && current.id === category
                          ? null
                          : { type: "category", id: category }
                      )
                    }
                  >
                    ⋮
                  </button>
                  {openMenu?.type === "category" &&
                    openMenu.id === category && (
                      <div className="package-action-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleRenameCategory(category)}
                        >
                          Edit category
                        </button>
                        <button
                          className="package-menu-delete"
                          type="button"
                          role="menuitem"
                          onClick={() => handleDeleteCategory(category)}
                        >
                          Delete category
                        </button>
                      </div>
                    )}
                </div>
              </div>
              <div className="package-cards">
                {items.map((packageItem) => (
                  <article className="package-card" key={packageItem.id}>
                    <div className="package-card-heading">
                      <h3>{packageItem.gunName}</h3>
                      <strong>{formatCurrency(Number(packageItem.price))}</strong>
                      <div className="package-actions">
                        <button
                          className="package-menu-button"
                          type="button"
                          aria-label={`Package actions for ${packageItem.gunName}`}
                          aria-haspopup="menu"
                          aria-expanded={
                            openMenu?.type === "package" &&
                            openMenu.id === packageItem.id
                          }
                          onClick={() =>
                            setOpenMenu((current) =>
                              current?.type === "package" &&
                              current.id === packageItem.id
                                ? null
                                : { type: "package", id: packageItem.id }
                            )
                          }
                        >
                          ⋮
                        </button>
                        {openMenu?.type === "package" &&
                          openMenu.id === packageItem.id && (
                            <div className="package-action-menu" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => openForm(packageItem)}
                              >
                                Edit package
                              </button>
                              <button
                                className="package-menu-delete"
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  handleDeletePackage(packageItem)
                                }
                              >
                                Delete package
                              </button>
                            </div>
                          )}
                      </div>
                    </div>
                    {(packageItem.ammoItems?.length
                      ? packageItem.ammoItems
                      : packageItem.ammoType
                      ? [
                          {
                            ammoType: packageItem.ammoType,
                            ammoQuantity: packageItem.ammoQuantity,
                          },
                        ]
                      : []
                    ).map((ammoItem, index) => (
                      <p
                        className="package-card-ammunition"
                        key={`${ammoItem.ammoType}-${index}`}
                      >
                        {ammoItem.ammoType} · {ammoItem.ammoQuantity}{" "}
                        {ammunitionTypes.find(
                          (item) => item.name === ammoItem.ammoType
                        )?.unit || "rounds"}
                      </p>
                    ))}
                    <p className="package-card-ammunition">
                      {targetBoardItem.name} ·{" "}
                      {Number.isInteger(packageItem.targetBoardQuantity)
                        ? `${packageItem.targetBoardQuantity} ${
                            packageItem.targetBoardQuantity === 1
                              ? "board"
                              : "boards"
                          }`
                        : "Not set"}
                    </p>
                    <p className="package-card-details">{packageItem.details}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {showForm && (
        <div
          className="package-modal-overlay"
          onMouseDown={closeForm}
        >
          <section
            className="package-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="package-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="package-modal-header">
              <div>
                <p className="package-management-eyebrow">PACKAGE DETAILS</p>
                <h2 id="package-form-title">
                  {editingPackageId ? "Edit package" : "Add a package"}
                </h2>
                <p>
                  {editingPackageId
                    ? "Update the package information."
                    : "Enter the package information, then save it under a category."}
                </p>
              </div>
              <button
                type="button"
                className="package-modal-close"
                aria-label="Close"
                onClick={closeForm}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSavePackage}>
              <div className="package-form-grid">
                <div className="package-form-group">
                  <label htmlFor="package-category">Category name</label>
                  <input
                    id="package-category"
                    name="category"
                    type="text"
                    value={packageForm.category}
                    onChange={handleChange}
                    placeholder="e.g. Beginner Packages"
                    required
                  />
                </div>

                <div className="package-form-group">
                  <label htmlFor="package-gun-name">Gun name</label>
                  <input
                    id="package-gun-name"
                    name="gunName"
                    type="text"
                    value={packageForm.gunName}
                    onChange={handleChange}
                    placeholder="Enter gun name"
                    required
                  />
                </div>

                <div className="package-form-group package-form-full">
                  <div className="package-ammo-header">
                    <div>
                      <label>Ammo types and quantities</label>
                      <small>Ammunition choices match the booking form.</small>
                    </div>
                    <button
                      className="package-add-ammo-button"
                      type="button"
                      onClick={addAmmoItem}
                    >
                      + Add more ammo
                    </button>
                  </div>
                  <div className="package-ammo-rows">
                    {packageForm.ammoItems.map((ammoItem, index) => (
                      <div className="package-ammo-row" key={index}>
                        <label
                          className="visually-hidden"
                          htmlFor={`package-ammo-type-${index}`}
                        >
                          Ammo type {index + 1}
                        </label>
                        <select
                          id={`package-ammo-type-${index}`}
                          value={ammoItem.ammoType}
                          onChange={(event) =>
                            handleAmmoItemChange(
                              index,
                              "ammoType",
                              event.target.value
                            )
                          }
                          required
                        >
                          <option value="" disabled>
                            Select ammo type
                          </option>
                          {ammunitionTypes.map((ammunition) => (
                            <option
                              value={ammunition.name}
                              key={ammunition.name}
                            >
                              {ammunition.name}
                            </option>
                          ))}
                        </select>
                        <label
                          className="visually-hidden"
                          htmlFor={`package-ammo-quantity-${index}`}
                        >
                          Quantity for ammo type {index + 1}
                        </label>
                        <input
                          id={`package-ammo-quantity-${index}`}
                          type="number"
                          min="1"
                          step="1"
                          value={ammoItem.ammoQuantity}
                          onChange={(event) =>
                            handleAmmoItemChange(
                              index,
                              "ammoQuantity",
                              event.target.value
                            )
                          }
                          placeholder="Quantity"
                          required
                        />
                        {packageForm.ammoItems.length > 1 && (
                          <button
                            className="package-remove-ammo-button"
                            type="button"
                            aria-label={`Remove ammo type ${index + 1}`}
                            onClick={() => removeAmmoItem(index)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="package-form-group">
                  <label htmlFor="package-target-board-quantity">
                    {targetBoardItem.name} quantity
                  </label>
                  <input
                    id="package-target-board-quantity"
                    name="targetBoardQuantity"
                    type="number"
                    min="1"
                    step="1"
                    value={packageForm.targetBoardQuantity}
                    onChange={handleChange}
                    placeholder="Enter number of target boards"
                    required
                  />
                  <small>Quantity only; target board price is not included.</small>
                </div>

                <div className="package-form-group package-form-full">
                  <label htmlFor="package-details">Details</label>
                  <textarea
                    id="package-details"
                    name="details"
                    value={packageForm.details}
                    onChange={handleChange}
                    placeholder="Describe what is included in this package"
                    rows="3"
                    required
                  />
                </div>

                <div className="package-form-group">
                  <label htmlFor="package-price">Price</label>
                  <input
                    id="package-price"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={packageForm.price}
                    onChange={handleChange}
                    placeholder="Enter package price"
                    required
                  />
                </div>
              </div>

              {formError && (
                <p className="package-form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="package-form-actions">
                <button
                  type="button"
                  className="package-cancel-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="package-save-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingPackageId
                    ? "Save changes"
                    : "Save package"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
