-- 0005: mail + CRM docs persistence (metadata + body, no attachments)

CREATE TABLE IF NOT EXISTS mails (
  id text PRIMARY KEY,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  from_addr text NOT NULL DEFAULT '',
  subject_zh text NOT NULL DEFAULT '',
  subject_th text NOT NULL DEFAULT '',
  subject_en text NOT NULL DEFAULT '',
  body_zh text NOT NULL DEFAULT '',
  body_th text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  draft_zh text NOT NULL DEFAULT '',
  draft_th text NOT NULL DEFAULT '',
  draft_en text NOT NULL DEFAULT '',
  time_label text NOT NULL DEFAULT '',
  confidence numeric(8, 4) NOT NULL DEFAULT 0,
  unread boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'open',
  intent text,
  summary text,
  origin text,
  dest text,
  extracted_boxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  docs_missing jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_status text,
  needs_human boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mails_state_chk CHECK (state IN ('open', 'sent', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_mails_customer ON mails (customer_id);
CREATE INDEX IF NOT EXISTS idx_mails_state ON mails (state);

CREATE TABLE IF NOT EXISTS crm_docs (
  id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  box_id text NOT NULL DEFAULT '',
  kind text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'wait',
  updated text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_docs_kind_chk CHECK (kind IN ('BL', 'CO', 'PL', 'CI', 'BOOK')),
  CONSTRAINT crm_docs_status_chk CHECK (status IN ('ok', 'wait', 'late'))
);

CREATE INDEX IF NOT EXISTS idx_crm_docs_customer ON crm_docs (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_docs_box ON crm_docs (box_id);
