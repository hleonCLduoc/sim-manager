    /*
    Fixes production auth/profile and installation RPC compatibility.

    1) profiles endpoint 500:
    Avoid recursive RLS policies by using SECURITY DEFINER helper function is_super_admin().

    2) register_installation endpoint 404:
    Ensure function with p_replace_existing exists and add compatibility overload
    without that parameter for clients/DBs still using old signature.
    */

    -- =========================================================
    -- profiles RLS fixes (avoid self-recursive policy checks)
    -- =========================================================
    DROP POLICY IF EXISTS "super_admin_select_all_profiles" ON profiles;
    DROP POLICY IF EXISTS "super_admin_update_profiles" ON profiles;

    CREATE POLICY "super_admin_select_all_profiles" ON profiles FOR SELECT
    TO authenticated
    USING (is_super_admin());

    CREATE POLICY "super_admin_update_profiles" ON profiles FOR UPDATE
    TO authenticated
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

    -- Extra safety: list_all_users should only return data for super admins.
    CREATE OR REPLACE FUNCTION list_all_users()
    RETURNS TABLE (
    id uuid,
    email text,
    display_name text,
    role text,
    can_batch_import boolean,
    can_batch_delete boolean,
    can_manage_users boolean,
    created_at timestamptz
    )
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $$
    SELECT p.id, p.email, p.display_name, p.role, p.can_batch_import, p.can_batch_delete, p.can_manage_users, p.created_at
    FROM profiles p
    WHERE is_super_admin()
    ORDER BY p.created_at ASC;
    $$;

    -- =========================================================
    -- register_installation canonical function (with replace flag)
    -- =========================================================
    CREATE OR REPLACE FUNCTION register_installation(
    p_sim_number text,
    p_location_name text,
    p_location_detail text DEFAULT NULL,
    p_imei text DEFAULT NULL,
    p_action text DEFAULT 'instalar',
    p_notes text DEFAULT NULL,
    p_replace_existing boolean DEFAULT false
    ) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
    DECLARE
    v_sim sims%ROWTYPE;
    v_sim_id uuid;
    v_location_id uuid;
    v_created_sim boolean := false;
    v_replaced_sim sims%ROWTYPE;
    v_installation installations%ROWTYPE;
    v_existing_installation installations%ROWTYPE;
    BEGIN
    p_sim_number := btrim(p_sim_number);
    IF p_sim_number IS NULL OR p_sim_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El numero de SIM es obligatorio');
    END IF;

    IF p_action NOT IN ('instalar', 'retirar') THEN
        RETURN jsonb_build_object('success', false, 'error', 'La accion debe ser instalar o retirar');
    END IF;

    SELECT * INTO v_sim FROM sims WHERE sim_number = p_sim_number;

    IF NOT FOUND THEN
        INSERT INTO sims (sim_number, status, needs_review, imei)
        VALUES (p_sim_number, 'libre', true, p_imei)
        RETURNING * INTO v_sim;
        v_created_sim := true;
    END IF;

    v_sim_id := v_sim.id;

    IF p_location_name IS NOT NULL AND btrim(p_location_name) <> '' THEN
        p_location_name := btrim(p_location_name);
        INSERT INTO locations (name, detail)
        VALUES (p_location_name, p_location_detail)
        ON CONFLICT (name, detail) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_location_id;
    END IF;

    IF p_action = 'instalar' AND p_replace_existing AND v_location_id IS NOT NULL THEN
        SELECT i.* INTO v_existing_installation
        FROM installations i
        WHERE i.location_id = v_location_id
        AND i.action = 'instalar'
        AND i.sim_number <> p_sim_number
        AND NOT EXISTS (
            SELECT 1 FROM installations i2
            WHERE i2.location_id = v_location_id
            AND i2.sim_number = i.sim_number
            AND i2.action = 'retirar'
            AND i2.installed_at > i.installed_at
        )
        ORDER BY i.installed_at DESC
        LIMIT 1;

        IF FOUND THEN
        SELECT * INTO v_replaced_sim FROM sims WHERE sim_number = v_existing_installation.sim_number;

        UPDATE sims
        SET status = 'libre', updated_at = now()
        WHERE sim_number = v_existing_installation.sim_number;

        INSERT INTO installations (sim_id, sim_number, location_id, location_name, location_detail, imei, action, notes)
        VALUES (
            v_replaced_sim.id,
            v_replaced_sim.sim_number,
            v_location_id,
            p_location_name,
            p_location_detail,
            v_existing_installation.imei,
            'retirar',
            'Retiro automatico por reemplazo en ' || p_location_name
        );
        END IF;
    END IF;

    IF p_action = 'instalar' THEN
        UPDATE sims
        SET status = 'instalada',
            imei = COALESCE(NULLIF(btrim(p_imei), ''), imei),
            updated_at = now()
        WHERE id = v_sim_id;
    ELSE
        UPDATE sims
        SET status = 'libre',
            updated_at = now()
        WHERE id = v_sim_id;
    END IF;

    INSERT INTO installations (sim_id, sim_number, location_id, location_name, location_detail, imei, action, notes)
    VALUES (v_sim_id, p_sim_number, v_location_id, p_location_name, p_location_detail, p_imei, p_action, p_notes)
    RETURNING * INTO v_installation;

    RETURN jsonb_build_object(
        'success', true,
        'created_sim', v_created_sim,
        'needs_review', v_sim.needs_review OR v_created_sim,
        'replaced_sim', to_jsonb(v_replaced_sim),
        'sim', to_jsonb(v_sim),
        'installation', to_jsonb(v_installation)
    );
    END;
    $$;

    -- =========================================================
    -- Backward-compatible overload (without replace flag)
    -- =========================================================
    CREATE OR REPLACE FUNCTION register_installation(
    p_sim_number text,
    p_location_name text,
    p_location_detail text DEFAULT NULL,
    p_imei text DEFAULT NULL,
    p_action text DEFAULT 'instalar',
    p_notes text DEFAULT NULL
    ) RETURNS jsonb
    LANGUAGE sql
    AS $$
    SELECT register_installation(
        p_sim_number,
        p_location_name,
        p_location_detail,
        p_imei,
        p_action,
        p_notes,
        false
    );
    $$;

    GRANT EXECUTE ON FUNCTION register_installation(text, text, text, text, text, text, boolean) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION register_installation(text, text, text, text, text, text) TO anon, authenticated;
