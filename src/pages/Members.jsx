import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase";
import "../styles/members.css";

const MEMBERSHIP_PRICES = {
  Regular: 5000,
  Gold: 10000,
  Diamond: 15000,
};

const MEMBERS_COLLECTION = "sureshotsMembers";

const EMPTY_MEMBER_FORM = {
  memberName: "",
  memberNumber: "",
  memberPhoneNumber: "",
  membershipType: "",
  expirationDate: "",
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);

const formatDate = (dateString) => {
  if (!dateString) {
    return "Not set";
  }

  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Not set"
    : date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

export default function Members() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
  const [printingMember, setPrintingMember] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);

  const fetchMembers = async () => {
    const snapshot = await getDocs(collection(db, MEMBERS_COLLECTION));
    const memberList = snapshot.docs.map((memberDoc) => ({
      id: memberDoc.id,
      ...memberDoc.data(),
    }));

    memberList.sort((first, second) =>
      (first.memberName || "").localeCompare(second.memberName || "")
    );
    setMembers(memberList);
  };

  useEffect(() => {
    const loadMembers = async () => {
      try {
        await fetchMembers();
      } catch (loadError) {
        console.error("Error fetching members:", loadError);
        setPageError("Unable to load members. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadMembers();
  }, []);

  useEffect(() => {
    if (!printingMember) {
      return;
    }

    const originalTitle = document.title;
    document.title = `Membership - ${printingMember.memberName || "Member"}`;

    const handleAfterPrint = () => {
      document.title = originalTitle;
      setPrintingMember(null);
    };

    window.addEventListener("afterprint", handleAfterPrint);
    const printTimeout = window.setTimeout(() => window.print(), 100);

    return () => {
      window.clearTimeout(printTimeout);
      window.removeEventListener("afterprint", handleAfterPrint);
      document.title = originalTitle;
    };
  }, [printingMember]);

  useEffect(() => {
    if (!openMenuId) {
      return;
    }

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

  const filteredMembers = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase();
    if (!searchTerm) {
      return members;
    }

    return members.filter((member) =>
      [
        member.memberName,
        member.memberNumber,
        member.memberPhoneNumber,
        member.membershipType,
      ].some((value) =>
        (value || "").toLocaleLowerCase().includes(searchTerm)
      )
    );
  }, [members, search]);

  const membershipSummary = useMemo(
    () =>
      Object.entries(MEMBERSHIP_PRICES).map(([type]) => {
        const tierMembers = members.filter(
          (member) => member.membershipType === type
        );

        return {
          type,
          count: tierMembers.length,
          sales: tierMembers.reduce((total, member) => {
            const price = Number(member.membershipPrice);
            return Number.isFinite(price) ? total + price : total;
          }, 0),
        };
      }),
    [members]
  );

  const openAddForm = () => {
    setEditingMember(null);
    setMemberForm(EMPTY_MEMBER_FORM);
    setFormError("");
    setPageError("");
    setShowForm(true);
  };

  const openEditForm = (member) => {
    setEditingMember(member);
    setMemberForm({
      memberName: member.memberName || "",
      memberNumber: member.memberNumber || "",
      memberPhoneNumber: member.memberPhoneNumber || "",
      membershipType: member.membershipType || "",
      expirationDate: member.expirationDate || "",
    });
    setFormError("");
    setPageError("");
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) {
      return;
    }
    setShowForm(false);
    setEditingMember(null);
    setMemberForm(EMPTY_MEMBER_FORM);
    setFormError("");
  };

  const handleMemberChange = (event) => {
    const { name, value } = event.target;
    setMemberForm((current) => ({ ...current, [name]: value }));
    setFormError("");
  };

  const handleSaveMember = async (event) => {
    event.preventDefault();
    setFormError("");

    const memberName = memberForm.memberName.trim();
    const memberNumber = memberForm.memberNumber.trim();
    const memberPhoneNumber = memberForm.memberPhoneNumber.trim();
    const membershipType = memberForm.membershipType;
    const expirationDate = memberForm.expirationDate;

    if (!memberName || !memberNumber || !memberPhoneNumber || !expirationDate) {
      setFormError("Complete all member details before saving.");
      return;
    }

    const membershipPrice = MEMBERSHIP_PRICES[membershipType];
    if (!membershipPrice) {
      setFormError("Select a membership type.");
      return;
    }

    const duplicate = members.find(
      (member) =>
        member.id !== editingMember?.id &&
        (member.memberNumber || "").trim().toLocaleLowerCase() ===
          memberNumber.toLocaleLowerCase()
    );
    if (duplicate) {
      setFormError("This member number already exists.");
      return;
    }

    setSaving(true);
    try {
      if (editingMember) {
        await updateDoc(doc(db, MEMBERS_COLLECTION, editingMember.id), {
          memberName,
          memberNumber,
          memberPhoneNumber,
          membershipType,
          membershipPrice,
          expirationDate,
        });
      } else {
        await addDoc(collection(db, MEMBERS_COLLECTION), {
          memberName,
          memberNumber,
          memberPhoneNumber,
          membershipType,
          membershipPrice,
          expirationDate,
          createdAt: serverTimestamp(),
        });
      }

      await fetchMembers();
      setShowForm(false);
      setEditingMember(null);
      setMemberForm(EMPTY_MEMBER_FORM);
      setPageError("");
    } catch (saveError) {
      console.error("Error saving member:", saveError);
      setFormError("Unable to save this member. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (member) => {
    const confirmed = window.confirm(
      `Delete ${member.memberName} from Sureshots members?`
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteDoc(doc(db, MEMBERS_COLLECTION, member.id));
      await fetchMembers();
      setPageError("");
    } catch (deleteError) {
      console.error("Error deleting member:", deleteError);
      setPageError("Unable to delete this member. Please try again.");
    }
  };

  const selectedMember = members.find((member) => member.id === openMenuId);

  return (
    <div className="members-page">
      <header className="members-header">
        <div>
          <p className="members-eyebrow">MEMBERSHIP MANAGEMENT</p>
          <h1>Members</h1>
          <p className="members-subtitle">
            Manage member details, membership tiers, and membership sales.
          </p>
        </div>
        <button
          type="button"
          className="members-add-button"
          onClick={openAddForm}
        >
          <span aria-hidden="true">+</span> Add Member
        </button>
      </header>

      <section className="membership-summary" aria-label="Membership sales totals">
        {membershipSummary.map((summary) => (
          <article
            className={`membership-summary-card membership-${summary.type.toLowerCase()}`}
            key={summary.type}
          >
            <div className="membership-summary-heading">
              <span className="membership-tier-dot" />
              <h2>{summary.type}</h2>
            </div>
            <p className="membership-summary-count">
              {summary.count} {summary.count === 1 ? "member" : "members"}
            </p>
            <strong>{formatCurrency(summary.sales)}</strong>
            <span className="membership-summary-caption">Saved membership sales</span>
          </article>
        ))}
      </section>

      <section className="members-list-panel">
        <div className="members-list-header">
          <div>
            <h2>Member directory</h2>
            <p>
              Showing {filteredMembers.length} of {members.length} members
            </p>
          </div>
          <label className="members-search">
            <span className="visually-hidden">Search members</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, number, phone, or tier"
            />
          </label>
        </div>

        {selectedMember && menuPosition &&
          createPortal(
            <div
              className="member-action-menu"
              role="menu"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  openEditForm(selectedMember);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPrintingMember(selectedMember);
                  setOpenMenuId(null);
                  setMenuPosition(null);
                }}
              >
                Print / Save as PDF
              </button>
              <button
                className="member-menu-delete-item"
                type="button"
                role="menuitem"
                onClick={() => handleDeleteMember(selectedMember)}
              >
                Delete
              </button>
            </div>,
            document.body
          )}

        {pageError && (
          <p className="members-error" role="alert">
            {pageError}
          </p>
        )}

        {loading ? (
          <div className="members-message">Loading members...</div>
        ) : members.length === 0 ? (
          <div className="members-message">
            <strong>No members yet</strong>
            <span>Add a member to start managing memberships.</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="members-message">No members match your search.</div>
        ) : (
          <div className="members-table-wrap">
            <table className="members-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Membership</th>
                  <th>Phone number</th>
                  <th>Expiration date</th>
                  <th>Price</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-identity">
                        <span className="member-initial">
                          {member.memberName?.charAt(0)?.toUpperCase() || "M"}
                        </span>
                        <span>
                          <strong>{member.memberName || "Unnamed member"}</strong>
                          <small>No. {member.memberNumber || "-"}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {member.membershipType ? (
                        <span
                          className={`membership-badge membership-badge-${member.membershipType.toLowerCase()}`}
                        >
                          {member.membershipType}
                        </span>
                      ) : (
                        <span className="members-muted">Not set</span>
                      )}
                    </td>
                    <td>{member.memberPhoneNumber || "Not set"}</td>
                    <td>{formatDate(member.expirationDate)}</td>
                    <td className="member-price">
                      {Number.isFinite(Number(member.membershipPrice)) &&
                      member.membershipPrice !== undefined
                        ? formatCurrency(Number(member.membershipPrice))
                        : "Not set"}
                    </td>
                    <td>
                      <button
                        className="member-three-dot-btn"
                        type="button"
                        aria-label={`Actions for ${member.memberName}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === member.id}
                        onClick={(event) => {
                          if (openMenuId === member.id) {
                            setOpenMenuId(null);
                            setMenuPosition(null);
                            return;
                          }

                          const buttonRect =
                            event.currentTarget.getBoundingClientRect();
                          const menuWidth = 200;
                          const menuHeight = 140;
                          const top =
                            buttonRect.bottom + menuHeight + 8 >
                            window.innerHeight
                              ? buttonRect.top - menuHeight - 4
                              : buttonRect.bottom + 4;

                          setMenuPosition({
                            top: Math.max(
                              8,
                              Math.min(
                                top,
                                window.innerHeight - menuHeight - 8
                              )
                            ),
                            left: Math.max(
                              8,
                              Math.min(
                                buttonRect.right - menuWidth,
                                window.innerWidth - menuWidth - 8
                              )
                            ),
                          });
                          setOpenMenuId(member.id);
                        }}
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="members-modal-overlay" onMouseDown={closeForm}>
          <section
            className="members-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="members-modal-header">
              <div>
                <p className="members-eyebrow">MEMBERSHIP DETAILS</p>
                <h2 id="member-form-title">
                  {editingMember ? "Edit member" : "Add a member"}
                </h2>
                <p>
                  {editingMember
                    ? "Update member information and membership tier."
                    : "Enter the member details and select a membership tier."}
                </p>
              </div>
              <button
                type="button"
                className="members-modal-close"
                aria-label="Close"
                onClick={closeForm}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveMember}>
              <div className="members-form-grid">
                <div className="members-form-group">
                  <label htmlFor="member-name">Member name</label>
                  <input
                    id="member-name"
                    type="text"
                    name="memberName"
                    value={memberForm.memberName}
                    onChange={handleMemberChange}
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div className="members-form-group">
                  <label htmlFor="member-number">Member number</label>
                  <input
                    id="member-number"
                    type="text"
                    name="memberNumber"
                    value={memberForm.memberNumber}
                    onChange={handleMemberChange}
                    placeholder="Enter member number"
                    required
                  />
                </div>

                <div className="members-form-group">
                  <label htmlFor="member-phone">Phone number</label>
                  <input
                    id="member-phone"
                    type="tel"
                    name="memberPhoneNumber"
                    value={memberForm.memberPhoneNumber}
                    onChange={handleMemberChange}
                    placeholder="Enter phone number"
                    required
                  />
                </div>

                <div className="members-form-group">
                  <label htmlFor="membership-type">Membership type</label>
                  <select
                    id="membership-type"
                    name="membershipType"
                    value={memberForm.membershipType}
                    onChange={handleMemberChange}
                    required
                  >
                    <option value="" disabled>
                      Select membership type
                    </option>
                    {Object.keys(MEMBERSHIP_PRICES).map((type) => (
                      <option value={type} key={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="members-form-group">
                  <label htmlFor="membership-price">Membership price</label>
                  <input
                    id="membership-price"
                    type="text"
                    value={
                      memberForm.membershipType
                        ? formatCurrency(
                            MEMBERSHIP_PRICES[memberForm.membershipType]
                          )
                        : "Select a membership type"
                    }
                    readOnly
                    aria-readonly="true"
                  />
                  <small>Price is set automatically from the selected tier.</small>
                </div>

                <div className="members-form-group">
                  <label htmlFor="expiration-date">Expiration date</label>
                  <input
                    id="expiration-date"
                    type="date"
                    name="expirationDate"
                    value={memberForm.expirationDate}
                    onChange={handleMemberChange}
                    required
                  />
                </div>
              </div>

              {formError && (
                <p className="members-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="members-modal-actions">
                <button
                  type="button"
                  className="members-cancel-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="members-save-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingMember
                    ? "Save changes"
                    : "Save member"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {printingMember && (
        <article className="members-print-sheet">
          <header className="members-print-header">
            <p>SURESHOTS MEMBERSHIP</p>
            <h1>Membership Details</h1>
          </header>
          <section className="members-print-section">
            <h2>{printingMember.memberName || "Unnamed member"}</h2>
            <dl className="members-print-grid">
              <div>
                <dt>Member number</dt>
                <dd>{printingMember.memberNumber || "-"}</dd>
              </div>
              <div>
                <dt>Membership type</dt>
                <dd>{printingMember.membershipType || "Not set"}</dd>
              </div>
              <div>
                <dt>Phone number</dt>
                <dd>{printingMember.memberPhoneNumber || "Not set"}</dd>
              </div>
              <div>
                <dt>Expiration date</dt>
                <dd>{formatDate(printingMember.expirationDate)}</dd>
              </div>
              <div>
                <dt>Membership price</dt>
                <dd>
                  {Number.isFinite(Number(printingMember.membershipPrice)) &&
                  printingMember.membershipPrice !== undefined
                    ? formatCurrency(Number(printingMember.membershipPrice))
                    : "Not set"}
                </dd>
              </div>
            </dl>
          </section>
        </article>
      )}
    </div>
  );
}
