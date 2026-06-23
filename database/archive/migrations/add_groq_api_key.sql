-- Add Groq API key to system_settings
INSERT INTO system_settings (setting_key, setting_value)
VALUES ('groq_api_key', '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')
ON DUPLICATE KEY UPDATE setting_value = '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';
