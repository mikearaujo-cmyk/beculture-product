-- As telas de políticas de compartilhamento e de consulta da auditoria saíram
-- das Configurações da organização, junto com as rotas que elas usavam. Os
-- dois códigos deixam de existir no catálogo; tiramos das roles salvas.
UPDATE "roles"
SET "permissoes" = array_remove(array_remove("permissoes", 'compartilhamento.politicas'), 'auditoria.consultar')
WHERE 'compartilhamento.politicas' = ANY("permissoes")
   OR 'auditoria.consultar' = ANY("permissoes");
