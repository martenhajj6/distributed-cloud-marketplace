CREATE TABLE Users (
    user_id           INT AUTO_INCREMENT PRIMARY KEY,
    first_name        VARCHAR(100) NOT NULL,
    last_name         VARCHAR(100) NOT NULL,
    email             VARCHAR(255) NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    role              ENUM('customer', 'provider', 'admin') NOT NULL,
    email_verified_at DATETIME NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE EmailVerificationTokens (
    token_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    token_hash   CHAR(64) NOT NULL UNIQUE,
    expires_at   DATETIME NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at      DATETIME NULL,
    CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id)
        REFERENCES Users(user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    INDEX idx_email_tokens_user (user_id),
    INDEX idx_email_tokens_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE UserTwoFactor (
    user_id          INT PRIMARY KEY,
    encrypted_secret VARBINARY(512) NOT NULL,
    enabled_at       DATETIME NULL,
    last_used_step   BIGINT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_twofactor_user FOREIGN KEY (user_id)
        REFERENCES Users(user_id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    expires INT UNSIGNED NOT NULL,
    data MEDIUMTEXT COLLATE utf8mb4_bin,
    PRIMARY KEY (session_id)
) ENGINE=InnoDB;

