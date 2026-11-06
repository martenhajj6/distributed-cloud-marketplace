// Alerts are displayed in the header bell, not on a separate page.
// These API endpoints already exist in backend/routes/customer.js.
const notificationToggle = document.getElementById("notificationToggle");
const notificationPopover = document.getElementById("notificationPopover");
const notificationItems = document.getElementById("notificationItems");
const notificationCount = document.getElementById("notificationCount");
async function loadNotifications() {
    if (state.role === "Admin") {
        notificationItems.textContent = "Admin notifications are not configured.";
        notificationCount.hidden = true;
        return;
    }
    try {
        const notifications = list(await api("/api/notifications"));
        const unread = notifications.filter(item => !item.is_read);
        notificationCount.hidden = unread.length === 0;
        notificationCount.textContent = unread.length > 9 ? "9+" : String(unread.length);
        if (notifications.length === 0) {
            notificationItems.textContent = "No notifications yet.";
            return;
        }
        notificationItems.innerHTML = notifications.map(item => {
            const text = escapeHtml(value(item, "message", "body", "title") || "Notification");
            const readButton = item.is_read ? "" :
                `<button type="button" class="inlinebtn" data-notification-id="${escapeHtml(item.id)}">Mark read</button>`;
            return `<div class="notification-item ${item.is_read ? "read" : "unread"}">
        <div>${text}</div>${readButton}
      </div>`;
        }).join("");
        document.querySelectorAll("[data-notification-id]").forEach(button => {
            button.onclick = async () => {
                try {
                    await api(`/api/notifications/${button.dataset.notificationId}/read`, "PATCH");
                    await loadNotifications();
                }
                catch (error) {
                    notificationItems.textContent = "Unable to update notification: " + error.message;
                }
            };
        });
    }
    catch (error) {
        notificationItems.textContent = "Could not load notifications: " + error.message;
    }
}
notificationToggle.addEventListener("click", async () => {
    const isOpening = notificationPopover.hidden;
    notificationPopover.hidden = !isOpening;
    notificationToggle.setAttribute("aria-expanded", String(isOpening));
    if (isOpening)
        await loadNotifications();
});
// Close the popover when clicking outside it.
document.addEventListener("click", event => {
    if (!document.getElementById("notificationArea").contains(event.target)) {
        notificationPopover.hidden = true;
        notificationToggle.setAttribute("aria-expanded", "false");
    }
});
// Load once at startup so the unread badge is visible.
loadNotifications();
