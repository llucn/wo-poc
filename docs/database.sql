CREATE DATABASE IF NOT EXISTS wo_poc
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE wo_poc;

CREATE TABLE IF NOT EXISTS t_issue_category (
  id           INT          NOT NULL AUTO_INCREMENT,
  name         VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_t_issue_category_name (name),
  UNIQUE KEY uk_t_issue_category_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_field (
  id            INT          NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NOT NULL,
  title         VARCHAR(255) NOT NULL,
  description   TEXT         NULL,
  required      INT          NOT NULL DEFAULT 0,
  default_value TEXT         NULL,
  type          VARCHAR(64)  NOT NULL,
  properties    TEXT         NULL,
  created_on    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    VARCHAR(255) NOT NULL,
  updated_on    TIMESTAMP    NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  updated_by    VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_t_field_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_form (
  id          INT          NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NULL,
  created_on  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by  VARCHAR(255) NOT NULL,
  updated_on  TIMESTAMP    NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  updated_by  VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_t_form_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_form_field (
  form_id    INT          NOT NULL,
  field_id   INT          NOT NULL,
  position   INT          NOT NULL,
  created_on TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  updated_on TIMESTAMP    NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255) NULL,
  PRIMARY KEY (form_id, field_id),
  CONSTRAINT fk_form_field_form  FOREIGN KEY (form_id)  REFERENCES t_form(id)  ON DELETE CASCADE,
  CONSTRAINT fk_form_field_field FOREIGN KEY (field_id) REFERENCES t_field(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
