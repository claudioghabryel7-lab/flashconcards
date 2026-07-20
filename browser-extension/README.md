# FlashConCards Google AI Bridge

Extensão privada usada somente no navegador do administrador. Ela abre o Modo IA
do Google em segundo plano e devolve ao site um dossiê factual para orientar a
geração local de material, questões e flashcards.

## Instalação

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `browser-extension`.
5. Recarregue a aba do FlashConCards.

Mantenha o Chrome logado em uma conta que possua acesso ao Modo IA. A extensão
não envia dados para um backend próprio e só funciona enquanto o navegador do
admin estiver aberto.

## Atualização

Depois de alterar os arquivos da extensão, abra `chrome://extensions`, clique em
**Atualizar** e recarregue a aba do FlashConCards.

## Limitações

- Mudanças na interface do Google podem exigir atualização dos seletores.
- CAPTCHA, indisponibilidade ou bloqueio impedem a geração; o conteúdo não deve
  ser publicado sem o dossiê.
- A extensão é uma camada de grounding, não uma garantia matemática de acerto.
