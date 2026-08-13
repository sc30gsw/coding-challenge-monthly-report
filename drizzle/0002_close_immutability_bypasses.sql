-- 0001 のトリガに 3 つの穴があったので塞ぎます。いずれもコードレビューで指摘され、
-- psql から実際に再現したうえで直しています。
--
-- 1. 明細の付け替えで確定済み報告書から中身を抜ける
--    `UPDATE report_lines SET report_id = <下書きの id>` は移動先しか検査しておらず通っていました。
--    移動元・移動先の両方を見ます。
-- 2. 後継の版が無いまま superseded にできる
--    「修正版を作るときだけ」という前提が DB では効いていませんでした。
--    同じ系列により新しい版が存在することを条件にします。
-- 3. 確定処理と明細の書き込みが競合しうる
--    親の status を読むときに FOR SHARE を取り、確定の UPDATE と直列化します。
--
-- @see docs/adr/0008-immutability-enforced-in-two-layers.md

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
    -- 旧版が superseded になってよいのは、後継の版が既に存在するときだけです。
    -- 修正版の作成以外の理由で確定済み報告書を無効化されないようにします。
    IF NOT EXISTS (
      SELECT 1 FROM reports r
      WHERE r.series_id = OLD.series_id AND r.version > OLD.version
    ) THEN
      RAISE EXCEPTION 'report % cannot be superseded without a successor version', OLD.id
        USING ERRCODE = 'BR001',
              HINT = 'Insert the revision first, then mark the previous version superseded.';
    END IF;

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
  frozen_id uuid;
  frozen_status report_status;
BEGIN
  -- 移動元と移動先の両方を見ます。片方だけだと、確定済み報告書から明細を
  -- 下書きへ付け替えて中身を抜くことができてしまいます。
  -- FOR SHARE は、親を確定する UPDATE と直列化するためです。
  SELECT r.id, r.status INTO frozen_id, frozen_status
  FROM reports r
  WHERE r.id IN (OLD.report_id, NEW.report_id)
    AND r.status IN ('confirmed', 'superseded')
  LIMIT 1
  FOR SHARE;

  IF frozen_id IS NOT NULL THEN
    RAISE EXCEPTION 'report % is % and its lines cannot be modified', frozen_id, frozen_status
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

-- 差し戻し理由は履歴として残します。
--
-- 元の制約は「changes_requested のときだけ理由を持つ」という双方向の条件でした。
-- しかし ADR-0007 により、管理者が明細を編集すると status は pending に戻ります。
-- 双方向だとその瞬間に理由が NULL を強制され、管理者が対応すべき指摘の文言が消えます。
-- 「changes_requested なら理由が要る」という一方向に緩め、直したあとも
-- 直前の指摘を読めるようにします。
ALTER TABLE report_lines DROP CONSTRAINT report_lines_reason_only_when_changes_requested;
--> statement-breakpoint

ALTER TABLE report_lines ADD CONSTRAINT report_lines_reason_required_when_changes_requested
  CHECK (status <> 'changes_requested' OR change_request_reason IS NOT NULL);
