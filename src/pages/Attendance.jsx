import { useEffect, useState } from "react";
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
} from "firebase/firestore";

export default function Attendance() {
  const [members, setMembers] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);

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
    time: "",
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
    const today = new Date()
      .toISOString()
      .split("T")[0];

    setAttendanceForm({
      member,
      action,
      date: today,
      time: "",
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
      time: "",
    });
  };

  // =========================
  // FORMAT TIME
  // =========================

  const formatTime12Hour = (time) => {
    if (!time) return "";

    const [hours, minutes] = time.split(":");

    let hour = Number(hours);

    const ampm = hour >= 12 ? "PM" : "AM";

    hour = hour % 12;

    if (hour === 0) {
      hour = 12;
    }

    return `${hour}:${minutes} ${ampm}`;
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

  // =========================
  // SUBMIT ATTENDANCE
  // =========================

  const handleAttendanceSubmit = async (e) => {
    e.preventDefault();

    const {
      member,
      action,
      date,
      time,
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
    // TIME IN
    // =========================

    if (action === "Time In") {
      if (!time) {
        alert("Please select the Time In.");
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

      try {
        setSaving(true);

        await addDoc(
          collection(db, "attendance"),
          {
            memberId: member.id,
            memberName: member.memberName,
            memberNumber: member.memberNumber,
            date: date,
            timeIn: formatTime12Hour(time),
            timeOut: "",
            status: "Present",
            createdAt: serverTimestamp(),
          }
        );

        closeAttendanceForm();

        await fetchAttendance();

        alert("Time In recorded successfully.");
      } catch (error) {
        console.error(
          "Error recording Time In:",
          error
        );

        alert("Failed to record Time In.");
      } finally {
        setSaving(false);
      }

      return;
    }

    // =========================
    // TIME OUT
    // =========================

    if (action === "Time Out") {
      if (!time) {
        alert("Please select the Time Out.");
        return;
      }

      const existingRecord =
        getAttendanceForMemberDate(
          member.id,
          date
        );

      if (!existingRecord) {
        alert(
          "No Time In record was found for this member on the selected date."
        );
        return;
      }

      if (!existingRecord.timeIn) {
        alert(
          "This member does not have a Time In."
        );
        return;
      }

      if (existingRecord.timeOut) {
        alert(
          "This member already has a Time Out."
        );
        return;
      }

      // Convert saved 12-hour time to minutes
      const convert12HourToMinutes = (
        time12
      ) => {
        if (!time12) return null;

        const [timePart, period] =
          time12.split(" ");

        let [hours, minutes] = timePart
          .split(":")
          .map(Number);

        if (period === "AM") {
          if (hours === 12) {
            hours = 0;
          }
        }

        if (period === "PM") {
          if (hours !== 12) {
            hours += 12;
          }
        }

        return hours * 60 + minutes;
      };

      const timeInMinutes =
        convert12HourToMinutes(
          existingRecord.timeIn
        );

      const [outHours, outMinutes] = time
        .split(":")
        .map(Number);

      const timeOutMinutes =
        outHours * 60 + outMinutes;

      if (
        timeOutMinutes <= timeInMinutes
      ) {
        alert(
          "Time Out cannot be earlier than or equal to Time In."
        );
        return;
      }

      try {
        setSaving(true);

        await updateDoc(
          doc(
            db,
            "attendance",
            existingRecord.id
          ),
          {
            timeOut:
              formatTime12Hour(time),
            status: "Completed",
          }
        );

        closeAttendanceForm();

        await fetchAttendance();

        alert(
          "Time Out recorded successfully."
        );
      } catch (error) {
        console.error(
          "Error recording Time Out:",
          error
        );

        alert("Failed to record Time Out.");
      } finally {
        setSaving(false);
      }

      return;
    }

    // =========================
    // ABSENT
    // =========================

    if (action === "Absent") {
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
        `Mark ${member.memberName} as absent on ${formatDate(
          date
        )}?`
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
            status: "Absent",
            createdAt: serverTimestamp(),
          }
        );

        closeAttendanceForm();

        await fetchAttendance();

        alert("Member marked as absent.");
      } catch (error) {
        console.error(
          "Error recording absent:",
          error
        );

        alert(
          "Failed to mark member as absent."
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

      {/* MEMBERS */}

      <div className="members-section">

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

            {members.map((member) => (

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

                {/* ATTENDANCE BUTTONS */}

                <div className="member-actions">

                  <button
                    className="time-in-btn"
                    onClick={() =>
                      openAttendanceForm(
                        member,
                        "Time In"
                      )
                    }
                  >
                    Time In
                  </button>

                  <button
                    className="time-out-btn"
                    onClick={() =>
                      openAttendanceForm(
                        member,
                        "Time Out"
                      )
                    }
                  >
                    Time Out
                  </button>

                  <button
                    className="absent-btn"
                    onClick={() =>
                      openAttendanceForm(
                        member,
                        "Absent"
                      )
                    }
                  >
                    Absent
                  </button>

                </div>

              </div>

            ))}

          </div>
        )}

      </div>

      {/* ATTENDANCE RECORDS */}

      <div className="attendance-records-section">

        <div className="section-header">

          <div>
            <h2>Attendance Records</h2>

            <p>
              View all member attendance records.
            </p>
          </div>

          <span className="record-count">
            {attendanceRecords.length} records
          </span>

        </div>

        {loading ? (
          <div className="attendance-message">
            Loading attendance records...
          </div>
        ) : attendanceRecords.length === 0 ? (
          <div className="attendance-message">
            No attendance records yet.
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

                {attendanceRecords.map(
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
                        {record.timeOut || "-"}
                      </td>

                      <td>

                        <span
                          className={`attendance-status ${
                            record.status ===
                            "Absent"
                              ? "absent"
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

                {attendanceForm.action !==
                  "Absent" && (

                  <div className="form-group">

                    <label>
                      {attendanceForm.action ===
                      "Time In"
                        ? "Time In"
                        : "Time Out"}
                    </label>

                    <input
                      type="time"
                      value={
                        attendanceForm.time
                      }
                      onChange={(e) =>
                        setAttendanceForm(
                          (prev) => ({
                            ...prev,
                            time: e.target.value,
                          })
                        )
                      }
                      required
                    />

                    <small>
                      Time will be saved in
                      AM/PM format.
                    </small>

                  </div>

                )}

                {attendanceForm.action ===
                  "Absent" && (

                  <div className="absent-notice">

                    <strong>
                      Mark as Absent
                    </strong>

                    <p>
                      No Time In or Time Out
                      is required.
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
                      attendanceForm.action ===
                      "Absent"
                        ? "save-absent-btn"
                        : "save-btn"
                    }
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : attendanceForm.action ===
                        "Absent"
                      ? "Mark Absent"
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