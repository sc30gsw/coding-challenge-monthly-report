-- 確定後の不変性を、アプリ層とは独立して DB 層でも強制します。
-- アプリのバグや将来追加される別経路の書き込みでも「確定後は変更できない」が崩れないようにするためです。
-- @see docs/adr/0008-immutability-enforced-in-two-layers.md
--
-- 唯一許す更新は `confirmed -> superseded` の status 変更だけです（修正版の作成時）。
-- その際も他の列は一切変えられません。
--
-- なお TRUNCATE は行トリガを発火させないため、テストの後片付けは影響を受けません。

CREATE OR REPLACE FUNCTION reports_reject_frozen_writes() RETURNS TRIGGER AS $$
DECLARE
  normalized reports%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('confirmed', 'superseded') THEN
      RAISE EXCEPTION 'report % is % and cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'BR001',
              HINT = 'Confirmed reports are submitted documents. Create a revision instead.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status NOT IN ('confirmed', 'superseded') THEN
    RETURN NEW;
  END IF;

  -- status と updated_at 以外が変わっていないかを比較します。
  normalized := NEW;
  normalized.status := OLD.status;
  normalized.updated_at := OLD.updated_at;

  IF OLD.status = 'confirmed'
     AND NEW.status = 'superseded'
     AND to_jsonb(normalized) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'report % is % and cannot be modified', OLD.id, OLD.status
    USING ERRCODE = 'BR001',
          HINT = 'Confirmed reports are immutable. Create a revision instead.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION report_lines_reject_frozen_writes() RETURNS TRIGGER AS $$
DECLARE
  parent_id uuid;
  parent_status report_status;
BEGIN
  parent_id := COALESCE(NEW.report_id, OLD.report_id);
  SELECT status INTO parent_status FROM reports WHERE id = parent_id;

  IF parent_status IN ('confirmed', 'superseded') THEN
    RAISE EXCEPTION 'report % is % and its lines cannot be modified', parent_id, parent_status
      USING ERRCODE = 'BR001',
            HINT = 'Confirmed reports are immutable. Create a revision instead.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER reports_immutable_after_confirm
  BEFORE UPDATE OR DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION reports_reject_frozen_writes();
--> statement-breakpoint

CREATE TRIGGER report_lines_immutable_after_confirm
  BEFORE INSERT OR UPDATE OR DELETE ON report_lines
  FOR EACH ROW EXECUTE FUNCTION report_lines_reject_frozen_writes();
