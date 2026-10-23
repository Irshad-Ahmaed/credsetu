CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL,
  otp_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_challenges_phone_created_idx ON otp_challenges(phone_e164, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_name TEXT NOT NULL CHECK (char_length(friend_name) BETWEEN 2 AND 80),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0 AND amount_paise <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  due_on DATE NOT NULL,
  lent_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'repaid')),
  repaid_on DATE,
  submission_key UUID NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  receipt_bytes BYTEA,
  receipt_mime TEXT CHECK (receipt_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  receipt_size INTEGER CHECK (receipt_size IS NULL OR receipt_size BETWEEN 1 AND 5242880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT loan_repayment_state CHECK (
    (status = 'pending' AND repaid_on IS NULL) OR
    (status = 'repaid' AND repaid_on IS NOT NULL AND repaid_on >= lent_on)
  ),
  CONSTRAINT loan_receipt_fields CHECK (
    (receipt_bytes IS NULL AND receipt_mime IS NULL AND receipt_size IS NULL) OR
    (receipt_bytes IS NOT NULL AND receipt_mime IS NOT NULL AND receipt_size IS NOT NULL)
  ),
  CONSTRAINT loan_user_submission_key UNIQUE (user_id, submission_key)
);
CREATE INDEX IF NOT EXISTS loans_user_status_due_idx ON loans(user_id, status, due_on);
CREATE INDEX IF NOT EXISTS loans_user_created_idx ON loans(user_id, created_at DESC, id);
