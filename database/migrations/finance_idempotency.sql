-- Additive migration for optional admin refund retry keys.
CREATE TABLE IF NOT EXISTS api_idempotency (
    actor_role VARCHAR(20) NOT NULL,
    actor_id INT NOT NULL,
    request_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_role,actor_id,request_key),
    CONSTRAINT fk_idempotency_user FOREIGN KEY (actor_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    KEY idx_idempotency_created (created_at)
) ENGINE=InnoDB;
