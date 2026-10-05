-- Al Afandi Equestrian Platform — Database Schema
-- Run this in phpMyAdmin on Hostinger

SET NAMES utf8mb4;
SET time_zone = '+03:00';

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                   VARCHAR(36)  NOT NULL PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  username             VARCHAR(100) NOT NULL UNIQUE,
  email                VARCHAR(255) DEFAULT '',
  password_hash        VARCHAR(255) NOT NULL,
  role                 ENUM('super_admin','admin','judge','data_entry','result_reviewer','screen_controller') NOT NULL,
  status               ENUM('active','suspended') NOT NULL DEFAULT 'active',
  assigned_tournaments JSON         DEFAULT (JSON_ARRAY()),
  last_login           DATETIME     DEFAULT NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','admin','judge','data_entry','result_reviewer','screen_controller') NOT NULL;

-- ─── HORSES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horses (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  registration_no VARCHAR(100) DEFAULT '',
  breed         VARCHAR(100) DEFAULT '',
  age           INT DEFAULT 0,
  gender        VARCHAR(50) DEFAULT '',
  color         VARCHAR(100) DEFAULT '',
  owner         VARCHAR(255) DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── TOURNAMENTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournaments (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  date        VARCHAR(100) DEFAULT '',
  location    VARCHAR(255) DEFAULT '',
  status      ENUM('upcoming','active','completed','cancelled','archived') NOT NULL DEFAULT 'upcoming',
  type        VARCHAR(100) DEFAULT '',
  rounds      INT          NOT NULL DEFAULT 3,
  current_round INT        NOT NULL DEFAULT 0,
  judge_ids   JSON         DEFAULT (JSON_ARRAY()),
  participants JSON        DEFAULT (JSON_ARRAY()),
  round_data  JSON         DEFAULT (JSON_ARRAY()),
  faults      JSON         DEFAULT (JSON_ARRAY()),
  logo_url    VARCHAR(1000) DEFAULT '',
  sponsors    JSON         DEFAULT (JSON_ARRAY()),
  logo_position VARCHAR(30) DEFAULT 'top-left',
  logo_size   INT          DEFAULT 96,
  logo_x      DECIMAL(5,2) DEFAULT 8,
  logo_y      DECIMAL(5,2) DEFAULT 8,
  venue       VARCHAR(255) DEFAULT '',
  description TEXT,
  website_target_date VARCHAR(30) DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tournaments
  MODIFY COLUMN status ENUM('upcoming','active','completed','cancelled','archived') NOT NULL DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS current_round INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS judge_ids JSON DEFAULT (JSON_ARRAY()),
  ADD COLUMN IF NOT EXISTS participants JSON DEFAULT (JSON_ARRAY()),
  ADD COLUMN IF NOT EXISTS round_data JSON DEFAULT (JSON_ARRAY()),
  ADD COLUMN IF NOT EXISTS faults JSON DEFAULT (JSON_ARRAY());

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS logo_url VARCHAR(1000) DEFAULT '',
  ADD COLUMN IF NOT EXISTS sponsors JSON DEFAULT (JSON_ARRAY()),
  ADD COLUMN IF NOT EXISTS logo_position VARCHAR(30) DEFAULT 'top-left',
  ADD COLUMN IF NOT EXISTS logo_size INT DEFAULT 96,
  ADD COLUMN IF NOT EXISTS logo_x DECIMAL(5,2) DEFAULT 8,
  ADD COLUMN IF NOT EXISTS logo_y DECIMAL(5,2) DEFAULT 8;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS website_target_date VARCHAR(30) DEFAULT NULL;

-- ─── NORMALIZED TOURNAMENT DATA ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_rounds (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  tournament_id VARCHAR(36) NOT NULL,
  round_number  INT NOT NULL,
  name          VARCHAR(255) NOT NULL,
  status        ENUM('not_started','active','closed','completed') NOT NULL DEFAULT 'not_started',
  judge_ids     JSON DEFAULT (JSON_ARRAY()),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tournament_participants (
  id                VARCHAR(36) NOT NULL PRIMARY KEY,
  tournament_id     VARCHAR(36) NOT NULL,
  player_id         VARCHAR(36) NOT NULL,
  horse_id          VARCHAR(36) DEFAULT NULL,
  competition_number VARCHAR(20) NOT NULL,
  category          VARCHAR(100) DEFAULT '',
  status            ENUM('active','disqualified','withdrawn') NOT NULL DEFAULT 'active',
  rounds_completed  INT NOT NULL DEFAULT 0,
  appeal_code       VARCHAR(20) NOT NULL UNIQUE,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY tournament_player (tournament_id, player_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (horse_id) REFERENCES horses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tournament_faults (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  tournament_id VARCHAR(36) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  penalty       DECIMAL(10,2) NOT NULL DEFAULT 0,
  disqualifies  TINYINT(1) NOT NULL DEFAULT 0,
  repeatable    TINYINT(1) NOT NULL DEFAULT 1,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── PLAYERS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  country       VARCHAR(100) DEFAULT '',
  club          VARCHAR(255) DEFAULT '',
  horse         VARCHAR(255) DEFAULT '',
  category      VARCHAR(100) DEFAULT '',
  tournament_id VARCHAR(36)  DEFAULT NULL,
  status        ENUM('active','banned') NOT NULL DEFAULT 'active',
  banned_reason TEXT,
  banned_at     VARCHAR(100) DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add player moderation fields to databases created before this version.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS status ENUM('active','banned') NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS banned_reason TEXT,
  ADD COLUMN IF NOT EXISTS banned_at VARCHAR(100) DEFAULT NULL;

-- ─── JUDGE RESULTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judge_results (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  player_id     VARCHAR(36) NOT NULL,
  tournament_id VARCHAR(36) NOT NULL,
  judge_id      VARCHAR(36) NOT NULL,
  competition_number VARCHAR(20) DEFAULT '',
  round_id      VARCHAR(36) DEFAULT '',
  round         INT         NOT NULL DEFAULT 1,
  round_name    VARCHAR(255) DEFAULT '',
  tournament_name VARCHAR(255) DEFAULT '',
  horse_name    VARCHAR(255) DEFAULT '',
  time          VARCHAR(50) DEFAULT '',
  faults        JSON        DEFAULT (JSON_ARRAY()),
  approved_by   VARCHAR(255) DEFAULT NULL,
  approved_at   DATETIME DEFAULT NULL,
  rejected_reason TEXT,
  scores        JSON        DEFAULT (JSON_OBJECT()),
  total         DECIMAL(10,2) DEFAULT 0,
  status        ENUM('pending','submitted','approved','rejected') NOT NULL DEFAULT 'submitted',
  notes         TEXT,
  submitted_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE judge_results
  ADD COLUMN IF NOT EXISTS competition_number VARCHAR(20) DEFAULT '',
  ADD COLUMN IF NOT EXISTS round_id VARCHAR(36) DEFAULT '',
  ADD COLUMN IF NOT EXISTS round_name VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS tournament_name VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS horse_name VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS time VARCHAR(50) DEFAULT '',
  ADD COLUMN IF NOT EXISTS faults JSON DEFAULT (JSON_ARRAY());
  
ALTER TABLE judge_results
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_at DATETIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- ─── APPEALS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appeals (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  player_id     VARCHAR(36) NOT NULL,
  tournament_id VARCHAR(36) NOT NULL,
  judge_id      VARCHAR(36) DEFAULT NULL,
  round         INT         DEFAULT NULL,
  reason        TEXT        NOT NULL,
  status        ENUM('pending','reviewing','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_notes   TEXT,
  submitted_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── SITE SETTINGS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  id         INT  NOT NULL PRIMARY KEY DEFAULT 1,
  settings   JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── LIVE STATE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_state (
  id                   INT     NOT NULL PRIMARY KEY DEFAULT 1,
  current_player_id    VARCHAR(36) DEFAULT NULL,
  current_tournament_id VARCHAR(36) DEFAULT NULL,
  is_active            TINYINT(1) NOT NULL DEFAULT 0,
  display_state        VARCHAR(30) NOT NULL DEFAULT 'waiting',
  display_data         JSON    DEFAULT NULL,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE live_state
  ADD COLUMN IF NOT EXISTS display_state VARCHAR(30) NOT NULL DEFAULT 'waiting';

-- ─── ROLE PERMISSIONS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role        VARCHAR(50) NOT NULL PRIMARY KEY,
  permissions JSON        NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default role permissions
INSERT IGNORE INTO role_permissions (role, permissions) VALUES
('super_admin', '{"view_results":true,"edit_results":true,"publish_results":true,"manage_users":true,"manage_tournaments":true,"manage_site":true,"view_appeals":true,"resolve_appeals":true}'),
('admin',        '{"view_results":true,"edit_results":true,"publish_results":true,"manage_users":false,"manage_tournaments":true,"manage_site":true,"view_appeals":true,"resolve_appeals":true}'),
('judge',        '{"view_results":true,"edit_results":false,"publish_results":false,"manage_users":false,"manage_tournaments":false,"manage_site":false,"view_appeals":false,"resolve_appeals":false}'),
('data_entry',   '{"view_results":true,"edit_results":false,"publish_results":false,"manage_users":false,"manage_tournaments":false,"manage_site":false,"view_appeals":false,"resolve_appeals":false}'),
('result_reviewer','{"view_results":true,"edit_results":false,"publish_results":false,"manage_users":false,"manage_tournaments":false,"manage_site":false,"view_appeals":true,"resolve_appeals":false}');

-- ─── CONTENT TABLES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           VARCHAR(36) NOT NULL PRIMARY KEY,
  tournament_id VARCHAR(36) DEFAULT NULL,
  action       VARCHAR(255) NOT NULL,
  description  TEXT NOT NULL,
  user_id      VARCHAR(36) DEFAULT NULL,
  user_name    VARCHAR(255) NOT NULL DEFAULT '',
  category     VARCHAR(100) NOT NULL DEFAULT 'النظام',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX audit_tournament_idx (tournament_id),
  INDEX audit_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_hero_slides (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  title      VARCHAR(255) DEFAULT '',
  subtitle   VARCHAR(500) DEFAULT '',
  body       TEXT,
  image_url  VARCHAR(1000) DEFAULT '',
  meta       JSON         DEFAULT (JSON_OBJECT()),
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_gallery (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  title      VARCHAR(255) DEFAULT '',
  subtitle   VARCHAR(500) DEFAULT '',
  body       TEXT,
  image_url  VARCHAR(1000) DEFAULT '',
  meta       JSON         DEFAULT (JSON_OBJECT()),
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_champions (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  title      VARCHAR(255) DEFAULT '',
  subtitle   VARCHAR(500) DEFAULT '',
  body       TEXT,
  image_url  VARCHAR(1000) DEFAULT '',
  meta       JSON         DEFAULT (JSON_OBJECT()),
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_news (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  title      VARCHAR(255) DEFAULT '',
  subtitle   VARCHAR(500) DEFAULT '',
  body       TEXT,
  image_url  VARCHAR(1000) DEFAULT '',
  meta       JSON         DEFAULT (JSON_OBJECT()),
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_sponsors (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  title      VARCHAR(255) DEFAULT '',
  subtitle   VARCHAR(500) DEFAULT '',
  body       TEXT,
  image_url  VARCHAR(1000) DEFAULT '',
  meta       JSON         DEFAULT (JSON_OBJECT()),
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  TINYINT(1)  NOT NULL DEFAULT 1,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── UPLOADS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploads (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  filename      VARCHAR(255)  NOT NULL,
  original_name VARCHAR(255)  DEFAULT '',
  mime_type     VARCHAR(100)  DEFAULT '',
  size          INT           DEFAULT 0,
  url           VARCHAR(1000) DEFAULT '',
  uploaded_by   VARCHAR(36)   DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial live state row
INSERT IGNORE INTO live_state (id, is_active) VALUES (1, 0);
