-- Extensiones requeridas por Impacto
-- Se ejecuta automáticamente la primera vez que arranca el container.

CREATE EXTENSION IF NOT EXISTS vector;         -- pgvector (RAG, embeddings)
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- fuzzy search
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid, hashing
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- query observability
CREATE EXTENSION IF NOT EXISTS btree_gist;     -- exclusion constraints (anti-double-booking)
CREATE EXTENSION IF NOT EXISTS unaccent;       -- búsqueda sin acentos

-- Confirmación
DO $$
BEGIN
  RAISE NOTICE '✅ Impacto: extensiones cargadas (vector, pg_trgm, pgcrypto, btree_gist, unaccent)';
END $$;
