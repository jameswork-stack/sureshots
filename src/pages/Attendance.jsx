import { useEffect, useRef, useState } from "react";
import "../styles/attendance.css";
import { db } from "../firebase";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";

const PH_ZONE = "Asia/Manila";
const phDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const phTime = (date, seconds = false) => new Intl.DateTimeFormat("en-US", {
  timeZone: PH_ZONE, hour: "numeric", minute: "2-digit",
  ...(seconds ? { second: "2-digit" } : {}), hour12: true,
}).format(date).replace(/\s+/g, " ");
const isOpen = (record) => Boolean(record?.timeIn && !record.timeOut && record.status === "Present");

export default function Attendance() {
  const [clock, setClock] = useState(() => new Date());
  const [attendanceReady, setAttendanceReady] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const punchLock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => onSnapshot(
    query(collection(db, "attendance"), orderBy("createdAt", "desc")),
    { includeMetadataChanges: true },
    (snapshot) => {
      const records = snapshot.docs.map((item) => ({id: item.id, ...item.data()}));
      records.sort((a,b) => (b.date || "").localeCompare(a.date || ""));
      setAttendanceRecords(records);
      setAttendanceReady(!snapshot.metadata.fromCache);
      setAttendanceError("");
    },
    (error) => { setAttendanceReady(false); setAttendanceError(error.message); }
  ), []);

  const [members, setMembers] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceMemberFilter, setAttendanceMemberFilter] = useState("");
  const [attendanceMonth, setAttendanceMonth] = useState(() => phDate(new Date()).slice(0, 7));
  const [viewingMemberAttendance, setViewingMemberAttendance] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState(null);

  const [openMenuId, setOpenMenuId] = useState(null);

  const [memberForm, setMemberForm] = useState({
    memberName: "",
    memberNumber: "",
  });

  const [showAttendanceForm, setShowAttendanceForm] =
    useState(false);

  const [attendanceForm, setAttendanceForm] = useState({
    member: null,
    action: "",
    date: "",
  });

  // =========================
  // FETCH MEMBERS
  // =========================

  const fetchMembers = async () => {
    try {
      const snapshot = await getDocs(
        collection(db, "members")
      );

      const memberList = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      memberList.sort((a, b) =>
        (a.memberName || "").localeCompare(
          b.memberName || ""
        )
      );

      setMembers(memberList);
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  // =========================
  // FETCH ATTENDANCE
  // =========================

  const fetchAttendance = async () => {
    try {
      const attendanceRef = collection(
        db,
        "attendance"
      );

      const q = query(
        attendanceRef,
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);

      const records = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      records.sort((a, b) =>
        (b.date || "").localeCompare(a.date || "")
      );

      setAttendanceRecords(records);
    } catch (error) {
      console.error(
        "Error fetching attendance:",
        error
      );
    }
  };

  // =========================
  // LOAD DATA
  // =========================

  const loadData = async () => {
    try {
      setLoading(true);

      await Promise.all([
        fetchMembers(),
        fetchAttendance(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // =========================
  // MEMBER INPUT
  // =========================

  const handleMemberChange = (e) => {
    const { name, value } = e.target;

    setMemberForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // =========================
  // OPEN ADD MEMBER
  // =========================

  const openAddMember = () => {
    setEditingMemberId(null);

    setMemberForm({
      memberName: "",
      memberNumber: "",
    });

    setShowMemberForm(true);
  };

  // =========================
  // OPEN EDIT MEMBER
  // =========================

  const openEditMember = (member) => {
    setEditingMemberId(member.id);

    setMemberForm({
      memberName: member.memberName || "",
      memberNumber: member.memberNumber || "",
    });

    setOpenMenuId(null);
    setShowMemberForm(true);
  };

  // =========================
  // SAVE MEMBER
  // =========================

  const handleSaveMember = async (e) => {
    e.preventDefault();

    if (!memberForm.memberName.trim()) {
      alert("Please enter the member name.");
      return;
    }

    if (!memberForm.memberNumber.trim()) {
      alert("Please enter the member number.");
      return;
    }

    try {
      setSaving(true);

      // Check duplicate member number
      const duplicate = members.find(
        (member) =>
          member.id !== editingMemberId &&
          member.memberNumber
            ?.trim()
            .toLowerCase() ===
            memberForm.memberNumber
              .trim()
              .toLowerCase()
      );

      if (duplicate) {
        alert("This member number already exists.");
        return;
      }

      // =========================
      // EDIT
      // =========================

      if (editingMemberId) {
        await updateDoc(
          doc(
            db,
            "members",
            editingMemberId
          ),
          {
            memberName:
              memberForm.memberName.trim(),
            memberNumber:
              memberForm.memberNumber.trim(),
          }
        );

        // Update existing attendance records
        // so the historical records keep the
        // latest member information.
        const memberAttendance =
          attendanceRecords.filter(
            (record) =>
              record.memberId ===
              editingMemberId
          );

        for (const record of memberAttendance) {
          await updateDoc(
            doc(
              db,
              "attendance",
              record.id
            ),
            {
              memberName:
                memberForm.memberName.trim(),
              memberNumber:
                memberForm.memberNumber.trim(),
            }
          );
        }

        alert("Member updated successfully.");
      }

      // =========================
      // ADD
      // =========================

      else {
        await addDoc(
          collection(db, "members"),
          {
            memberName:
              memberForm.memberName.trim(),
            memberNumber:
              memberForm.memberNumber.trim(),
            createdAt: serverTimestamp(),
          }
        );

        alert("Member added successfully.");
      }

      setMemberForm({
        memberName: "",
        memberNumber: "",
      });

      setEditingMemberId(null);
      setShowMemberForm(false);

      await fetchMembers();
      await fetchAttendance();

    } catch (error) {
      console.error(
        "Error saving member:",
        error
      );

      alert("Failed to save member.");
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // DELETE MEMBER
  // =========================

  const handleDeleteMember = async (member) => {
    setOpenMenuId(null);

    const confirmed = window.confirm(
      `Are you sure you want to delete ${member.memberName}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteDoc(
        doc(db, "members", member.id)
      );

      await fetchMembers();

      alert("Member deleted successfully.");
    } catch (error) {
      console.error(
        "Error deleting member:",
        error
      );

      alert("Failed to delete member.");
    }
  };

  // =========================
  // OPEN ATTENDANCE FORM
  // =========================

  const openAttendanceForm = (member, action) => {
    const today = phDate(new Date());

    setAttendanceForm({
      member,
      action,
      date: today,
      });

    setShowAttendanceForm(true);
  };

  // =========================
  // CLOSE ATTENDANCE FORM
  // =========================

  const closeAttendanceForm = () => {
    setShowAttendanceForm(false);

    setAttendanceForm({
      member: null,
      action: "",
      date: "",
      });
  };

  // =========================
  // FORMAT DATE
  // =========================

  const formatDate = (date) => {
    if (!date) return "-";

    const parts = date.split("-");

    if (parts.length !== 3) {
      return date;
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    const dateObject = new Date(
      year,
      month - 1,
      day
    );

    return dateObject.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // =========================
  // FIND ATTENDANCE
  // =========================

  const getAttendanceForMemberDate = (
    memberId,
    date
  ) => {
    return attendanceRecords.find(
      (record) =>
        record.memberId === memberId &&
        record.date === date
    );
  };

  const attendanceMembers = [
    ...new Map(
      attendanceRecords.map((record) => [
        record.memberId,
        {
          id: record.memberId,
          name: record.memberName || "Unknown member",
          number: record.memberNumber || "",
        },
      ])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const filteredAttendanceRecords = attendanceRecords.filter((record) =>
    (!attendanceMemberFilter || record.memberId === attendanceMemberFilter) &&
    (!attendanceMonth || (typeof record.date === "string" && record.date.slice(0, 7) === attendanceMonth))
  );

  const recordPunch = async (member, action) => {
    if (punchLock.current || saving || !attendanceReady) return;
    punchLock.current = true;
    setSaving(true);
    const now = new Date();
    const date = phDate(now);
    const time = phTime(now);
    const memberRef = doc(db, "members", member.id);
    const newRef = doc(collection(db, "attendance"));
    const legacy = attendanceRecords.find(r => r.memberId === member.id && isOpen(r));
    try {
      await runTransaction(db, async (tx) => {
        const memberSnap = await tx.get(memberRef);
        if (!memberSnap.exists()) throw new Error("Member no longer exists.");
        const memberData = memberSnap.data();
        const ids = [...new Set([memberData.activeAttendanceId, legacy?.id].filter(Boolean))];
        const refs = ids.map(id => doc(db, "attendance", id));
        const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
        const active = snapshots.find(snap => snap.exists() && snap.data().memberId === member.id && isOpen(snap.data()));
        if (action === "Time In") {
          if (active) throw new Error("Record Time Out before another Time In.");
          if (attendanceRecords.some(r => r.memberId === member.id && r.date === date && ["Absent", "Rest Day"].includes(r.status))) {
            throw new Error("This member is marked Absent or Rest Day today.");
          }
          tx.set(newRef, {
            memberId: member.id,
            memberName: memberData.memberName || member.memberName || "",
            memberNumber: memberData.memberNumber || member.memberNumber || "",
            date, timeIn: time, timeOut: "", status: "Present",
            createdAt: serverTimestamp(), timeInAt: serverTimestamp(),
          });
          tx.update(memberRef, { activeAttendanceId: newRef.id });
        } else {
          if (!active) throw new Error("No active Time In was found.");
          tx.update(active.ref, {
            timeOut: time, timeOutDate: date,
            timeOutAt: serverTimestamp(), status: "Completed",
          });
          tx.update(memberRef, { activeAttendanceId: null });
        }
      });
      await fetchAttendance();
    } catch (error) {
      console.error("Attendance punch failed:", error);
      alert(error.message || "Unable to record attendance.");
    } finally {
      punchLock.current = false;
      setSaving(false);
    }
  };

  // =========================
  // SUBMIT ATTENDANCE
  // =========================

  const handleAttendanceSubmit = async (e) => {
    e.preventDefault();

    const {
      member,
      action,
      date,
    } = attendanceForm;

    if (!member) {
      alert("Member information is missing.");
      return;
    }

    if (!date) {
      alert("Please select a date.");
      return;
    }

    // =========================
    // ABSENT / REST DAY
    // =========================

    if (action === "Absent" || action === "Rest Day") {
      if (!attendanceReady || attendanceRecords.some(r => r.memberId === member.id && isOpen(r))) {
        alert("Attendance must be synced and Time Out recorded first.");
        return;
      }
      const existingRecord =
        getAttendanceForMemberDate(
          member.id,
          date
        );

      if (existingRecord) {
        alert(
          "This member already has an attendance record for this date."
        );
        return;
      }

      const confirmed = window.confirm(
        action === "Absent"
          ? `Mark ${member.memberName} as absent on ${formatDate(date)}?`
          : `Mark ${member.memberName} as Rest Day on ${formatDate(date)}?`
      );

      if (!confirmed) {
        return;
      }

      try {
        setSaving(true);

        await addDoc(
          collection(db, "attendance"),
          {
            memberId: member.id,
            memberName: member.memberName,
            memberNumber: member.memberNumber,
            date: date,
            timeIn: "",
            timeOut: "",
            status: action,
            createdAt: serverTimestamp(),
          }
        );

        closeAttendanceForm();

        await fetchAttendance();

        alert(
          action === "Absent"
            ? "Member marked as absent."
            : "Member marked as Rest Day."
        );
      } catch (error) {
        console.error(
          `Error recording ${action}:`,
          error
        );

        alert(
          action === "Absent"
            ? "Failed to mark member as absent."
            : "Failed to mark member as Rest Day."
        );
      } finally {
        setSaving(false);
      }
    }
  };

  // =========================
  // DELETE ATTENDANCE
  // =========================

  const handleDeleteAttendance = async (
    id
  ) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this attendance record?"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(
        doc(db, "attendance", id)
      );

      await fetchAttendance();

      alert("Attendance record deleted.");
    } catch (error) {
      console.error(
        "Error deleting attendance:",
        error
      );

      alert(
        "Failed to delete attendance record."
      );
    }
  };

  const handleViewMemberAttendance = (member) => {
    setViewingMemberAttendance(member);
    setOpenMenuId(null);
  };

  if (viewingMemberAttendance) {
    const memberRecords = attendanceRecords.filter(
      (record) => record.memberId === viewingMemberAttendance.id
    );

    return (
      <div className="attendance-page">
        <div className="attendance-header">
          <div>
            <h1>{viewingMemberAttendance.memberName}'s Attendance</h1>
            <p>
              Member No: {viewingMemberAttendance.memberNumber || "-"} ·{" "}
              {memberRecords.length} records
            </p>
          </div>
          <button
            className="add-member-btn attendance-back-btn"
            onClick={() => setViewingMemberAttendance(null)}
          >
            Back to Members
          </button>
        </div>

        <div className="attendance-records-section">
          {loading ? (
            <div className="attendance-message">
              Loading attendance records...
            </div>
          ) : memberRecords.length === 0 ? (
            <div className="attendance-message">
              No attendance records for this member yet.
            </div>
          ) : (
            <div className="attendance-table-container">
              <table className="attendance-table member-attendance-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {memberRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.date)}</td>
                      <td>{record.timeIn || "-"}</td>
                      <td>{record.timeOut || "-"}{record.timeOutDate && record.timeOutDate !== record.date ? ` (${formatDate(record.timeOutDate)})` : ""}</td>
                      <td>
                        <span
                          className={`attendance-status ${
                            record.status === "Absent"
                              ? "absent"
                              : record.status === "Rest Day"
                              ? "rest-day"
                              : record.status === "Completed"
                              ? "completed"
                              : "present"
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="delete-attendance-btn"
                          onClick={() => handleDeleteAttendance(record.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="attendance-page">

      {/* HEADER */}

      <div className="attendance-header">

        <div>
          <h1>Attendance</h1>

          <p>
            Manage member attendance and daily
            attendance records.
          </p>
        </div>

        <button
          className="add-member-btn"
          onClick={openAddMember}
        >
          + Add Member
        </button>

      </div>

      {attendanceError && <p role="alert">Unable to sync attendance: {attendanceError}</p>}
      {!attendanceReady && !attendanceError && <p role="status">Connecting to attendance records...</p>}
      {/* MEMBERS */}

      <div className="members-section">

        <div className="attendance-live-clock attendance-members-clock">
          <span>Philippine Time (UTC+8)</span>
          <strong>{phTime(clock, true)}</strong>
          <small>{new Intl.DateTimeFormat("en-PH", {timeZone: PH_ZONE, dateStyle: "full"}).format(clock)}</small>
        </div>

        <div className="section-header">

          <div>
            <h2>Members</h2>

            <p>
              {members.length} registered members
            </p>
          </div>

        </div>

        {loading ? (
          <div className="attendance-message">
            Loading members...
          </div>
        ) : members.length === 0 ? (
          <div className="attendance-message">
            No members registered yet.
          </div>
        ) : (
          <div className="member-grid">

            {members.map((member) => {
              const activeRecord = attendanceRecords.find(r => r.memberId === member.id && isOpen(r));
              const todayRecord = attendanceRecords.find(r => r.memberId === member.id && r.date === phDate(clock));
              const blocked = todayRecord && ["Absent", "Rest Day"].includes(todayRecord.status);
              return (

              <div
                className="member-card"
                key={member.id}
              >

                {/* MEMBER MENU */}

                <div className="member-menu-wrapper">

                  <button
                    className="member-menu-btn"
                    onClick={() =>
                      setOpenMenuId(
                        openMenuId === member.id
                          ? null
                          : member.id
                      )
                    }
                  >
                    ⋮
                  </button>

                  {openMenuId === member.id && (
                    <div className="member-dropdown">

                      <button
                        onClick={() =>
                          handleViewMemberAttendance(member)
                        }
                      >
                        View
                      </button>

                      <button
                        onClick={() =>
                          openEditMember(
                            member
                          )
                        }
                      >
                        Edit
                      </button>

                      <button
                        className="delete-member-option"
                        onClick={() =>
                          handleDeleteMember(
                            member
                          )
                        }
                      >
                        Delete
                      </button>

                    </div>
                  )}

                </div>

                {/* MEMBER INFORMATION */}

                <div className="member-card-info">

                  <div className="member-avatar">
                    {member.memberName
                      ?.charAt(0)
                      ?.toUpperCase() || "M"}
                  </div>

                  <div>

                    <h3>
                      {member.memberName}
                    </h3>

                    <p>
                      Member No:{" "}
                      <strong>
                        {member.memberNumber}
                      </strong>
                    </p>

                  </div>

                </div>

                <p className="attendance-punch-status">
                  {activeRecord ? `Timed in: ${activeRecord.timeIn}` : blocked ? todayRecord.status : "Not timed in"}
                </p>
                {/* ATTENDANCE BUTTONS */}

                <div className="member-actions">

                  <button type="button" className="time-in-btn"
                    disabled={saving || !attendanceReady || Boolean(activeRecord) || Boolean(blocked)}
                    onClick={() => recordPunch(member, "Time In")}>
                    Time In
                  </button>
                  <button type="button" className="time-out-btn"
                    disabled={saving || !attendanceReady || !activeRecord}
                    onClick={() => recordPunch(member, "Time Out")}>
                    Time Out
                  </button>



                </div>

              </div>

            ); })}

          </div>
        )}

      </div>

      {/* ATTENDANCE RECORDS */}

      <div className="attendance-records-section">

        <div className="section-header">

          <div>
            <h2>Attendance Records</h2>

            <p>
              View and filter member attendance records.
            </p>
          </div>

          <div className="attendance-record-controls">
            <label htmlFor="attendance-month-filter">Filter by month</label>
            <input
              id="attendance-month-filter"
              type="month"
              value={attendanceMonth}
              onChange={(event) => setAttendanceMonth(event.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: "8px", font: "inherit" }}
            />
            <button type="button" onClick={() => setAttendanceMonth(phDate(new Date()).slice(0, 7))}>Current Month</button>
            <label htmlFor="attendance-member-filter">
              Filter by member
            </label>
            <select
              id="attendance-member-filter"
              value={attendanceMemberFilter}
              onChange={(event) =>
                setAttendanceMemberFilter(event.target.value)
              }
            >
              <option value="">All members</option>
              {attendanceMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.number ? ` (${member.number})` : ""}
                </option>
              ))}
            </select>
            <span className="record-count">
              {filteredAttendanceRecords.length} records
            </span>
          </div>

        </div>

        {loading ? (
          <div className="attendance-message">
            Loading attendance records...
          </div>
        ) : attendanceRecords.length === 0 ? (
          <div className="attendance-message">
            No attendance records yet.
          </div>
        ) : filteredAttendanceRecords.length === 0 ? (
          <div className="attendance-message">
            No attendance records found for the selected filters.
          </div>
        ) : (
          <div className="attendance-table-container">

            <table className="attendance-table">

              <thead>
                <tr>
                  <th>Member</th>
                  <th>Member Number</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {filteredAttendanceRecords.map(
                  (record) => (

                    <tr key={record.id}>

                      <td>
                        <strong>
                          {record.memberName}
                        </strong>
                      </td>

                      <td>
                        {record.memberNumber}
                      </td>

                      <td>
                        {formatDate(
                          record.date
                        )}
                      </td>

                      <td>
                        {record.timeIn || "-"}
                      </td>

                      <td>
                        {record.timeOut || "-"}{record.timeOutDate && record.timeOutDate !== record.date ? ` (${formatDate(record.timeOutDate)})` : ""}
                      </td>

                      <td>

                        <span
                          className={`attendance-status ${
                            record.status ===
                            "Absent"
                              ? "absent"
                              : record.status ===
                                "Rest Day"
                              ? "rest-day"
                              : record.status ===
                                "Completed"
                              ? "completed"
                              : "present"
                          }`}
                        >
                          {record.status}
                        </span>

                      </td>

                      <td>

                        <button
                          className="delete-attendance-btn"
                          onClick={() =>
                            handleDeleteAttendance(
                              record.id
                            )
                          }
                        >
                          Delete
                        </button>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>
        )}

      </div>

      {/* ADD / EDIT MEMBER MODAL */}

      {showMemberForm && (

        <div className="modal-overlay">

          <div className="attendance-modal">

            <div className="modal-header">

              <div>

                <h2>
                  {editingMemberId
                    ? "Edit Member"
                    : "Add Member"}
                </h2>

                <p>
                  {editingMemberId
                    ? "Update member information."
                    : "Register a new member."}
                </p>

              </div>

              <button
                className="modal-close"
                onClick={() => {
                  setShowMemberForm(false);
                  setEditingMemberId(null);
                }}
              >
                ×
              </button>

            </div>

            <form
              onSubmit={handleSaveMember}
            >

              <div className="form-group">

                <label>
                  Member Name
                </label>

                <input
                  type="text"
                  name="memberName"
                  value={
                    memberForm.memberName
                  }
                  onChange={
                    handleMemberChange
                  }
                  placeholder="Enter member name"
                />

              </div>

              <div className="form-group">

                <label>
                  Member Number
                </label>

                <input
                  type="text"
                  name="memberNumber"
                  value={
                    memberForm.memberNumber
                  }
                  onChange={
                    handleMemberChange
                  }
                  placeholder="Enter member number"
                />

              </div>

              <div className="modal-actions">

                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {
                    setShowMemberForm(false);
                    setEditingMemberId(null);
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="save-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingMemberId
                    ? "Update Member"
                    : "Save Member"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

      {/* ATTENDANCE MODAL */}

      {showAttendanceForm &&
        attendanceForm.member && (

          <div className="modal-overlay">

            <div className="attendance-modal">

              <div className="modal-header">

                <div>

                  <h2>
                    {attendanceForm.action}
                  </h2>

                  <p>
                    {
                      attendanceForm.member
                        .memberName
                    }
                  </p>

                </div>

                <button
                  className="modal-close"
                  onClick={
                    closeAttendanceForm
                  }
                >
                  ×
                </button>

              </div>

              <form
                onSubmit={
                  handleAttendanceSubmit
                }
              >

                <div className="selected-member">

                  <div>

                    <span>
                      Member Name
                    </span>

                    <strong>
                      {
                        attendanceForm
                          .member
                          .memberName
                      }
                    </strong>

                  </div>

                  <div>

                    <span>
                      Member Number
                    </span>

                    <strong>
                      {
                        attendanceForm
                          .member
                          .memberNumber
                      }
                    </strong>

                  </div>

                </div>

                <div className="form-group">

                  <label>
                    Date
                  </label>

                  <input
                    type="date"
                    value={
                      attendanceForm.date
                    }
                    onChange={(e) =>
                      setAttendanceForm(
                        (prev) => ({
                          ...prev,
                          date: e.target.value,
                        })
                      )
                    }
                    required
                  />

                </div>

                {(attendanceForm.action === "Absent" ||
                  attendanceForm.action === "Rest Day") && (

                  <div
                    className={
                      attendanceForm.action === "Absent"
                        ? "absent-notice"
                        : "rest-day-notice"
                    }
                  >

                    <strong>
                      {attendanceForm.action === "Absent"
                        ? "Mark as Absent"
                        : "Mark as Rest Day"}
                    </strong>

                    <p>
                      No Time In or Time Out is required.
                    </p>

                  </div>

                )}

                <div className="modal-actions">

                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={
                      closeAttendanceForm
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className={
                      attendanceForm.action === "Absent"
                        ? "save-absent-btn"
                        : attendanceForm.action === "Rest Day"
                        ? "save-rest-day-btn"
                        : "save-btn"
                    }
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : attendanceForm.action === "Absent"
                      ? "Mark Absent"
                      : attendanceForm.action === "Rest Day"
                      ? "Mark Rest Day"
                      : `Save ${attendanceForm.action}`}
                  </button>

                </div>

              </form>

            </div>

          </div>

        )}

    </div>
  );
}