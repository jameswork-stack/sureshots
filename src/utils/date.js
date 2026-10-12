export const formatDisplayDate = (date) => {
  if (!date) {
    return "-";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return date;
  }

  const [, year, month, day] = match;
  const dateValue = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    dateValue.getFullYear() !== Number(year) ||
    dateValue.getMonth() !== Number(month) - 1 ||
    dateValue.getDate() !== Number(day)
  ) {
    return date;
  }

  return dateValue.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
