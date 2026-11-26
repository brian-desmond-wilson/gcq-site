// Days until a tournament starts, counted on New York's calendar. Used by any element with
// class "countdown" and a data-start date (YYYY-MM-DD).
document.querySelectorAll(".countdown[data-start]").forEach(function (el) {
  var today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  today.setHours(0, 0, 0, 0);
  var days = Math.round((new Date(el.dataset.start + "T00:00:00") - today) / 86400000);
  if (days > 1) { el.innerHTML = "<b>" + days + "</b><span>days to go</span>"; }
  else if (days === 1) { el.innerHTML = "<b>1</b><span>day to go</span>"; }
  else { el.innerHTML = "<b>Now</b><span>playing</span>"; }
});
