--
-- PostgreSQL database dump
--


-- Dumped from database version 17.4


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS'
);


--
-- Name: clean_expired_share_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clean_expired_share_tokens() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM player_share_tokens WHERE expires_at < NOW();
END;
$$;


--
-- Name: create_registration_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_registration_notification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    event_name TEXT;
    notification_title TEXT;
    notification_message TEXT;
    notification_type TEXT;
BEGIN
    -- 只在状态真正改变时创建通知
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- 获取赛事名称
        SELECT name INTO event_name FROM events WHERE id = NEW.event_id;

        -- 根据新状态设置通知内容
        CASE NEW.status
            WHEN 'approved' THEN
                notification_title := '报名审核通过';
                notification_message := '您提交的"' || event_name || '"报名申请已通过审核';
                notification_type := 'approval';
            WHEN 'rejected' THEN
                notification_title := '报名被驳回';
                notification_message := '您提交的"' || event_name || '"报名申请被驳回';
                IF NEW.rejection_reason IS NOT NULL THEN
                    notification_message := notification_message || '，原因：' || NEW.rejection_reason;
                END IF;
                notification_type := 'rejection';
            WHEN 'cancelled' THEN
                notification_title := '报名已取消';
                notification_message := '您的"' || event_name || '"报名已被取消';
                IF NEW.cancelled_reason IS NOT NULL THEN
                    notification_message := notification_message || '，原因：' || NEW.cancelled_reason;
                END IF;
                notification_type := 'rejection';
            ELSE
                -- 其他状态不生成通知
                RETURN NEW;
        END CASE;

        -- 插入通知记录
        INSERT INTO notifications (
            coach_id,
            registration_id,
            event_id,
            type,
            title,
            message,
            is_read,
            created_at
        ) VALUES (
            NEW.coach_id,
            NEW.id,
            NEW.event_id,
            notification_type,
            notification_title,
            notification_message,
            false,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: debug_notifications_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.debug_notifications_status() RETURNS TABLE(coach_id uuid, coach_name text, total_notifications bigint, unread_count bigint, read_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as coach_id,
        c.name as coach_name,
        COUNT(n.id) as total_notifications,
        COUNT(CASE WHEN NOT n.is_read THEN 1 END) as unread_count,
        COUNT(CASE WHEN n.is_read THEN 1 END) as read_count
    FROM coaches c
    LEFT JOIN notifications n ON n.coach_id = c.id
    WHERE c.auth_id = auth.uid()
    GROUP BY c.id, c.name;
END;
$$;


--
-- Name: generate_share_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_share_token() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;


--
-- Name: get_share_token_info(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_share_token_info(p_token character varying) RETURNS TABLE(token_id uuid, registration_id uuid, event_id uuid, player_id character varying, player_index integer, event_name text, team_name text, expires_at timestamp with time zone, is_valid boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        pst.id as token_id,
        pst.registration_id,
        pst.event_id,
        pst.player_id,
        pst.player_index,
        e.name as event_name,
        COALESCE(r.team_data->>'team_name', '未命名队伍') as team_name,
        pst.expires_at,
        (pst.is_active AND pst.expires_at > NOW()) as is_valid
    FROM player_share_tokens pst
    LEFT JOIN events e ON pst.event_id = e.id
    LEFT JOIN registrations r ON pst.registration_id = r.id
    WHERE pst.token = p_token;
END;
$$;


--
-- Name: mark_all_notifications_as_read(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_all_notifications_as_read() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_coach_id UUID;
    v_updated_count INTEGER;
    v_notification_ids UUID[];
BEGIN
    -- 获取当前用户的教练ID
    SELECT id INTO v_coach_id
    FROM coaches
    WHERE auth_id = auth.uid()
    LIMIT 1;

    IF v_coach_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Coach not found',
            'updated_count', 0
        );
    END IF;

    -- 获取所有未读通知的ID
    SELECT ARRAY_AGG(id) INTO v_notification_ids
    FROM notifications
    WHERE coach_id = v_coach_id
    AND is_read = false;

    -- 如果没有未读通知
    IF v_notification_ids IS NULL OR array_length(v_notification_ids, 1) IS NULL THEN
        RETURN json_build_object(
            'success', true,
            'message', 'No unread notifications',
            'updated_count', 0
        );
    END IF;

    -- 执行批量更新
    UPDATE notifications
    SET is_read = true
    WHERE id = ANY(v_notification_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- 返回结果
    RETURN json_build_object(
        'success', true,
        'message', 'Notifications marked as read',
        'updated_count', v_updated_count,
        'notification_ids', v_notification_ids
    );
END;
$$;


--
-- Name: mark_notifications_as_read(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notifications_as_read(p_notification_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- 验证这些通知是否属于当前用户
    IF NOT EXISTS (
        SELECT 1
        FROM notifications n
        JOIN coaches c ON n.coach_id = c.id
        WHERE n.id = ANY(p_notification_ids)
        AND c.auth_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Not all notifications belong to current user';
    END IF;

    -- 执行更新
    UPDATE notifications
    SET is_read = true
    WHERE id = ANY(p_notification_ids)
    AND is_read = false;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RETURN updated_count;
END;
$$;


--
-- Name: set_share_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_share_token() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.share_token IS NULL THEN
        NEW.share_token := generate_share_token();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: test_registration_insert(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.test_registration_insert(p_event_id uuid, p_team_data jsonb, p_players_data jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_coach_id UUID;
    v_registration_id UUID;
BEGIN
    -- 获取当前用户的教练ID
    SELECT id INTO v_coach_id
    FROM coaches
    WHERE auth_id = auth.uid()
    LIMIT 1;

    IF v_coach_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Coach not found for current user'
        );
    END IF;

    -- 尝试插入报名
    INSERT INTO registrations (
        event_id,
        coach_id,
        team_data,
        players_data,
        status,
        submitted_at
    )
    VALUES (
        p_event_id,
        v_coach_id,
        p_team_data,
        p_players_data,
        'submitted',
        NOW()
    )
    RETURNING id INTO v_registration_id;

    RETURN json_build_object(
        'success', true,
        'registration_id', v_registration_id,
        'coach_id', v_coach_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
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
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: add_prefixes(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.add_prefixes(_bucket_id text, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    prefixes text[];
BEGIN
    prefixes := "storage"."get_prefixes"("_name");

    IF array_length(prefixes, 1) > 0 THEN
        INSERT INTO storage.prefixes (name, bucket_id)
        SELECT UNNEST(prefixes) as name, "_bucket_id" ON CONFLICT DO NOTHING;
    END IF;
END;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: delete_prefix(text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix(_bucket_id text, _name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Check if we can delete the prefix
    IF EXISTS(
        SELECT FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name") + 1
          AND "prefixes"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    )
    OR EXISTS(
        SELECT FROM "storage"."objects"
        WHERE "objects"."bucket_id" = "_bucket_id"
          AND "storage"."get_level"("objects"."name") = "storage"."get_level"("_name") + 1
          AND "objects"."name" COLLATE "C" LIKE "_name" || '/%'
        LIMIT 1
    ) THEN
    -- There are sub-objects, skip deletion
    RETURN false;
    ELSE
        DELETE FROM "storage"."prefixes"
        WHERE "prefixes"."bucket_id" = "_bucket_id"
          AND level = "storage"."get_level"("_name")
          AND "prefixes"."name" = "_name";
        RETURN true;
    END IF;
END;
$$;


--
-- Name: delete_prefix_hierarchy_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_prefix_hierarchy_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    prefix text;
BEGIN
    prefix := "storage"."get_prefix"(OLD."name");

    IF coalesce(prefix, '') != '' THEN
        PERFORM "storage"."delete_prefix"(OLD."bucket_id", prefix);
    END IF;

    RETURN OLD;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


--
-- Name: objects_insert_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_insert_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    NEW.level := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: objects_update_prefix_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.objects_update_prefix_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_prefixes TEXT[];
BEGIN
    -- Ensure this is an update operation and the name has changed
    IF TG_OP = 'UPDATE' AND (NEW."name" <> OLD."name" OR NEW."bucket_id" <> OLD."bucket_id") THEN
        -- Retrieve old prefixes
        old_prefixes := "storage"."get_prefixes"(OLD."name");

        -- Remove old prefixes that are only used by this object
        WITH all_prefixes as (
            SELECT unnest(old_prefixes) as prefix
        ),
        can_delete_prefixes as (
             SELECT prefix
             FROM all_prefixes
             WHERE NOT EXISTS (
                 SELECT 1 FROM "storage"."objects"
                 WHERE "bucket_id" = OLD."bucket_id"
                   AND "name" <> OLD."name"
                   AND "name" LIKE (prefix || '%')
             )
         )
        DELETE FROM "storage"."prefixes" WHERE name IN (SELECT prefix FROM can_delete_prefixes);

        -- Add new prefixes
        PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    END IF;
    -- Set the new level
    NEW."level" := "storage"."get_level"(NEW."name");

    RETURN NEW;
END;
$$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: prefixes_insert_trigger(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.prefixes_insert_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM "storage"."add_prefixes"(NEW."bucket_id", NEW."name");
    RETURN NEW;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
declare
    can_bypass_rls BOOLEAN;
begin
    SELECT rolbypassrls
    INTO can_bypass_rls
    FROM pg_roles
    WHERE rolname = coalesce(nullif(current_setting('role', true), 'none'), current_user);

    IF can_bypass_rls THEN
        RETURN QUERY SELECT * FROM storage.search_v1_optimised(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    ELSE
        RETURN QUERY SELECT * FROM storage.search_legacy_v1(prefix, bucketname, limits, levels, offsets, search, sortcolumn, sortorder);
    END IF;
end;
$$;


--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v1_optimised(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v1_optimised(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select (string_to_array(name, ''/''))[level] as name
           from storage.prefixes
             where lower(prefixes.name) like lower($2 || $3) || ''%''
               and bucket_id = $4
               and level = $1
           order by name ' || v_sort_order || '
     )
     (select name,
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[level] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where lower(objects.name) like lower($2 || $3) || ''%''
       and bucket_id = $4
       and level = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
BEGIN
    RETURN query EXECUTE
        $sql$
        SELECT * FROM (
            (
                SELECT
                    split_part(name, '/', $4) AS key,
                    name || '/' AS name,
                    NULL::uuid AS id,
                    NULL::timestamptz AS updated_at,
                    NULL::timestamptz AS created_at,
                    NULL::jsonb AS metadata
                FROM storage.prefixes
                WHERE name COLLATE "C" LIKE $1 || '%'
                AND bucket_id = $2
                AND level = $4
                AND name COLLATE "C" > $5
                ORDER BY prefixes.name COLLATE "C" LIMIT $3
            )
            UNION ALL
            (SELECT split_part(name, '/', $4) AS key,
                name,
                id,
                updated_at,
                created_at,
                metadata
            FROM storage.objects
            WHERE name COLLATE "C" LIKE $1 || '%'
                AND bucket_id = $2
                AND level = $4
                AND name COLLATE "C" > $5
            ORDER BY name COLLATE "C" LIMIT $3)
        ) obj
        ORDER BY name COLLATE "C" LIMIT $3;
        $sql$
        USING prefix, bucket_name, limits, levels, start_after;
END;
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;




--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone character varying(20) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: coaches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coaches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id uuid,
    email character varying(255) NOT NULL,
    name character varying(100),
    phone character varying(20),
    school character varying(100),
    role character varying(20) DEFAULT 'coach'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    organization character varying(255)
);


--
-- Name: COLUMN coaches.organization; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.coaches.organization IS '教练所属单位/学校';


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    short_name character varying(100),
    poster_url text,
    type character varying(50) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    address text,
    details text,
    phone character varying(20),
    is_visible boolean DEFAULT true,
    registration_start_date timestamp with time zone,
    registration_end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    requirements text
);


--
-- Name: COLUMN events.requirements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.requirements IS '报名要求和参赛条件说明';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid,
    registration_id uuid,
    event_id uuid,
    type character varying(20),
    title character varying(255) NOT NULL,
    message text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY ((ARRAY['approval'::character varying, 'rejection'::character varying, 'reminder'::character varying])::text[])))
);


--
-- Name: player_share_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_share_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid,
    event_id uuid,
    token character varying(255) NOT NULL,
    player_index integer,
    player_data jsonb,
    is_filled boolean DEFAULT false,
    filled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    player_id character varying(255),
    is_active boolean DEFAULT true,
    used_at timestamp with time zone
);


--
-- Name: player_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_id uuid,
    share_token character varying(100) NOT NULL,
    player_data jsonb NOT NULL,
    submitted_at timestamp with time zone DEFAULT now()
);


--
-- Name: registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    coach_id uuid,
    team_data jsonb,
    players_data jsonb,
    status character varying(20) DEFAULT 'draft'::character varying,
    share_token character varying(100),
    rejection_reason text,
    cancelled_at timestamp with time zone,
    cancelled_reason text,
    submitted_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone,
    reviewer_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_status_read_at timestamp with time zone,
    last_status_change timestamp with time zone,
    CONSTRAINT registrations_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: registration_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.registration_details AS
 SELECT r.id,
    r.event_id,
    r.coach_id,
    r.team_data,
    r.players_data,
    r.status,
    r.share_token,
    r.rejection_reason,
    r.cancelled_at,
    r.cancelled_reason,
    r.submitted_at,
    r.reviewed_at,
    r.reviewer_id,
    r.created_at,
    r.updated_at,
    r.last_status_read_at,
    r.last_status_change,
    e.name AS event_name,
    e.short_name AS event_short_name,
    e.poster_url AS event_poster_url,
    e.type AS event_type,
    e.start_date AS event_start_date,
    e.end_date AS event_end_date,
    e.address AS event_address,
    e.details AS event_details,
    e.phone AS event_phone,
    e.registration_start_date,
    e.registration_end_date,
    e.requirements AS event_requirements,
    c.name AS coach_name,
    c.email AS coach_email,
    c.phone AS coach_phone,
    c.school AS coach_school
   FROM ((public.registrations r
     LEFT JOIN public.events e ON ((r.event_id = e.id)))
     LEFT JOIN public.coaches c ON ((r.coach_id = c.id)));


--
-- Name: registration_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    team_requirements jsonb,
    player_requirements jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb,
    level integer
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: prefixes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.prefixes (
    bucket_id text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    level integer GENERATED ALWAYS AS (storage.get_level(name)) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_users admin_users_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_phone_key UNIQUE (phone);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: coaches coaches_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaches
    ADD CONSTRAINT coaches_auth_id_key UNIQUE (auth_id);


--
-- Name: coaches coaches_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaches
    ADD CONSTRAINT coaches_email_key UNIQUE (email);


--
-- Name: coaches coaches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaches
    ADD CONSTRAINT coaches_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: player_share_tokens player_share_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_share_tokens
    ADD CONSTRAINT player_share_tokens_pkey PRIMARY KEY (id);


--
-- Name: player_share_tokens player_share_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_share_tokens
    ADD CONSTRAINT player_share_tokens_token_key UNIQUE (token);


--
-- Name: player_submissions player_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_submissions
    ADD CONSTRAINT player_submissions_pkey PRIMARY KEY (id);


--
-- Name: registration_settings registration_settings_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_settings
    ADD CONSTRAINT registration_settings_event_id_key UNIQUE (event_id);


--
-- Name: registration_settings registration_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_settings
    ADD CONSTRAINT registration_settings_pkey PRIMARY KEY (id);


--
-- Name: registrations registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);


--
-- Name: registrations registrations_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_share_token_key UNIQUE (share_token);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: prefixes prefixes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (bucket_id, level, name);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: idx_events_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_dates ON public.events USING btree (start_date, end_date);


--
-- Name: idx_events_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_visible ON public.events USING btree (is_visible);


--
-- Name: idx_notifications_coach_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_coach_created ON public.notifications USING btree (coach_id, created_at DESC);


--
-- Name: idx_notifications_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_coach_id ON public.notifications USING btree (coach_id);


--
-- Name: idx_notifications_coach_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_coach_read ON public.notifications USING btree (coach_id, is_read);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_player_share_tokens_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_share_tokens_event ON public.player_share_tokens USING btree (event_id);


--
-- Name: idx_player_share_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_share_tokens_expires_at ON public.player_share_tokens USING btree (expires_at);


--
-- Name: idx_player_share_tokens_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_share_tokens_player ON public.player_share_tokens USING btree (player_id);


--
-- Name: idx_player_share_tokens_registration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_share_tokens_registration ON public.player_share_tokens USING btree (registration_id);


--
-- Name: idx_player_share_tokens_registration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_share_tokens_registration_id ON public.player_share_tokens USING btree (registration_id);


--
-- Name: idx_player_share_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_share_tokens_token ON public.player_share_tokens USING btree (token);


--
-- Name: idx_player_submissions_share_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_submissions_share_token ON public.player_submissions USING btree (share_token);


--
-- Name: idx_registrations_coach_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_coach_id ON public.registrations USING btree (coach_id);


--
-- Name: idx_registrations_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_event_id ON public.registrations USING btree (event_id);


--
-- Name: idx_registrations_share_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_share_token ON public.registrations USING btree (share_token);


--
-- Name: idx_registrations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registrations_status ON public.registrations USING btree (status);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_name_bucket_level_unique; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level);


--
-- Name: idx_prefixes_lower_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: objects_bucket_id_level_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C");


--
-- Name: registrations registration_notification_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER registration_notification_trigger AFTER UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.create_registration_notification();


--
-- Name: registrations registration_share_token_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER registration_share_token_trigger BEFORE INSERT ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.set_share_token();


--
-- Name: admin_users update_admin_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: coaches update_coaches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_coaches_updated_at BEFORE UPDATE ON public.coaches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: registration_settings update_registration_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_registration_settings_updated_at BEFORE UPDATE ON public.registration_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: registrations update_registrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: objects objects_delete_delete_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects objects_insert_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();


--
-- Name: objects objects_update_create_prefix; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();


--
-- Name: prefixes prefixes_create_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();


--
-- Name: prefixes prefixes_delete_hierarchy; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: notifications notifications_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;


--
-- Name: player_share_tokens player_share_tokens_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_share_tokens
    ADD CONSTRAINT player_share_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: player_share_tokens player_share_tokens_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_share_tokens
    ADD CONSTRAINT player_share_tokens_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;


--
-- Name: player_submissions player_submissions_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_submissions
    ADD CONSTRAINT player_submissions_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;


--
-- Name: registration_settings registration_settings_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_settings
    ADD CONSTRAINT registration_settings_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: registrations registrations_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.coaches(id);


--
-- Name: registrations registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: registrations registrations_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.admin_users(id);


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: prefixes prefixes_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.prefixes
    ADD CONSTRAINT "prefixes_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: admin_users Admin users full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin users full access" ON public.admin_users USING (true) WITH CHECK (true);


--
-- Name: player_share_tokens Allow anonymous access by token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous access by token" ON public.player_share_tokens FOR SELECT TO anon USING (((is_active = true) AND (expires_at > now())));


--
-- Name: player_share_tokens Anyone can read share token by token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read share token by token" ON public.player_share_tokens FOR SELECT USING (true);


--
-- Name: player_share_tokens Anyone can update share token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update share token" ON public.player_share_tokens FOR UPDATE USING (true);


--
-- Name: player_share_tokens Authenticated users can create share tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create share tokens" ON public.player_share_tokens FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: registrations Coach can create registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coach can create registrations" ON public.registrations FOR INSERT TO authenticated WITH CHECK ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))));


--
-- Name: registrations Coach can delete draft registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coach can delete draft registrations" ON public.registrations FOR DELETE TO authenticated USING (((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))) AND ((status)::text = 'draft'::text)));


--
-- Name: registrations Coach can update own registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coach can update own registrations" ON public.registrations FOR UPDATE TO authenticated USING (((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'rejected'::character varying, 'pending'::character varying, 'submitted'::character varying])::text[])))) WITH CHECK ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))));


--
-- Name: registrations Coach can view own registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coach can view own registrations" ON public.registrations FOR SELECT TO authenticated USING ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))));


--
-- Name: notifications Coach notifications delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coach notifications delete" ON public.notifications FOR DELETE TO authenticated USING ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))));


--
-- Name: notifications Coach notifications select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coach notifications select" ON public.notifications FOR SELECT TO authenticated USING ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))));


--
-- Name: notifications Coach notifications update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coach notifications update" ON public.notifications FOR UPDATE TO authenticated USING ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid())))) WITH CHECK ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))));


--
-- Name: coaches Coaches can insert profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can insert profile" ON public.coaches FOR INSERT WITH CHECK (true);


--
-- Name: player_share_tokens Coaches can manage own registration share tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can manage own registration share tokens" ON public.player_share_tokens TO authenticated USING ((registration_id IN ( SELECT registrations.id
   FROM public.registrations
  WHERE (registrations.coach_id IN ( SELECT coaches.id
           FROM public.coaches
          WHERE (coaches.auth_id = auth.uid())))))) WITH CHECK ((registration_id IN ( SELECT registrations.id
   FROM public.registrations
  WHERE (registrations.coach_id IN ( SELECT coaches.id
           FROM public.coaches
          WHERE (coaches.auth_id = auth.uid()))))));


--
-- Name: coaches Coaches can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can update own profile" ON public.coaches FOR UPDATE USING ((auth_id = auth.uid()));


--
-- Name: coaches Coaches can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Coaches can view own profile" ON public.coaches FOR SELECT USING (((auth_id = auth.uid()) OR (auth_id IS NULL)));


--
-- Name: events Events admin full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Events admin full access" ON public.events USING (true) WITH CHECK (true);


--
-- Name: events Events public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Events public read" ON public.events FOR SELECT USING ((is_visible = true));


--
-- Name: notifications Notifications admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Notifications admin write" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: notifications Notifications coach read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Notifications coach read" ON public.notifications FOR SELECT USING ((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))));


--
-- Name: player_submissions Player submissions coach read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Player submissions coach read" ON public.player_submissions FOR SELECT USING ((registration_id IN ( SELECT registrations.id
   FROM public.registrations
  WHERE (registrations.coach_id IN ( SELECT coaches.id
           FROM public.coaches
          WHERE (coaches.auth_id = auth.uid()))))));


--
-- Name: player_submissions Player submissions public insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Player submissions public insert" ON public.player_submissions FOR INSERT WITH CHECK (true);


--
-- Name: registration_settings Registration settings admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Registration settings admin write" ON public.registration_settings USING (true) WITH CHECK (true);


--
-- Name: registration_settings Registration settings public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Registration settings public read" ON public.registration_settings FOR SELECT USING (true);


--
-- Name: registrations Registrations coach access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Registrations coach access" ON public.registrations USING (((coach_id IN ( SELECT coaches.id
   FROM public.coaches
  WHERE (coaches.auth_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.admin_users))));


--
-- Name: notifications System insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System insert notifications" ON public.notifications FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: player_share_tokens Users can delete their own share tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own share tokens" ON public.player_share_tokens FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (public.registrations r
     JOIN public.coaches c ON ((r.coach_id = c.id)))
  WHERE ((r.id = player_share_tokens.registration_id) AND (c.auth_id = auth.uid())))));


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: coaches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: player_share_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_share_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: player_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Admin Access Registration Files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin Access Registration Files" ON storage.objects USING ((bucket_id = 'registration-files'::text));


--
-- Name: objects Admin Delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin Delete" ON storage.objects FOR DELETE USING ((bucket_id = 'event-posters'::text));


--
-- Name: objects Admin Update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin Update" ON storage.objects FOR UPDATE USING ((bucket_id = 'event-posters'::text));


--
-- Name: objects Admin Upload; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin Upload" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'event-posters'::text));


--
-- Name: objects Allow anyone to read l7f019_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow anyone to read l7f019_0" ON storage.objects FOR SELECT USING ((bucket_id = 'player-photos'::text));


--
-- Name: objects Allow anyone to upload l7f019_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow anyone to upload l7f019_0" ON storage.objects FOR INSERT TO authenticated, anon WITH CHECK ((bucket_id = 'player-photos'::text));


--
-- Name: objects Allow users to delete own uploads l7f019_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Allow users to delete own uploads l7f019_0" ON storage.objects FOR DELETE TO authenticated, anon USING ((bucket_id = 'player-photos'::text));


--
-- Name: objects Public Access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ((bucket_id = 'event-posters'::text));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: prefixes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.prefixes ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: FUNCTION clean_expired_share_tokens(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_expired_share_tokens() TO anon;
GRANT ALL ON FUNCTION public.clean_expired_share_tokens() TO authenticated;
GRANT ALL ON FUNCTION public.clean_expired_share_tokens() TO service_role;


--
-- Name: FUNCTION create_registration_notification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_registration_notification() TO anon;
GRANT ALL ON FUNCTION public.create_registration_notification() TO authenticated;
GRANT ALL ON FUNCTION public.create_registration_notification() TO service_role;


--
-- Name: FUNCTION debug_notifications_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.debug_notifications_status() TO anon;
GRANT ALL ON FUNCTION public.debug_notifications_status() TO authenticated;
GRANT ALL ON FUNCTION public.debug_notifications_status() TO service_role;


--
-- Name: FUNCTION generate_share_token(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_share_token() TO anon;
GRANT ALL ON FUNCTION public.generate_share_token() TO authenticated;
GRANT ALL ON FUNCTION public.generate_share_token() TO service_role;


--
-- Name: FUNCTION get_share_token_info(p_token character varying); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_share_token_info(p_token character varying) TO anon;
GRANT ALL ON FUNCTION public.get_share_token_info(p_token character varying) TO authenticated;
GRANT ALL ON FUNCTION public.get_share_token_info(p_token character varying) TO service_role;


--
-- Name: FUNCTION mark_all_notifications_as_read(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_all_notifications_as_read() TO anon;
GRANT ALL ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;
GRANT ALL ON FUNCTION public.mark_all_notifications_as_read() TO service_role;


--
-- Name: FUNCTION mark_notifications_as_read(p_notification_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_notifications_as_read(p_notification_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.mark_notifications_as_read(p_notification_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.mark_notifications_as_read(p_notification_ids uuid[]) TO service_role;


--
-- Name: FUNCTION set_share_token(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_share_token() TO anon;
GRANT ALL ON FUNCTION public.set_share_token() TO authenticated;
GRANT ALL ON FUNCTION public.set_share_token() TO service_role;


--
-- Name: FUNCTION test_registration_insert(p_event_id uuid, p_team_data jsonb, p_players_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.test_registration_insert(p_event_id uuid, p_team_data jsonb, p_players_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.test_registration_insert(p_event_id uuid, p_team_data jsonb, p_players_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.test_registration_insert(p_event_id uuid, p_team_data jsonb, p_players_data jsonb) TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE admin_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_users TO anon;
GRANT ALL ON TABLE public.admin_users TO authenticated;
GRANT ALL ON TABLE public.admin_users TO service_role;


--
-- Name: TABLE coaches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coaches TO anon;
GRANT ALL ON TABLE public.coaches TO authenticated;
GRANT ALL ON TABLE public.coaches TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE player_share_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.player_share_tokens TO anon;
GRANT ALL ON TABLE public.player_share_tokens TO authenticated;
GRANT ALL ON TABLE public.player_share_tokens TO service_role;


--
-- Name: TABLE player_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.player_submissions TO anon;
GRANT ALL ON TABLE public.player_submissions TO authenticated;
GRANT ALL ON TABLE public.player_submissions TO service_role;


--
-- Name: TABLE registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registrations TO anon;
GRANT ALL ON TABLE public.registrations TO authenticated;
GRANT ALL ON TABLE public.registrations TO service_role;


--
-- Name: TABLE registration_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registration_details TO anon;
GRANT ALL ON TABLE public.registration_details TO authenticated;
GRANT ALL ON TABLE public.registration_details TO service_role;


--
-- Name: TABLE registration_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registration_settings TO anon;
GRANT ALL ON TABLE public.registration_settings TO authenticated;
GRANT ALL ON TABLE public.registration_settings TO service_role;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO postgres WITH GRANT OPTION;


--
-- Name: TABLE buckets_analytics; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.buckets_analytics TO service_role;
GRANT ALL ON TABLE storage.buckets_analytics TO authenticated;
GRANT ALL ON TABLE storage.buckets_analytics TO anon;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO postgres WITH GRANT OPTION;


--
-- Name: TABLE prefixes; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.prefixes TO service_role;
GRANT ALL ON TABLE storage.prefixes TO authenticated;
GRANT ALL ON TABLE storage.prefixes TO anon;


--
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict b2FKiTnUCyDbO3vkO0eCfhUfG077cNCIgiKbmyhp5eJtmCbvIt0TPUEsiqfmNIe

