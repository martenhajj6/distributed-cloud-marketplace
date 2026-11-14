-- Stable per-provider guards for concurrent balance changes.
CREATE TABLE IF NOT EXISTS finance_locks (
    kind VARCHAR(16) NOT NULL,
    owner_id INT NOT NULL,
    PRIMARY KEY (kind,owner_id),
    CONSTRAINT fk_finance_locks_user FOREIGN KEY (owner_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_finance_lock_kind CHECK (kind IN ('Customer','Provider'))
) ENGINE=InnoDB;
