-- Existing rows store raw bearer tokens in the column now mapped as tokenHash.
-- Revoke them during deployment rather than retaining plaintext credentials or
-- attempting an unsafe in-place conversion.
DELETE FROM "sessions";
