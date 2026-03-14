import pool from "../../../config/database";

let initPromise: Promise<void> | null = null;

export const ensureEmployeeSecurityTables = async (): Promise<void> => {
  if (!initPromise) {
    initPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS employee_security_state (
          employee_id integer PRIMARY KEY REFERENCES employee(employee_id) ON DELETE CASCADE,
          must_change_password boolean NOT NULL DEFAULT false,
          updated_by_employee_id integer REFERENCES employee(employee_id) ON DELETE SET NULL,
          updated_at timestamp without time zone NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS employee_password_change_audit (
          audit_id bigserial PRIMARY KEY,
          employee_id integer NOT NULL REFERENCES employee(employee_id) ON DELETE CASCADE,
          changed_by_employee_id integer NOT NULL REFERENCES employee(employee_id) ON DELETE RESTRICT,
          reason text,
          force_change_on_login boolean NOT NULL DEFAULT true,
          created_at timestamp without time zone NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_employee_password_audit_employee_created
        ON employee_password_change_audit (employee_id, created_at DESC)
      `);
    })();
  }

  await initPromise;
};
