
const notificationToggle = document.getElementById("notificationToggle");
const notificationPopover = document.getElementById("notificationPopover");
const notificationItems = document.getElementById("notificationItems");
const notificationCount = document.getElementById("notificationCount");
const notificationArea = document.getElementById("notificationArea");

async function loadNotifications() {
    try {
        const notifications = list(await api("/api/notifications"));
        let unread = 0;
        let html = "";

        for (const item of notifications) {
            if (!Number(item.is_read)) unread++;

            const message = escapeHtml(value(item, "message", "body", "title") || "Notification");
            const isRead = Boolean(Number(item.is_read));
            const status = isRead ? "read" : "unread";

            html += `<div class="notification-item ${status}">
                <div>${message}</div>
                ${isRead ? "" : `<button type="button" class="inlinebtn" data-notification-id="${escapeHtml(item.id)}">Mark read</button>`}
            </div>`;
        }

        notificationCount.hidden = unread === 0;
        notificationCount.textContent = unread > 9 ? "9+" : String(unread);
        notificationItems.innerHTML = html || "No notifications yet.";

        notificationItems.querySelectorAll("[data-notification-id]").forEach(button => {
            button.onclick = async function() {
                try {
                    await api("/api/notifications/" + button.dataset.notificationId + "/read", "PATCH");
                    await loadNotifications();
                } catch (error) {
                    notificationItems.textContent = "Unable to update notification: " + error.message;
                }
            };
        });
    } catch (error) {
        notificationItems.textContent = "Could not load notifications: " + error.message;
    }
}

// Open or close notification bell
notificationToggle.onclick = async function() {
    notificationPopover.hidden = !notificationPopover.hidden;
    notificationToggle.setAttribute("aria-expanded", String(!notificationPopover.hidden));

    if (!notificationPopover.hidden)
        await loadNotifications();
};

// Close when clicking outside
document.addEventListener("click", function(event) {
    if (!notificationArea.contains(event.target)) {
        notificationPopover.hidden = true;
        notificationToggle.setAttribute("aria-expanded", "false");
    }
});

loadNotifications();
