--
-- PostgreSQL database dump
--

\restrict MIoNA2uAbuuwbzLOxbB233XbEMkcUNR5QnrgnUha0IEwmBQi6IGyBf4tuZtNnfg

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: ingest_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ingest_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'ADMIN',
    'USER',
    'CONTRIBUTOR',
    'SUPER_ADMIN'
);


--
-- Name: accept_invitation_and_link(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_invitation_and_link(p_invitation_id uuid, p_invitee_user_id uuid) RETURNS TABLE(sender_user_id uuid, invitation_id uuid, success boolean, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_invitation user_sent_invitations_log%ROWTYPE;
BEGIN
  -- Lock and fetch invitation
  SELECT * INTO v_invitation
  FROM user_sent_invitations_log
  WHERE id = p_invitation_id
  FOR UPDATE;

  -- Validation checks
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Invalid invitation';
    RETURN;
  END IF;

  IF v_invitation.status != 'pending' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false,
      'Invitation already ' || v_invitation.status;
    RETURN;
  END IF;

  IF v_invitation.expires_at < NOW() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, false, 'Invitation expired';
    RETURN;
  END IF;

  -- Update invitation
  UPDATE user_sent_invitations_log
  SET
    status = 'accepted',
    invited_user_id = p_invitee_user_id,
    accepted_at = NOW()
  WHERE id = v_invitation.id;

  -- Increment sender's quota (unless sent by admin)
  IF NOT v_invitation.sent_by_admin THEN
    UPDATE user_invitation_quotas
    SET invites_used = invites_used + 1
    WHERE user_id = v_invitation.sender_user_id;
  END IF;

  RETURN QUERY SELECT
    v_invitation.sender_user_id,
    v_invitation.id,
    true,
    'Invitation accepted successfully';
END;
$$;


--
-- Name: backfill_all_auth_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_all_auth_users() RETURNS TABLE(public_user_id uuid, auth_user_id uuid, user_email text, success boolean, error text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_record RECORD;
  v_auth_user_id UUID;
BEGIN
  FOR v_user_record IN
    SELECT u.id, u.email
    FROM public.users u
    WHERE u.deleted_at IS NULL
      AND NOT u.clerk_id LIKE 'invited_%'
      AND u.auth_user_id IS NULL  -- Only backfill users without auth_user_id
    ORDER BY u.created_at ASC
  LOOP
    BEGIN
      v_auth_user_id := public.backfill_auth_user(v_user_record.id);

      RETURN QUERY SELECT
        v_user_record.id,
        v_auth_user_id,
        v_user_record.email,
        (v_auth_user_id IS NOT NULL)::BOOLEAN,
        NULL::TEXT;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT
        v_user_record.id,
        NULL::UUID,
        v_user_record.email,
        false,
        SQLERRM;
    END;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION backfill_all_auth_users(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.backfill_all_auth_users() IS 'Batch backfill all users from public.users to auth.users';


--
-- Name: backfill_auth_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_auth_user(p_public_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_clerk_id TEXT;
  v_email TEXT;
  v_name TEXT;
  v_role TEXT;
  v_created_at TIMESTAMPTZ;
  v_auth_user_id UUID;
BEGIN
  -- Get user data from public.users
  SELECT clerk_id, email, name, role, created_at
  INTO v_clerk_id, v_email, v_name, v_role, v_created_at
  FROM public.users
  WHERE id = p_public_user_id
    AND deleted_at IS NULL
    AND NOT clerk_id LIKE 'invited_%';  -- Skip pending invitations

  IF NOT FOUND THEN
    RAISE NOTICE 'User % not found or is pending invitation', p_public_user_id;
    RETURN NULL;
  END IF;

  -- Check if auth.users entry already exists by email
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_auth_user_id IS NULL THEN
    -- Create auth.users entry
    -- Note: This requires auth.users insert permission or service role
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',  -- Default instance
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt('MIGRATION_PASSWORD_' || p_public_user_id::text, gen_salt('bf')),  -- Temporary password
      v_created_at,  -- Auto-confirm (they verified with Clerk)
      v_created_at,
      now(),
      jsonb_build_object(
        'clerk_id', v_clerk_id,
        'migrated_from_clerk', true,
        'role', v_role,
        'name', v_name,
        'migration_note', 'User must reset password on first Supabase login'
      ),
      false,
      '',
      ''
    )
    RETURNING id INTO v_auth_user_id;
  END IF;

  -- Insert into mapping table
  INSERT INTO public.clerk_to_auth_map (
    clerk_id,
    auth_user_id,
    public_user_id
  ) VALUES (
    v_clerk_id,
    v_auth_user_id,
    p_public_user_id
  )
  ON CONFLICT (clerk_id) DO NOTHING;

  -- Update public.users with auth_user_id
  UPDATE public.users
  SET auth_user_id = v_auth_user_id,
      updated_at = now()
  WHERE id = p_public_user_id;

  RETURN v_auth_user_id;
END;
$$;


--
-- Name: FUNCTION backfill_auth_user(p_public_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.backfill_auth_user(p_public_user_id uuid) IS 'Backfill single user from public.users to auth.users with mapping';


--
-- Name: cfg_default_invites(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cfg_default_invites() RETURNS integer
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT 3;
$$;


--
-- Name: clear_failed_attempts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_failed_attempts(p_email_hash text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  BEGIN
    DELETE FROM account_lockouts WHERE email_hash = p_email_hash;
  END;
  $$;


--
-- Name: create_user_quota_on_signup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_user_quota_on_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO user_invitation_quotas (user_id, auth_user_id)
  VALUES (NEW.id, NEW.auth_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: expire_invitations_and_refund(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_invitations_and_refund() RETURNS TABLE(expired_count integer, refunded_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_refunded_count INTEGER := 0;
  expired_rec RECORD;
BEGIN
  -- Find and expire invitations
  FOR expired_rec IN
    SELECT id, sender_user_id, sent_by_admin
    FROM user_sent_invitations_log
    WHERE status = 'pending'
      AND expires_at < NOW()
    FOR UPDATE
  LOOP
    -- Mark as expired
    UPDATE user_sent_invitations_log
    SET status = 'expired'
    WHERE id = expired_rec.id;

    v_expired_count := v_expired_count + 1;

    -- Refund quota (unless sent by admin)
    IF NOT expired_rec.sent_by_admin THEN
      UPDATE user_invitation_quotas
      SET invites_used = GREATEST(invites_used - 1, 0)
      WHERE user_id = expired_rec.sender_user_id;

      v_refunded_count := v_refunded_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_expired_count, v_refunded_count;
END;
$$;


--
-- Name: expire_old_invitations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_invitations() RETURNS TABLE(expired_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  -- Mark invitations as expired (don't delete, for audit trail)
  -- This is optional - you can also just delete them
  UPDATE invitation_tokens
  SET accepted_at = NULL  -- Keep as NULL to show never accepted
  WHERE accepted_at IS NULL
    AND expires_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN QUERY SELECT v_expired_count;
END;
$$;


--
-- Name: get_auth_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auth_user_id_by_email(p_email text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
    SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
  $$;


--
-- Name: grant_invites_to_all(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_invites_to_all(p_add_invites integer, p_only_role text DEFAULT NULL::text) RETURNS TABLE(users_updated integer, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF p_add_invites <= 0 THEN
    RETURN QUERY SELECT 0, 'Must grant at least 1 invitation';
    RETURN;
  END IF;

  UPDATE user_invitation_quotas q
  SET total_invites_granted = total_invites_granted + p_add_invites
  FROM users u
  WHERE q.user_id = u.id
    AND u.deleted_at IS NULL
    AND (p_only_role IS NULL OR u.role = p_only_role);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN QUERY SELECT v_updated_count,
    'Granted ' || p_add_invites || ' invitations to ' || v_updated_count || ' users';
END;
$$;


--
-- Name: grant_invites_to_user(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_invites_to_user(p_user_id uuid, p_add_invites integer) RETURNS TABLE(success boolean, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_add_invites <= 0 THEN
    RETURN QUERY SELECT false, 'Must grant at least 1 invitation';
    RETURN;
  END IF;

  UPDATE user_invitation_quotas
  SET total_invites_granted = total_invites_granted + p_add_invites
  WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Granted ' || p_add_invites || ' invitations';
  ELSE
    RETURN QUERY SELECT false, 'User quota not found';
  END IF;
END;
$$;


--
-- Name: increment_invites_used(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_invites_used(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE user_invitation_quotas
  SET invites_used = invites_used + 1
  WHERE user_id = p_user_id;
END;
$$;


--
-- Name: is_account_locked(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_account_locked(p_email_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  DECLARE
    v_locked boolean;
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM account_lockouts
      WHERE email_hash = p_email_hash
      AND locked_until > now()
    ) INTO v_locked;

    RETURN v_locked;
  END;
  $$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('ADMIN', 'SUPER_ADMIN')
      AND deleted_at IS NULL
  );
$$;


--
-- Name: log_conversation_transaction(uuid, uuid, uuid, text, character varying, numeric, text[], integer, boolean, jsonb, jsonb, jsonb, text[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_conversation_transaction(p_user_id uuid, p_session_id uuid, p_conversation_id uuid, p_question_text text, p_question_intent character varying, p_question_complexity numeric, p_extracted_topics text[], p_user_satisfaction integer, p_had_search_results boolean, p_topic_familiarity jsonb, p_question_patterns jsonb, p_behavioral_insights jsonb, p_current_session_topics text[], p_cross_session_connections jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  DECLARE
    v_conversation_memory_id UUID;
    v_result JSONB;
  BEGIN
    INSERT INTO conversation_memory (
      user_id, session_id, conversation_id, question_text,
      question_intent, question_complexity, ambiguity_score,
      extracted_topics, user_satisfaction, clarification_requested,
      follow_up_generated, is_follow_up, related_conversation_ids,
      personalized_threshold, recommended_complexity, had_search_results
    ) VALUES (
      p_user_id, p_session_id, p_conversation_id, p_question_text,
      p_question_intent, p_question_complexity, 0.0,
      p_extracted_topics, p_user_satisfaction, FALSE,
      FALSE, FALSE, ARRAY[]::UUID[],
      NULL, NULL, p_had_search_results
    )
    RETURNING id INTO v_conversation_memory_id;

    INSERT INTO user_context (
      user_id, topic_familiarity, question_patterns,
      behavioral_insights, current_session_topics,
      cross_session_connections, updated_at
    ) VALUES (
      p_user_id, p_topic_familiarity, p_question_patterns,
      p_behavioral_insights, p_current_session_topics,
      p_cross_session_connections, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      topic_familiarity = EXCLUDED.topic_familiarity,
      question_patterns = EXCLUDED.question_patterns,
      behavioral_insights = EXCLUDED.behavioral_insights,
      current_session_topics = EXCLUDED.current_session_topics,
      cross_session_connections = EXCLUDED.cross_session_connections,
      updated_at = NOW();

    IF p_extracted_topics IS NOT NULL AND array_length(p_extracted_topics, 1) > 0 THEN
      FOR i IN 1..array_length(p_extracted_topics, 1) LOOP
        INSERT INTO topic_progression (
          user_id, topic_name, expertise_level,
          first_interaction_date, last_interaction_date,
          total_interactions, successful_interactions,
          progression_rate, plateau_detected, connected_topics
        ) VALUES (
          p_user_id, p_extracted_topics[i], 0.10,
          NOW(), NOW(), 1,
          CASE WHEN p_user_satisfaction >= 4 THEN 1 ELSE 0 END,
          0.000, FALSE, ARRAY[]::TEXT[]
        )
        ON CONFLICT (user_id, topic_name) DO UPDATE SET
          last_interaction_date = NOW(),
          total_interactions = topic_progression.total_interactions + 1,
          successful_interactions = topic_progression.successful_interactions +
            CASE WHEN p_user_satisfaction >= 4 THEN 1 ELSE 0 END,
          expertise_level = LEAST(0.99, topic_progression.expertise_level + 0.05),
          progression_rate = LEAST(9.999,
            (LEAST(0.99, topic_progression.expertise_level + 0.05) - topic_progression.expertise_level) /
            GREATEST(1, EXTRACT(EPOCH FROM (NOW() - topic_progression.first_interaction_date)) / 86400)
          ),
          updated_at = NOW();
      END LOOP;
    END IF;

    v_result := jsonb_build_object(
      'success', TRUE,
      'conversation_memory_id', v_conversation_memory_id,
      'user_id', p_user_id,
      'topics_processed', COALESCE(array_length(p_extracted_topics, 1), 0),
      'timestamp', NOW()
    );
    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    v_result := jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM,
      'error_detail', SQLSTATE,
      'error_hint', 'Check that all required fields are provided and foreign keys exist',
      'timestamp', NOW()
    );
    RETURN v_result;
  END;
  $$;


--
-- Name: prevent_library_document_deletion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_library_document_deletion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.is_library_asset = true THEN
    RAISE EXCEPTION 'Cannot delete library asset document (id: %), title: %', OLD.id, OLD.title;
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: record_failed_attempt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_failed_attempt(p_email_hash text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
  DECLARE
    v_attempts int;
    v_lock_duration interval;
  BEGIN
    -- Insert or update failed attempts
    INSERT INTO account_lockouts (email_hash, failed_attempts, updated_at)
    VALUES (p_email_hash, 1, now())
    ON CONFLICT (email_hash)
    DO UPDATE SET
      failed_attempts = account_lockouts.failed_attempts + 1,
      updated_at = now();

    -- Get current attempt count
    SELECT failed_attempts INTO v_attempts
    FROM account_lockouts
    WHERE email_hash = p_email_hash;

    -- Calculate lockout duration
    IF v_attempts >= 20 THEN
      v_lock_duration := interval '24 hours';
    ELSIF v_attempts >= 10 THEN
      v_lock_duration := interval '1 hour';
    ELSIF v_attempts >= 5 THEN
      v_lock_duration := interval '15 minutes';
    ELSE
      RETURN; -- No lockout yet
    END IF;

    -- Apply lockout
    UPDATE account_lockouts
    SET locked_until = now() + v_lock_duration
    WHERE email_hash = p_email_hash;

    -- Optional: Send notification (integrate with existing notification system)
    PERFORM pg_notify('account_locked',
      json_build_object(
        'email_hash', p_email_hash,
        'attempts', v_attempts,
        'locked_until', now() + v_lock_duration
      )::text
    );
  END;
  $$;


--
-- Name: save_document_transaction(text, text, text, text, bigint, text, integer, integer, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_document_transaction(p_title text, p_author text, p_storage_path text, p_mime_type text, p_file_size bigint, p_content text, p_word_count integer, p_page_count integer, p_uploaded_by uuid, p_source_type text, p_source_url text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: save_documents_batch(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_documents_batch(p_documents jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
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
$$;


--
-- Name: set_quota_for_all(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_quota_for_all(p_set_total integer, p_only_role text DEFAULT NULL::text) RETURNS TABLE(users_updated integer, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Allow 0 for disable, or any positive number including 999999999 for unlimited
  IF p_set_total < 0 THEN
    RETURN QUERY SELECT 0, 'Quota cannot be negative';
    RETURN;
  END IF;

  -- Special case: Setting to 0 means disable
  IF p_set_total = 0 THEN
    UPDATE user_invitation_quotas q
    SET
      total_invites_granted = 0,
      invites_used = 0
    FROM users u
    WHERE q.user_id = u.id
      AND u.deleted_at IS NULL
      AND (p_only_role IS NULL OR u.role::text = p_only_role);
  ELSE
    -- Normal case: Set total, preserve used count
    UPDATE user_invitation_quotas q
    SET total_invites_granted = p_set_total
    FROM users u
    WHERE q.user_id = u.id
      AND u.deleted_at IS NULL
      AND (p_only_role IS NULL OR u.role::text = p_only_role);
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF p_set_total = 0 THEN
    RETURN QUERY SELECT v_updated_count,
      'Invitations disabled for ' || v_updated_count || ' users';
  ELSIF p_set_total >= 999999999 THEN
    RETURN QUERY SELECT v_updated_count,
      'Unlimited invitations set for ' || v_updated_count || ' users';
  ELSE
    RETURN QUERY SELECT v_updated_count,
      'Quota set to ' || p_set_total || ' for ' || v_updated_count || ' users';
  END IF;
END;
$$;


--
-- Name: set_quota_for_user(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_quota_for_user(p_user_id uuid, p_set_total integer) RETURNS TABLE(success boolean, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  -- Allow 0 for disable, or any positive number including 999999999 for unlimited
  IF p_set_total < 0 THEN
    RETURN QUERY SELECT false, 'Quota cannot be negative';
    RETURN;
  END IF;

  -- Special case: Setting to 0 means disable (set used = total)
  IF p_set_total = 0 THEN
    UPDATE user_invitation_quotas
    SET
      total_invites_granted = 0,
      invites_used = 0
    WHERE user_id = p_user_id;
  ELSE
    -- Normal case: Set total, preserve used count
    UPDATE user_invitation_quotas
    SET total_invites_granted = p_set_total
    WHERE user_id = p_user_id;
  END IF;

  IF FOUND THEN
    IF p_set_total = 0 THEN
      RETURN QUERY SELECT true, 'Invitations disabled for user';
    ELSIF p_set_total >= 999999999 THEN
      RETURN QUERY SELECT true, 'Unlimited invitations set for user';
    ELSE
      RETURN QUERY SELECT true, 'Quota set to ' || p_set_total || ' invitations';
    END IF;
  ELSE
    RETURN QUERY SELECT false, 'User quota not found';
  END IF;
END;
$$;


--
-- Name: track_onboarding_milestone(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_onboarding_milestone(p_user_id uuid, p_milestone_type text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO user_onboarding_milestones (user_id, milestone_type, metadata)
  VALUES (p_user_id, p_milestone_type, p_metadata)
  ON CONFLICT (user_id, milestone_type) DO NOTHING;
  
  -- If this is the first_successful_answer, also mark onboarding as complete
  IF p_milestone_type = 'first_successful_answer' THEN
    INSERT INTO user_onboarding_milestones (user_id, milestone_type, metadata)
    VALUES (p_user_id, 'onboarding_complete', p_metadata || jsonb_build_object('auto_completed', true))
    ON CONFLICT (user_id, milestone_type) DO NOTHING;
  END IF;
  
  RETURN TRUE;
END;
$$;


--
-- Name: update_invitation_tokens_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invitation_tokens_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_waitlist_signups_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_waitlist_signups_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_lockouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_lockouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_hash text NOT NULL,
    failed_attempts integer DEFAULT 0,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    role public.user_role DEFAULT 'USER'::public.user_role,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    invitation_token text,
    invitation_expires_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deletion_requested_at timestamp with time zone,
    deletion_token_hash character varying(255),
    deletion_token_expires_at timestamp with time zone,
    deletion_confirmed boolean DEFAULT false,
    auth_user_id uuid,
    terms_accepted_version character varying(20),
    terms_accepted_at timestamp with time zone,
    privacy_policy_accepted_version character varying(20),
    privacy_policy_accepted_at timestamp with time zone,
    cookie_consent character varying(20),
    cookie_consent_at timestamp with time zone,
    age_verified boolean DEFAULT false,
    age_verified_at timestamp with time zone,
    age_confirmed boolean,
    privacy_accepted_at timestamp with time zone,
    cookies_accepted_at timestamp with time zone,
    consent_version character varying(20) DEFAULT NULL::character varying,
    deletion_token uuid,
    CONSTRAINT users_email_format CHECK ((email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text))
);


--
-- Name: COLUMN users.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.deleted_at IS 'Soft delete timestamp - NULL means active, non-NULL means deleted';


--
-- Name: COLUMN users.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.auth_user_id IS 'References auth.users.id - will replace clerk_id as primary identifier';


--
-- Name: COLUMN users.terms_accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.terms_accepted_at IS 'Timestamp when user accepted Terms of Service';


--
-- Name: COLUMN users.age_confirmed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.age_confirmed IS 'User confirmed they are 13+ years old (COPPA compliance)';


--
-- Name: COLUMN users.privacy_accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.privacy_accepted_at IS 'Timestamp when user accepted Privacy Policy';


--
-- Name: COLUMN users.cookies_accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.cookies_accepted_at IS 'Timestamp when user accepted Cookie Policy (optional)';


--
-- Name: COLUMN users.consent_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.consent_version IS 'Version of T&C/Privacy Policy user agreed to (e.g., "1.0")';


--
-- Name: active_users; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_users WITH (security_invoker='true') AS
 SELECT id,
    email,
    name,
    role,
    invited_by,
    created_at,
    updated_at,
    invitation_token,
    invitation_expires_at,
    deleted_at,
    deletion_requested_at,
    deletion_token_hash,
    deletion_token_expires_at,
    deletion_confirmed,
    auth_user_id
   FROM public.users
  WHERE (deleted_at IS NULL);


--
-- Name: api_usage_internal_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_usage_internal_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    service text NOT NULL,
    total_tokens integer DEFAULT 0,
    operation_count integer DEFAULT 1,
    estimated_cost_usd numeric(10,6),
    request_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '2 years'::interval)
);


--
-- Name: TABLE api_usage_internal_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.api_usage_internal_log IS 'Internal usage log for donation rollup aggregation (admin only, 24-month retention)';


--
-- Name: COLUMN api_usage_internal_log.service; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_usage_internal_log.service IS 'Service identifier: openai, voyage, pinecone, resend, supabase';


--
-- Name: COLUMN api_usage_internal_log.total_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_usage_internal_log.total_tokens IS 'LLM tokens consumed (0 for non-token operations like Pinecone/email)';


--
-- Name: COLUMN api_usage_internal_log.operation_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_usage_internal_log.operation_count IS 'Number of operations (1 for token ops, can be >1 for batch operations)';


--
-- Name: COLUMN api_usage_internal_log.estimated_cost_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_usage_internal_log.estimated_cost_usd IS 'Raw calculated cost (no display floor/cap applied)';


--
-- Name: COLUMN api_usage_internal_log.request_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_usage_internal_log.request_id IS 'Idempotency key (prevents duplicate logs on retries)';


--
-- Name: COLUMN api_usage_internal_log.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_usage_internal_log.expires_at IS 'Auto-deletion timestamp (24 months from creation)';


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    auth_user_id uuid,
    CONSTRAINT sessions_title_length CHECK (((length(title) >= 1) AND (length(title) <= 200)))
);


--
-- Name: COLUMN chat_sessions.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_sessions.auth_user_id IS 'Denormalized auth.users.id for RLS';


--
-- Name: chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid,
    content text NOT NULL,
    chunk_index integer NOT NULL,
    token_count integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chunks_content_not_empty CHECK ((length(content) > 0)),
    CONSTRAINT chunks_positive_index CHECK ((chunk_index >= 0))
);


--
-- Name: conversation_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid,
    conversation_id uuid,
    question_text text NOT NULL,
    question_intent character varying(50) DEFAULT 'exploratory'::character varying NOT NULL,
    question_complexity numeric(3,2) DEFAULT 0.5,
    ambiguity_score numeric(3,2) DEFAULT 0.0,
    extracted_topics text[] DEFAULT '{}'::text[] NOT NULL,
    user_satisfaction integer,
    clarification_requested boolean DEFAULT false,
    follow_up_generated boolean DEFAULT false,
    is_follow_up boolean DEFAULT false,
    related_conversation_ids uuid[] DEFAULT '{}'::uuid[],
    personalized_threshold numeric(3,2),
    recommended_complexity character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    had_search_results boolean DEFAULT true,
    auth_user_id uuid,
    CONSTRAINT conversation_memory_ambiguity_score_check CHECK (((ambiguity_score >= 0.0) AND (ambiguity_score <= 1.0))),
    CONSTRAINT conversation_memory_personalized_threshold_check CHECK (((personalized_threshold IS NULL) OR ((personalized_threshold >= 0.0) AND (personalized_threshold <= 1.0)))),
    CONSTRAINT conversation_memory_question_complexity_check CHECK (((question_complexity >= 0.0) AND (question_complexity <= 1.0))),
    CONSTRAINT conversation_memory_recommended_complexity_check CHECK (((recommended_complexity)::text = ANY ((ARRAY['beginner'::character varying, 'intermediate'::character varying, 'advanced'::character varying, NULL::character varying])::text[]))),
    CONSTRAINT conversation_memory_user_satisfaction_check CHECK (((user_satisfaction IS NULL) OR ((user_satisfaction >= 1) AND (user_satisfaction <= 5))))
);
ALTER TABLE ONLY public.conversation_memory ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY public.conversation_memory ALTER COLUMN question_intent SET STATISTICS 500;


--
-- Name: COLUMN conversation_memory.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation_memory.auth_user_id IS 'Denormalized auth.users.id for memory tracking';


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    question text NOT NULL,
    answer text,
    sources jsonb,
    created_at timestamp with time zone DEFAULT now(),
    session_id uuid,
    deleted_at timestamp with time zone,
    auth_user_id uuid
);


--
-- Name: COLUMN conversations.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.auth_user_id IS 'Denormalized auth.users.id for RLS and query performance';


--
-- Name: daily_donation_estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_donation_estimates (
    user_id uuid NOT NULL,
    auth_user_id uuid NOT NULL,
    current_month_estimate_usd numeric(10,2) DEFAULT 0.00 NOT NULL,
    total_tokens_used bigint DEFAULT 0,
    total_operations integer DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE daily_donation_estimates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.daily_donation_estimates IS 'Aggregated monthly donation estimates shown to users';


--
-- Name: COLUMN daily_donation_estimates.current_month_estimate_usd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_donation_estimates.current_month_estimate_usd IS 'Total estimated cost for current calendar month (no floor/cap applied at storage)';


--
-- Name: COLUMN daily_donation_estimates.total_tokens_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_donation_estimates.total_tokens_used IS 'Total LLM tokens consumed this month (input + output)';


--
-- Name: COLUMN daily_donation_estimates.total_operations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_donation_estimates.total_operations IS 'Total operations this month (Pinecone queries, emails, etc.)';


--
-- Name: COLUMN daily_donation_estimates.last_updated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_donation_estimates.last_updated IS 'Last rollup execution timestamp (should be ~2:00 UTC daily)';


--
-- Name: data_export_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_export_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    download_url text,
    file_size_bytes bigint,
    expires_at timestamp with time zone,
    idempotency_key character varying(255),
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    auth_user_id uuid
);


--
-- Name: COLUMN data_export_requests.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.data_export_requests.auth_user_id IS 'Denormalized auth.users.id for GDPR exports';


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    author text,
    storage_path text NOT NULL,
    mime_type text,
    file_size bigint,
    content text,
    word_count integer,
    page_count integer,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    source_type character varying(20) DEFAULT 'upload'::character varying,
    source_url text,
    amazon_url text,
    download_enabled boolean DEFAULT true,
    contact_person text,
    contact_email text,
    resource_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    old_title text,
    is_library_asset boolean DEFAULT true,
    CONSTRAINT documents_positive_size CHECK ((file_size > 0)),
    CONSTRAINT documents_source_type_check CHECK (((source_type)::text = ANY (ARRAY[('upload'::character varying)::text, ('web_scraped'::character varying)::text]))),
    CONSTRAINT documents_title_length CHECK (((length(title) >= 1) AND (length(title) <= 500)))
);


--
-- Name: COLUMN documents.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.documents.metadata IS 'Stores file-specific metadata: chapters (EPUB), duration (audio/video), dimensions (images), etc.';


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(255) NOT NULL,
    user_id uuid NOT NULL,
    endpoint character varying(255) NOT NULL,
    response_status integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
    auth_user_id uuid
);


--
-- Name: COLUMN idempotency_keys.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.idempotency_keys.auth_user_id IS 'Denormalized auth.users.id for request deduplication';


--
-- Name: ingest_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid,
    status public.ingest_status DEFAULT 'pending'::public.ingest_status,
    error_message text,
    chunks_created integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: invitation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    role text NOT NULL,
    invited_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name text,
    CONSTRAINT invitation_tokens_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'CONTRIBUTOR'::text, 'USER'::text])))
);


--
-- Name: COLUMN invitation_tokens.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invitation_tokens.name IS 'Optional name for the invitee';


--
-- Name: migration_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    clerk_id text NOT NULL,
    alert_type text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: migration_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    clerk_user_id text NOT NULL,
    supabase_user_id uuid NOT NULL,
    migrated_at timestamp with time zone DEFAULT now(),
    ip_address text,
    user_agent text
);


--
-- Name: privacy_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.privacy_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    actor_id uuid,
    ip_address inet,
    user_agent text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    auth_user_id uuid
);


--
-- Name: COLUMN privacy_audit_log.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.privacy_audit_log.auth_user_id IS 'Denormalized auth.users.id for audit trail';


--
-- Name: topic_progression; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_progression (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic_name character varying(100) NOT NULL,
    expertise_level numeric(3,2) DEFAULT 0.0,
    first_interaction_date timestamp with time zone DEFAULT now(),
    last_interaction_date timestamp with time zone DEFAULT now(),
    total_interactions integer DEFAULT 1,
    successful_interactions integer DEFAULT 0,
    progression_rate numeric(4,3) DEFAULT 0.0,
    plateau_detected boolean DEFAULT false,
    connected_topics text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    auth_user_id uuid,
    CONSTRAINT topic_progression_expertise_level_check CHECK (((expertise_level >= 0.0) AND (expertise_level <= 1.0))),
    CONSTRAINT topic_progression_progression_rate_check CHECK ((progression_rate >= 0.0)),
    CONSTRAINT topic_progression_successful_interactions_check CHECK ((successful_interactions >= 0)),
    CONSTRAINT topic_progression_total_interactions_check CHECK ((total_interactions >= 0))
);
ALTER TABLE ONLY public.topic_progression ALTER COLUMN topic_name SET STATISTICS 500;


--
-- Name: COLUMN topic_progression.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.topic_progression.auth_user_id IS 'Denormalized auth.users.id for learning progression';


--
-- Name: upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_sessions (
    id text NOT NULL,
    user_id uuid,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    auth_user_id uuid
);


--
-- Name: COLUMN upload_sessions.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.upload_sessions.auth_user_id IS 'Denormalized auth.users.id for upload tracking';


--
-- Name: usage_tracking_consent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_tracking_consent (
    user_id uuid NOT NULL,
    auth_user_id uuid NOT NULL,
    tracking_enabled boolean DEFAULT true,
    consent_given_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE usage_tracking_consent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.usage_tracking_consent IS 'User consent for donation cost transparency tracking (opt-out available)';


--
-- Name: COLUMN usage_tracking_consent.tracking_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usage_tracking_consent.tracking_enabled IS 'If false, no usage data logged for this user';


--
-- Name: user_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_context (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic_familiarity jsonb DEFAULT '{}'::jsonb,
    question_patterns jsonb DEFAULT '{}'::jsonb,
    behavioral_insights jsonb DEFAULT '{}'::jsonb,
    current_session_topics text[] DEFAULT '{}'::text[],
    cross_session_connections jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    auth_user_id uuid
);
ALTER TABLE ONLY public.user_context ALTER COLUMN user_id SET STATISTICS 1000;


--
-- Name: COLUMN user_context.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_context.auth_user_id IS 'Denormalized auth.users.id for user preferences';


--
-- Name: user_invitation_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invitation_quotas (
    user_id uuid NOT NULL,
    auth_user_id uuid,
    total_invites_granted integer DEFAULT 3 NOT NULL,
    invites_used integer DEFAULT 0 NOT NULL,
    invites_remaining integer GENERATED ALWAYS AS (GREATEST((total_invites_granted - invites_used), 0)) STORED,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_total_positive CHECK ((total_invites_granted >= 0)),
    CONSTRAINT check_used_nonnegative CHECK ((invites_used >= 0))
);


--
-- Name: user_onboarding_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_onboarding_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    milestone_type text NOT NULL,
    completed_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    auth_user_id uuid,
    CONSTRAINT user_onboarding_milestones_milestone_type_check CHECK ((milestone_type = ANY (ARRAY['invited'::text, 'first_login'::text, 'first_document_view'::text, 'first_document_upload'::text, 'first_chat'::text, 'first_successful_answer'::text, 'onboarding_complete'::text])))
);


--
-- Name: COLUMN user_onboarding_milestones.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_onboarding_milestones.auth_user_id IS 'Denormalized auth.users.id for onboarding tracking';


--
-- Name: user_onboarding_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_onboarding_status WITH (security_invoker='on') AS
 SELECT id AS user_id,
    email,
    name,
    role,
    created_at,
    created_at AS user_created_at,
    invitation_token,
    invitation_expires_at,
    NULL::timestamp without time zone AS first_login_at,
    NULL::timestamp without time zone AS first_chat_at,
    NULL::timestamp without time zone AS first_successful_answer_at,
    NULL::timestamp without time zone AS onboarding_complete_at,
    created_at AS invited_at,
        CASE
            WHEN ((auth_user_id IS NULL) AND (invitation_token IS NOT NULL)) THEN 'invited'::text
            ELSE 'completed'::text
        END AS current_stage,
        CASE
            WHEN ((auth_user_id IS NULL) AND (invitation_token IS NOT NULL)) THEN 0
            ELSE 100
        END AS progress_percentage,
        CASE
            WHEN ((auth_user_id IS NULL) AND (invitation_token IS NOT NULL)) THEN (EXTRACT(epoch FROM (now() - created_at)) / (86400)::numeric)
            ELSE (0)::numeric
        END AS days_stuck
   FROM public.users;


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    analytics_enabled boolean DEFAULT true,
    essential_cookies_only boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    consent_timestamp timestamp with time zone,
    consent_ip_address inet,
    consent_policy_version character varying(20),
    consent_user_agent text,
    auth_user_id uuid,
    preferences jsonb DEFAULT '{}'::jsonb
);


--
-- Name: COLUMN user_preferences.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.auth_user_id IS 'Denormalized auth.users.id for user settings';


--
-- Name: user_sent_invitations_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sent_invitations_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_user_id uuid NOT NULL,
    sender_auth_user_id uuid,
    invited_user_id uuid,
    invitee_email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_by_admin boolean DEFAULT false NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    invitation_token_id uuid,
    CONSTRAINT check_email_format CHECK ((POSITION(('@'::text) IN (invitee_email)) > 1)),
    CONSTRAINT check_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: waitlist_signups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist_signups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    church_ministry_affiliation text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invited_at timestamp with time zone,
    registered_at timestamp with time zone,
    notes text,
    phone text,
    email_consent boolean DEFAULT false NOT NULL,
    sms_consent boolean DEFAULT false NOT NULL,
    CONSTRAINT valid_email CHECK ((email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)),
    CONSTRAINT valid_phone CHECK (((phone IS NULL) OR (phone ~ '^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$'::text))),
    CONSTRAINT waitlist_signups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'invited'::text, 'registered'::text])))
);


--
-- Name: TABLE waitlist_signups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.waitlist_signups IS 'Stores waitlist signups for the invitation-only system';


--
-- Name: COLUMN waitlist_signups.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.id IS 'Unique identifier for the signup';


--
-- Name: COLUMN waitlist_signups.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.name IS 'Full name of the person signing up';


--
-- Name: COLUMN waitlist_signups.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.email IS 'Email address (must be unique)';


--
-- Name: COLUMN waitlist_signups.church_ministry_affiliation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.church_ministry_affiliation IS 'Church or ministry organization affiliation';


--
-- Name: COLUMN waitlist_signups.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.status IS 'Signup status: pending, invited, or registered';


--
-- Name: COLUMN waitlist_signups.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.created_at IS 'Timestamp when the signup was created';


--
-- Name: COLUMN waitlist_signups.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.updated_at IS 'Timestamp when the signup was last updated';


--
-- Name: COLUMN waitlist_signups.invited_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.invited_at IS 'Timestamp when invitation was sent';


--
-- Name: COLUMN waitlist_signups.registered_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.registered_at IS 'Timestamp when user completed registration';


--
-- Name: COLUMN waitlist_signups.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.notes IS 'Optional admin notes about the signup';


--
-- Name: COLUMN waitlist_signups.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.phone IS 'Optional phone number for SMS notifications';


--
-- Name: COLUMN waitlist_signups.email_consent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.email_consent IS 'User consent to receive emails (required to submit form)';


--
-- Name: COLUMN waitlist_signups.sms_consent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.waitlist_signups.sms_consent IS 'User consent to receive SMS messages (optional)';


--
-- Name: account_lockouts account_lockouts_email_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_lockouts
    ADD CONSTRAINT account_lockouts_email_hash_key UNIQUE (email_hash);


--
-- Name: account_lockouts account_lockouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_lockouts
    ADD CONSTRAINT account_lockouts_pkey PRIMARY KEY (id);


--
-- Name: api_usage_internal_log api_usage_internal_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_usage_internal_log
    ADD CONSTRAINT api_usage_internal_log_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: conversation_memory conversation_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: daily_donation_estimates daily_donation_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_donation_estimates
    ADD CONSTRAINT daily_donation_estimates_pkey PRIMARY KEY (user_id);


--
-- Name: data_export_requests data_export_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_export_requests
    ADD CONSTRAINT data_export_requests_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: ingest_jobs ingest_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_jobs
    ADD CONSTRAINT ingest_jobs_pkey PRIMARY KEY (id);


--
-- Name: invitation_tokens invitation_tokens_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_tokens
    ADD CONSTRAINT invitation_tokens_email_key UNIQUE (email);


--
-- Name: invitation_tokens invitation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_tokens
    ADD CONSTRAINT invitation_tokens_pkey PRIMARY KEY (id);


--
-- Name: invitation_tokens invitation_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_tokens
    ADD CONSTRAINT invitation_tokens_token_key UNIQUE (token);


--
-- Name: migration_alerts migration_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_alerts
    ADD CONSTRAINT migration_alerts_pkey PRIMARY KEY (id);


--
-- Name: migration_log migration_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_log
    ADD CONSTRAINT migration_log_pkey PRIMARY KEY (id);


--
-- Name: privacy_audit_log privacy_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_audit_log
    ADD CONSTRAINT privacy_audit_log_pkey PRIMARY KEY (id);


--
-- Name: topic_progression topic_progression_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_progression
    ADD CONSTRAINT topic_progression_pkey PRIMARY KEY (id);


--
-- Name: topic_progression topic_progression_user_id_topic_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_progression
    ADD CONSTRAINT topic_progression_user_id_topic_name_key UNIQUE (user_id, topic_name);


--
-- Name: waitlist_signups unique_email; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_signups
    ADD CONSTRAINT unique_email UNIQUE (email);


--
-- Name: upload_sessions upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: usage_tracking_consent usage_tracking_consent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_tracking_consent
    ADD CONSTRAINT usage_tracking_consent_pkey PRIMARY KEY (user_id);


--
-- Name: user_context user_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_context
    ADD CONSTRAINT user_context_pkey PRIMARY KEY (id);


--
-- Name: user_context user_context_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_context
    ADD CONSTRAINT user_context_user_id_unique UNIQUE (user_id);


--
-- Name: user_invitation_quotas user_invitation_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitation_quotas
    ADD CONSTRAINT user_invitation_quotas_pkey PRIMARY KEY (user_id);


--
-- Name: user_onboarding_milestones user_onboarding_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_milestones
    ADD CONSTRAINT user_onboarding_milestones_pkey PRIMARY KEY (id);


--
-- Name: user_onboarding_milestones user_onboarding_milestones_user_id_milestone_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_milestones
    ADD CONSTRAINT user_onboarding_milestones_user_id_milestone_type_key UNIQUE (user_id, milestone_type);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_sent_invitations_log user_sent_invitations_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sent_invitations_log
    ADD CONSTRAINT user_sent_invitations_log_pkey PRIMARY KEY (id);


--
-- Name: users users_deletion_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_deletion_token_key UNIQUE (deletion_token);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: waitlist_signups waitlist_signups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_signups
    ADD CONSTRAINT waitlist_signups_pkey PRIMARY KEY (id);


--
-- Name: idx_account_lockouts_email_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_lockouts_email_hash ON public.account_lockouts USING btree (email_hash);


--
-- Name: idx_account_lockouts_locked_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_lockouts_locked_until ON public.account_lockouts USING btree (locked_until);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.privacy_audit_log USING btree (action, created_at DESC);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.privacy_audit_log USING btree (user_id, created_at DESC);


--
-- Name: idx_chat_sessions_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_auth_user_id ON public.chat_sessions USING btree (auth_user_id);


--
-- Name: idx_chat_sessions_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_deleted_at ON public.chat_sessions USING btree (user_id, deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_chat_sessions_id_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_id_user ON public.chat_sessions USING btree (id, user_id);


--
-- Name: idx_chat_sessions_user_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_user_updated ON public.chat_sessions USING btree (user_id, updated_at DESC);


--
-- Name: idx_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_document_id ON public.chunks USING btree (document_id);


--
-- Name: idx_chunks_document_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_document_index ON public.chunks USING btree (document_id, chunk_index);


--
-- Name: idx_consent_auth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_auth_user ON public.usage_tracking_consent USING btree (auth_user_id);


--
-- Name: idx_consent_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_enabled ON public.usage_tracking_consent USING btree (tracking_enabled);


--
-- Name: idx_conversation_memory_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_auth_user_id ON public.conversation_memory USING btree (auth_user_id);


--
-- Name: idx_conversation_memory_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_conversation ON public.conversation_memory USING btree (conversation_id);


--
-- Name: idx_conversation_memory_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_created ON public.conversation_memory USING btree (created_at);


--
-- Name: idx_conversation_memory_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_created_at ON public.conversation_memory USING btree (created_at DESC);


--
-- Name: idx_conversation_memory_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_intent ON public.conversation_memory USING btree (question_intent);


--
-- Name: idx_conversation_memory_satisfaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_satisfaction ON public.conversation_memory USING btree (user_satisfaction) WHERE (user_satisfaction IS NOT NULL);


--
-- Name: idx_conversation_memory_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_session ON public.conversation_memory USING btree (session_id);


--
-- Name: idx_conversation_memory_topics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_topics ON public.conversation_memory USING gin (extracted_topics);


--
-- Name: idx_conversation_memory_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_memory_user_id ON public.conversation_memory USING btree (user_id);


--
-- Name: idx_conversation_quality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_quality ON public.conversation_memory USING btree (user_satisfaction, clarification_requested, created_at DESC);


--
-- Name: idx_conversations_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_auth_user_id ON public.conversations USING btree (auth_user_id);


--
-- Name: idx_conversations_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_deleted_at ON public.conversations USING btree (session_id, deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_conversations_session_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_session_created ON public.conversations USING btree (session_id, created_at);


--
-- Name: idx_conversations_session_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_session_user_created ON public.conversations USING btree (session_id, user_id, created_at DESC);


--
-- Name: idx_conversations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_user ON public.conversations USING btree (user_id);


--
-- Name: idx_daily_estimates_auth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_estimates_auth_user ON public.daily_donation_estimates USING btree (auth_user_id);


--
-- Name: idx_daily_estimates_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_estimates_updated ON public.daily_donation_estimates USING btree (last_updated);


--
-- Name: idx_data_export_requests_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_export_requests_auth_user_id ON public.data_export_requests USING btree (auth_user_id);


--
-- Name: idx_documents_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_created ON public.documents USING btree (created_at DESC);


--
-- Name: idx_documents_library_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_library_asset ON public.documents USING btree (is_library_asset) WHERE (is_library_asset = true);


--
-- Name: idx_documents_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_metadata ON public.documents USING gin (metadata);


--
-- Name: idx_documents_old_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_old_title ON public.documents USING btree (old_title);


--
-- Name: idx_documents_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_title ON public.documents USING btree (title);


--
-- Name: idx_documents_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_uploaded_by ON public.documents USING btree (uploaded_by);


--
-- Name: idx_export_requests_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_requests_expires ON public.data_export_requests USING btree (expires_at) WHERE ((status)::text = 'completed'::text);


--
-- Name: idx_export_requests_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_requests_idempotency ON public.data_export_requests USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_export_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_requests_status ON public.data_export_requests USING btree (status);


--
-- Name: idx_export_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_requests_user ON public.data_export_requests USING btree (user_id);


--
-- Name: idx_idempotency_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_expires ON public.idempotency_keys USING btree (expires_at);


--
-- Name: idx_idempotency_keys_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_keys_auth_user_id ON public.idempotency_keys USING btree (auth_user_id);


--
-- Name: idx_idempotency_keys_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_idempotency_keys_user_id ON public.idempotency_keys USING btree (user_id);


--
-- Name: idx_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_idempotency_unique ON public.idempotency_keys USING btree (key, user_id, endpoint);


--
-- Name: idx_ingest_jobs_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_jobs_document_id ON public.ingest_jobs USING btree (document_id);


--
-- Name: idx_ingest_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_jobs_status ON public.ingest_jobs USING btree (status);


--
-- Name: idx_internal_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_log_created ON public.api_usage_internal_log USING btree (created_at);


--
-- Name: idx_internal_log_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_log_expires ON public.api_usage_internal_log USING btree (expires_at);


--
-- Name: idx_internal_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_log_user ON public.api_usage_internal_log USING btree (user_id);


--
-- Name: idx_internal_user_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_user_month ON public.api_usage_internal_log USING btree (user_id, created_at DESC);


--
-- Name: idx_invitation_tokens_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_tokens_email ON public.invitation_tokens USING btree (email);


--
-- Name: idx_invitation_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_tokens_expires_at ON public.invitation_tokens USING btree (expires_at);


--
-- Name: idx_invitation_tokens_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_tokens_invited_by ON public.invitation_tokens USING btree (invited_by);


--
-- Name: idx_invitation_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitation_tokens_token ON public.invitation_tokens USING btree (token);


--
-- Name: idx_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_email ON public.user_sent_invitations_log USING btree (invitee_email);


--
-- Name: idx_invitations_invited_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_invited_user ON public.user_sent_invitations_log USING btree (invited_user_id);


--
-- Name: idx_invitations_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_sender ON public.user_sent_invitations_log USING btree (sender_user_id);


--
-- Name: idx_invitations_sender_auth; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_sender_auth ON public.user_sent_invitations_log USING btree (sender_auth_user_id);


--
-- Name: idx_invitations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_status ON public.user_sent_invitations_log USING btree (status);


--
-- Name: idx_invitations_token_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_token_id ON public.user_sent_invitations_log USING btree (invitation_token_id);


--
-- Name: idx_migration_alerts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_alerts_created ON public.migration_alerts USING btree (created_at);


--
-- Name: idx_migration_alerts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_alerts_type ON public.migration_alerts USING btree (alert_type);


--
-- Name: idx_migration_log_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_log_email ON public.migration_log USING btree (email);


--
-- Name: idx_migration_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_log_timestamp ON public.migration_log USING btree (migrated_at);


--
-- Name: idx_privacy_audit_log_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_audit_log_actor_id ON public.privacy_audit_log USING btree (actor_id);


--
-- Name: idx_privacy_audit_log_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_audit_log_auth_user_id ON public.privacy_audit_log USING btree (auth_user_id);


--
-- Name: idx_quotas_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotas_auth_user_id ON public.user_invitation_quotas USING btree (auth_user_id);


--
-- Name: idx_topic_progression_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_progression_auth_user_id ON public.topic_progression USING btree (auth_user_id);


--
-- Name: idx_topic_progression_last_interaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_progression_last_interaction ON public.topic_progression USING btree (last_interaction_date);


--
-- Name: idx_topic_progression_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_progression_level ON public.topic_progression USING btree (expertise_level);


--
-- Name: idx_topic_progression_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_progression_topic ON public.topic_progression USING btree (topic_name);


--
-- Name: idx_topic_progression_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_progression_updated ON public.topic_progression USING btree (updated_at);


--
-- Name: idx_topic_progression_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_progression_user_id ON public.topic_progression USING btree (user_id);


--
-- Name: idx_topic_progression_user_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_progression_user_topic ON public.topic_progression USING btree (user_id, topic_name);


--
-- Name: idx_upload_sessions_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_sessions_auth_user_id ON public.upload_sessions USING btree (auth_user_id);


--
-- Name: idx_upload_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_sessions_user_id ON public.upload_sessions USING btree (user_id);


--
-- Name: idx_user_context_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_context_auth_user_id ON public.user_context USING btree (auth_user_id);


--
-- Name: idx_user_context_session_topics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_context_session_topics ON public.user_context USING gin (current_session_topics);


--
-- Name: idx_user_context_topics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_context_topics ON public.user_context USING gin (topic_familiarity);


--
-- Name: idx_user_context_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_context_updated ON public.user_context USING btree (updated_at);


--
-- Name: idx_user_context_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_context_user_id ON public.user_context USING btree (user_id);


--
-- Name: idx_user_onboarding_milestones_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_onboarding_milestones_auth_user_id ON public.user_onboarding_milestones USING btree (auth_user_id);


--
-- Name: idx_user_onboarding_milestones_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_onboarding_milestones_completed_at ON public.user_onboarding_milestones USING btree (completed_at);


--
-- Name: idx_user_onboarding_milestones_milestone_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_onboarding_milestones_milestone_type ON public.user_onboarding_milestones USING btree (milestone_type);


--
-- Name: idx_user_onboarding_milestones_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_onboarding_milestones_user_id ON public.user_onboarding_milestones USING btree (user_id);


--
-- Name: idx_user_preferences_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_preferences_auth_user_id ON public.user_preferences USING btree (auth_user_id);


--
-- Name: idx_user_preferences_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_preferences_user ON public.user_preferences USING btree (user_id);


--
-- Name: idx_users_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_auth_user_id ON public.users USING btree (auth_user_id);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_deletion_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deletion_requested ON public.users USING btree (deletion_requested_at) WHERE ((deletion_requested_at IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_users_deletion_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deletion_token ON public.users USING btree (deletion_token_hash) WHERE (deletion_token_hash IS NOT NULL);


--
-- Name: idx_users_invitation_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_invitation_token ON public.users USING btree (invitation_token);


--
-- Name: idx_users_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_invited_by ON public.users USING btree (invited_by);


--
-- Name: idx_waitlist_signups_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_signups_created_at ON public.waitlist_signups USING btree (created_at DESC);


--
-- Name: idx_waitlist_signups_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_signups_email ON public.waitlist_signups USING btree (email);


--
-- Name: idx_waitlist_signups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_signups_status ON public.waitlist_signups USING btree (status);


--
-- Name: uq_internal_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_internal_request ON public.api_usage_internal_log USING btree (request_id) WHERE (request_id IS NOT NULL);


--
-- Name: documents prevent_library_deletion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_library_deletion BEFORE DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.prevent_library_document_deletion();


--
-- Name: users trigger_create_quota_on_signup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_quota_on_signup AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.create_user_quota_on_signup();


--
-- Name: user_invitation_quotas trigger_quota_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_quota_updated_at BEFORE UPDATE ON public.user_invitation_quotas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: invitation_tokens trigger_update_invitation_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_invitation_tokens_updated_at BEFORE UPDATE ON public.invitation_tokens FOR EACH ROW EXECUTE FUNCTION public.update_invitation_tokens_updated_at();


--
-- Name: topic_progression trigger_update_topic_progression_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_topic_progression_timestamp BEFORE UPDATE ON public.topic_progression FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: user_context trigger_update_user_context_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_user_context_timestamp BEFORE UPDATE ON public.user_context FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: waitlist_signups trigger_update_waitlist_signups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_waitlist_signups_updated_at BEFORE UPDATE ON public.waitlist_signups FOR EACH ROW EXECUTE FUNCTION public.update_waitlist_signups_updated_at();


--
-- Name: api_usage_internal_log api_usage_internal_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_usage_internal_log
    ADD CONSTRAINT api_usage_internal_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_sessions chat_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chunks chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: conversation_memory conversation_memory_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_memory conversation_memory_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: conversation_memory conversation_memory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT conversation_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_donation_estimates daily_donation_estimates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_donation_estimates
    ADD CONSTRAINT daily_donation_estimates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: data_export_requests data_export_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_export_requests
    ADD CONSTRAINT data_export_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_sessions fk_chat_sessions_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT fk_chat_sessions_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversation_memory fk_conversation_memory_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_memory
    ADD CONSTRAINT fk_conversation_memory_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversations fk_conversations_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT fk_conversations_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: data_export_requests fk_data_export_requests_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_export_requests
    ADD CONSTRAINT fk_data_export_requests_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: idempotency_keys fk_idempotency_keys_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT fk_idempotency_keys_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: privacy_audit_log fk_privacy_audit_log_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_audit_log
    ADD CONSTRAINT fk_privacy_audit_log_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: topic_progression fk_topic_progression_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_progression
    ADD CONSTRAINT fk_topic_progression_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: upload_sessions fk_upload_sessions_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT fk_upload_sessions_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_context fk_user_context_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_context
    ADD CONSTRAINT fk_user_context_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_onboarding_milestones fk_user_onboarding_milestones_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_milestones
    ADD CONSTRAINT fk_user_onboarding_milestones_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences fk_user_preferences_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT fk_user_preferences_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users fk_users_auth_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_auth_user_id FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: idempotency_keys idempotency_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ingest_jobs ingest_jobs_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_jobs
    ADD CONSTRAINT ingest_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: invitation_tokens invitation_tokens_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation_tokens
    ADD CONSTRAINT invitation_tokens_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: privacy_audit_log privacy_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_audit_log
    ADD CONSTRAINT privacy_audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: privacy_audit_log privacy_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_audit_log
    ADD CONSTRAINT privacy_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: topic_progression topic_progression_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_progression
    ADD CONSTRAINT topic_progression_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: upload_sessions upload_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: usage_tracking_consent usage_tracking_consent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_tracking_consent
    ADD CONSTRAINT usage_tracking_consent_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_context user_context_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_context
    ADD CONSTRAINT user_context_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_invitation_quotas user_invitation_quotas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitation_quotas
    ADD CONSTRAINT user_invitation_quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_onboarding_milestones user_onboarding_milestones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_onboarding_milestones
    ADD CONSTRAINT user_onboarding_milestones_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sent_invitations_log user_sent_invitations_log_invitation_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sent_invitations_log
    ADD CONSTRAINT user_sent_invitations_log_invitation_token_id_fkey FOREIGN KEY (invitation_token_id) REFERENCES public.invitation_tokens(id) ON DELETE CASCADE;


--
-- Name: user_sent_invitations_log user_sent_invitations_log_invited_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sent_invitations_log
    ADD CONSTRAINT user_sent_invitations_log_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_sent_invitations_log user_sent_invitations_log_sender_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sent_invitations_log
    ADD CONSTRAINT user_sent_invitations_log_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: invitation_tokens Admins can create invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create invitations" ON public.invitation_tokens FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.role = 'ADMIN'::public.user_role)))));


--
-- Name: user_invitation_quotas Admins can insert invitation quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert invitation quotas" ON public.user_invitation_quotas FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: user_invitation_quotas Admins can update invitation quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update invitation quotas" ON public.user_invitation_quotas FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: invitation_tokens Admins can update invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update invitations" ON public.invitation_tokens FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.role = 'ADMIN'::public.user_role)))));


--
-- Name: user_sent_invitations_log Admins can update sent invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update sent invitations" ON public.user_sent_invitations_log FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: invitation_tokens Admins can view all invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all invitations" ON public.invitation_tokens FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.role = 'ADMIN'::public.user_role)))));


--
-- Name: waitlist_signups Allow admins to update waitlist signups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admins to update waitlist signups" ON public.waitlist_signups FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: waitlist_signups Allow admins to view waitlist signups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admins to view waitlist signups" ON public.waitlist_signups FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: waitlist_signups Allow public to insert waitlist signups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public to insert waitlist signups" ON public.waitlist_signups FOR INSERT WITH CHECK (true);


--
-- Name: documents Everyone can read documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can read documents" ON public.documents FOR SELECT USING (true);


--
-- Name: user_onboarding_milestones Onboarding milestones access policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Onboarding milestones access policy" ON public.user_onboarding_milestones USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = auth.uid()) AND ((users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])) OR (users.id = user_onboarding_milestones.user_id))))));


--
-- Name: documents Only admins can delete documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete documents" ON public.documents FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = auth.uid()) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: documents Only admins/contributors can manage documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins/contributors can manage documents" ON public.documents FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = auth.uid()) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'CONTRIBUTOR'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: documents Only admins/contributors can update documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins/contributors can update documents" ON public.documents FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'CONTRIBUTOR'::public.user_role, 'SUPER_ADMIN'::public.user_role]))))));


--
-- Name: invitation_tokens Public can read invitations by token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read invitations by token" ON public.invitation_tokens FOR SELECT TO anon USING (((expires_at > now()) AND (accepted_at IS NULL)));


--
-- Name: chunks Service role can manage chunks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage chunks" ON public.chunks USING ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: ingest_jobs Service role can manage ingest jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage ingest jobs" ON public.ingest_jobs USING ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: account_lockouts Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.account_lockouts TO service_role USING (true) WITH CHECK (true);


--
-- Name: migration_alerts Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.migration_alerts TO service_role USING (true) WITH CHECK (true);


--
-- Name: migration_log Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.migration_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: upload_sessions Upload sessions access policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Upload sessions access policy" ON public.upload_sessions USING (((( SELECT auth.role() AS role) = 'service_role'::text) OR (user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])))))));


--
-- Name: user_sent_invitations_log Users can insert their own sent invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own sent invitations" ON public.user_sent_invitations_log FOR INSERT TO authenticated WITH CHECK ((sender_auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: chat_sessions Users can manage own chat sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_context Users can manage own context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own context" ON public.user_context TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: conversations Users can manage own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own conversations" ON public.conversations USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: conversation_memory Users can manage own memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own memory" ON public.conversation_memory TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_preferences Users can manage own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own preferences" ON public.user_preferences TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: topic_progression Users can manage own progression; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own progression" ON public.topic_progression TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: users Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: users Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role]))));


--
-- Name: account_lockouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;

--
-- Name: api_usage_internal_log admin_only_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only_read ON public.api_usage_internal_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = 'ADMIN'::public.user_role)))));


--
-- Name: api_usage_internal_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_usage_internal_log ENABLE ROW LEVEL SECURITY;

--
-- Name: privacy_audit_log audit_log_combined_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_combined_select ON public.privacy_audit_log FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = privacy_audit_log.user_id) AND (u.auth_user_id = auth.uid()) AND (u.deleted_at IS NULL)))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])) AND (u.deleted_at IS NULL))))));


--
-- Name: chat_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: chunks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: data_export_requests create_export_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY create_export_requests ON public.data_export_requests FOR INSERT TO authenticated WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: daily_donation_estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_donation_estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: data_export_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: idempotency_keys idempotency_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY idempotency_select ON public.idempotency_keys FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = idempotency_keys.user_id) AND (u.auth_user_id = auth.uid()) AND (u.deleted_at IS NULL)))));


--
-- Name: ingest_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingest_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitation_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;

--
-- Name: privacy_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.privacy_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_donation_estimates read_own_estimate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_own_estimate ON public.daily_donation_estimates FOR SELECT TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: topic_progression; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topic_progression ENABLE ROW LEVEL SECURITY;

--
-- Name: upload_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_tracking_consent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_tracking_consent ENABLE ROW LEVEL SECURITY;

--
-- Name: user_context; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_context ENABLE ROW LEVEL SECURITY;

--
-- Name: user_invitation_quotas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_invitation_quotas ENABLE ROW LEVEL SECURITY;

--
-- Name: user_onboarding_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_onboarding_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_sent_invitations_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_sent_invitations_log ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_tracking_consent users_manage_own_consent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_manage_own_consent ON public.usage_tracking_consent TO authenticated USING ((auth_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((auth_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: data_export_requests view_export_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY view_export_requests ON public.data_export_requests FOR SELECT TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])))))));


--
-- Name: user_invitation_quotas view_invitation_quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY view_invitation_quotas ON public.user_invitation_quotas FOR SELECT TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])))))));


--
-- Name: user_sent_invitations_log view_sent_invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY view_sent_invitations ON public.user_sent_invitations_log FOR SELECT TO authenticated USING (((sender_auth_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (users.role = ANY (ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role])))))));


--
-- Name: waitlist_signups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict MIoNA2uAbuuwbzLOxbB233XbEMkcUNR5QnrgnUha0IEwmBQi6IGyBf4tuZtNnfg

