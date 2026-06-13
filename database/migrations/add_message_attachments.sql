-- Message attachments (images + PDF, max 2MB enforced in API)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_path VARCHAR(500) NULL AFTER content,
  ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(200) NULL AFTER attachment_path,
  ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(20) NULL AFTER attachment_name;
