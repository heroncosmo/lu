-- =====================================================
-- HABILITAR REALTIME PARA TABELA whatsapp_messages
-- =====================================================

-- Verificar se a publicação supabase_realtime existe
DO $$
BEGIN
    -- Adicionar a tabela whatsapp_messages à publicação do Realtime
    -- A publicação 'supabase_realtime' é criada automaticamente pelo Supabase
    
    -- Primeiro, remover se já existir para evitar erro
    ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.whatsapp_messages;
    
    -- Adicionar a tabela à publicação
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
    
    RAISE NOTICE 'Tabela whatsapp_messages adicionada à publicação supabase_realtime';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Erro ao configurar publicação: %. Tentando método alternativo...', SQLERRM;
        
        -- Método alternativo: recriar a publicação com a tabela
        BEGIN
            DROP PUBLICATION IF EXISTS supabase_realtime;
            CREATE PUBLICATION supabase_realtime FOR TABLE public.whatsapp_messages;
            RAISE NOTICE 'Publicação supabase_realtime criada com whatsapp_messages';
        EXCEPTION
            WHEN others THEN
                RAISE NOTICE 'Não foi possível criar publicação: %', SQLERRM;
        END;
END $$;

-- Também adicionar a tabela prospecting_sessions para mudanças de status
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prospecting_sessions;
    RAISE NOTICE 'Tabela prospecting_sessions adicionada à publicação supabase_realtime';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Tabela prospecting_sessions já está na publicação';
    WHEN others THEN
        RAISE NOTICE 'Erro ao adicionar prospecting_sessions: %', SQLERRM;
END $$;

-- Confirmar que as tabelas estão na publicação
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
