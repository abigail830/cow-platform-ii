-- Remove unused builtin agent workflows. FAQ polish stays; FAQ extract and document
-- metadata extraction run via pipeline Config YAML (kb-faq-extract, metadata_extract section).

DELETE FROM "app_workflow_bindings"
WHERE "workflow_key" IN ('session_image_extract', 'metadata_extract', 'faq_extract');

DELETE FROM "app_builtin_agent_defs"
WHERE "workflow_key" IN ('session_image_extract', 'metadata_extract', 'faq_extract');
