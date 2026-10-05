-- Migrate existing installations from legacy role aliases to canonical names.
-- Existing role permission JSON is preserved when moving the legacy rows.

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'super_admin', 'admin', 'judge', 'entry_operator', 'reviewer',
    'screen_controller', 'tournament_manager', 'data_entry', 'result_reviewer'
  ) NOT NULL;

UPDATE users
SET role = CASE role
  WHEN 'entry_operator' THEN 'data_entry'
  WHEN 'reviewer' THEN 'result_reviewer'
  ELSE role
END
WHERE role IN ('entry_operator', 'reviewer');

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'super_admin', 'admin', 'tournament_manager', 'data_entry',
    'judge', 'result_reviewer', 'screen_controller'
  ) NOT NULL;

UPDATE role_permissions AS legacy
LEFT JOIN role_permissions AS canonical
  ON canonical.role = 'data_entry'
SET legacy.role = 'data_entry'
WHERE legacy.role = 'entry_operator'
  AND canonical.role IS NULL;

UPDATE role_permissions AS legacy
LEFT JOIN role_permissions AS canonical
  ON canonical.role = 'result_reviewer'
SET legacy.role = 'result_reviewer'
WHERE legacy.role = 'reviewer'
  AND canonical.role IS NULL;

INSERT IGNORE INTO role_permissions (role, permissions) VALUES
  ('data_entry', '{"view_results":true,"edit_results":false,"publish_results":false,"manage_users":false,"manage_tournaments":false,"manage_site":false,"view_appeals":false,"resolve_appeals":false}'),
  ('result_reviewer', '{"view_results":true,"edit_results":false,"publish_results":false,"manage_users":false,"manage_tournaments":false,"manage_site":false,"view_appeals":true,"resolve_appeals":false}');

DELETE FROM role_permissions WHERE role IN ('entry_operator', 'reviewer');