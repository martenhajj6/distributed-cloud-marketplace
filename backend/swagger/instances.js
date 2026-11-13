// Instances endpoints (Customer owns VM, Admin can access any registered VM).
const id = { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } };
const responses = {
    200: { description: "Successful operation" },
    400: { description: "Invalid VM ID" },
    401: { description: "Not authenticated" },
    404: { description: "VM not found or not owned by the customer" },
    409: { description: "VM state or address conflict" },
    503: { description: "Capacity release not integrated or service unavailable" }
};
const endpoint = (summary, tag = "Instances") => ({ tags: [tag], summary, parameters: [id], responses });
module.exports = {
    "/api/instances/{id}": {
        get: endpoint("Get a registered VM and its status"),
        delete: endpoint("Soft-delete VM, release IP and D1 capacity, preserve usage history")
    },
    "/api/instances/{id}/start": { post: endpoint("Start a stopped VM and open metered usage") },
    "/api/instances/{id}/stop": { post: endpoint("Stop a running VM and close metered usage") },
    "/api/instances/{id}/restart": { post: endpoint("Restart VM and split metered usage periods") },
    "/api/instances/{id}/activity": { get: endpoint("List up to 100 recent VM activity events") },
    "/api/instances/{id}/ip": {
        post: endpoint("Allocate an address from InstanceIPPool"),
        delete: endpoint("Release IP address (only when VM is stopped)")
    }
};
