-- ============================================================================
-- Batch Document Ingestion Transaction Function
-- ============================================================================
-- Purpose: Atomically save document with initial metadata
-- Tables: documents
-- Note: Vector/chunk processing happens asynchronously AFTER this transaction
-- ============================================================================

CREATE OR REPLACE FUNCTION save_document_transaction(
  p_title TEXT,
  p_author TEXT,
  p_storage_path TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT,
  p_content TEXT,
  p_word_count INTEGER,
  p_page_count INTEGER,
  p_uploaded_by UUID,
  p_source_type TEXT,
  p_source_url TEXT
) RETURNS JSONB AS $$
DECLARE
  v_document_id UUID;
  v_result JSONB;
BEGIN
  -- =================================================================
  -- STEP 1: Insert document record
  -- =================================================================
  INSERT INTO documents (
    title,
    author,
    storage_path,
    mime_type,
    file_size,
    content,
    word_count,
    page_count,
    uploaded_by,
    processed_at,
    source_type,
    source_url,
    amazon_url,
    resource_url,
    download_enabled,
    contact_person,
    contact_email,
    created_at
  ) VALUES (
    p_title,
    p_author,
    p_storage_path,
    p_mime_type,
    p_file_size,
    p_content,
    p_word_count,
    p_page_count,
    p_uploaded_by,
    NOW(), -- processed_at
    p_source_type,
    p_source_url,
    NULL, -- amazon_url
    NULL, -- resource_url
    FALSE, -- download_enabled (default for scraped content)
    NULL, -- contact_person
    NULL, -- contact_email
    NOW()
  )
  RETURNING id INTO v_document_id;

  -- =================================================================
  -- RETURN SUCCESS RESPONSE
  -- =================================================================
  v_result := jsonb_build_object(
    'success', TRUE,
    'document_id', v_document_id,
    'title', p_title,
    'word_count', p_word_count,
    'timestamp', NOW(),
    'message', 'Document saved successfully. Vector processing will run asynchronously.'
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- =================================================================
  -- ERROR HANDLING - Transaction will automatically rollback
  -- =================================================================
  v_result := jsonb_build_object(
    'success', FALSE,
    'error', SQLERRM,
    'error_detail', SQLSTATE,
    'error_hint', 'Check that all required fields are provided and user exists',
    'title', p_title,
    'source_url', p_source_url,
    'timestamp', NOW()
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Batch Document Processing Function
-- ============================================================================
-- Purpose: Process multiple documents in a single transaction
-- Returns: Array of results (success/failure for each document)
-- ============================================================================

CREATE OR REPLACE FUNCTION save_documents_batch(
  p_documents JSONB
) RETURNS JSONB AS $$
DECLARE
  v_document JSONB;
  v_result JSONB;
  v_results JSONB[] := ARRAY[]::JSONB[];
  v_success_count INTEGER := 0;
  v_failure_count INTEGER := 0;
BEGIN
  -- =================================================================
  -- PROCESS EACH DOCUMENT IN THE BATCH
  -- =================================================================
  FOR v_document IN SELECT * FROM jsonb_array_elements(p_documents) LOOP
    BEGIN
      -- Call single document transaction
      v_result := save_document_transaction(
        (v_document->>'title')::TEXT,
        (v_document->>'author')::TEXT,
        (v_document->>'storage_path')::TEXT,
        (v_document->>'mime_type')::TEXT,
        (v_document->>'file_size')::BIGINT,
        (v_document->>'content')::TEXT,
        (v_document->>'word_count')::INTEGER,
        (v_document->>'page_count')::INTEGER,
        (v_document->>'uploaded_by')::UUID,
        (v_document->>'source_type')::TEXT,
        (v_document->>'source_url')::TEXT
      );

      -- Append result
      v_results := array_append(v_results, v_result);

      -- Count successes
      IF (v_result->>'success')::BOOLEAN THEN
        v_success_count := v_success_count + 1;
      ELSE
        v_failure_count := v_failure_count + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Individual document failed - log and continue
      v_results := array_append(v_results, jsonb_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'error_detail', SQLSTATE,
        'title', v_document->>'title',
        'source_url', v_document->>'source_url'
      ));
      v_failure_count := v_failure_count + 1;
    END;
  END LOOP;

  -- =================================================================
  -- RETURN BATCH SUMMARY
  -- =================================================================
  RETURN jsonb_build_object(
    'success', v_failure_count = 0,
    'total', v_success_count + v_failure_count,
    'successful', v_success_count,
    'failed', v_failure_count,
    'results', to_jsonb(v_results),
    'timestamp', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  -- =================================================================
  -- BATCH-LEVEL ERROR
  -- =================================================================
  RETURN jsonb_build_object(
    'success', FALSE,
    'error', SQLERRM,
    'error_detail', SQLSTATE,
    'error_hint', 'Check that p_documents is a valid JSONB array',
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION save_document_transaction TO service_role;
GRANT EXECUTE ON FUNCTION save_documents_batch TO service_role;

-- ============================================================================
-- USAGE EXAMPLE 1: Single Document (from TypeScript)
-- ============================================================================
-- const { data, error } = await supabase.rpc('save_document_transaction', {
--   p_title: 'My Document Title',
--   p_author: 'Web scraped from example.com',
--   p_storage_path: 'scraped/1234-my-document.txt',
--   p_mime_type: 'text/plain',
--   p_file_size: 5000,
--   p_content: 'Document content here...',
--   p_word_count: 800,
--   p_page_count: null,
--   p_uploaded_by: userId,
--   p_source_type: 'web_scraped',
--   p_source_url: 'https://example.com/page'
-- });
--
-- if (data.success) {
--   const documentId = data.document_id;
--   // Now trigger async vector processing
--   await processDocumentVectors(documentId, userId);
-- }

-- ============================================================================
-- USAGE EXAMPLE 2: Batch Documents (from TypeScript)
-- ============================================================================
-- const documents = selectedPages.map(page => ({
--   title: page.title,
--   author: `Web scraped from ${new URL(page.url).hostname}`,
--   storage_path: `scraped/${Date.now()}-${page.title}.txt`,
--   mime_type: 'text/plain',
--   file_size: Buffer.byteLength(page.content),
--   content: page.content,
--   word_count: calculateWordCount(page.content),
--   page_count: null,
--   uploaded_by: userId,
--   source_type: 'web_scraped',
--   source_url: page.url
-- }));
--
-- const { data, error } = await supabase.rpc('save_documents_batch', {
--   p_documents: documents
-- });
--
-- if (data.success) {
--   console.log(`Batch complete: ${data.successful}/${data.total} succeeded`);
--   // Process successful documents for vector embedding
--   for (const result of data.results) {
--     if (result.success) {
--       await processDocumentVectors(result.document_id, userId);
--     }
--   }
-- }
