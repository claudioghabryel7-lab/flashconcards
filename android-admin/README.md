# FlashConCards Admin para Android

Aplicativo local para celulares e tablets Android. Ele mantém o painel admin em
um WebView e usa um segundo WebView para consultar o Modo IA do Google. O dossiê
volta diretamente ao site no mesmo aparelho; não existe backend intermediário.

## Requisitos

- Android 8.0 (API 26) ou superior.
- Android System WebView atualizado.
- Acesso ao Modo IA do Google no aparelho.
- Android Studio compatível com AGP 9.3.0, JDK 17 e SDK Android 36.

## Gerar o APK

1. Abra a pasta `android-admin` no Android Studio.
2. Aguarde a sincronização do Gradle.
3. Use **Build > Build APK(s)**.
4. Instale o APK gerado no celular ou tablet.

Para teste por USB, também é possível selecionar o dispositivo no Android Studio
e executar o módulo `app`.

## Uso

1. Abra o aplicativo e entre no painel admin do FlashConCards.
2. Toque em **Google / Login** e confirme que o Modo IA está disponível. Faça
   login se o Google permitir a autenticação no WebView.
3. Volte em **FlashConCards**.
4. Inicie a geração no Guia Mentorado.
5. A cada tópico, o aplicativo abre o Google, coleta o dossiê e retorna sozinho
   ao painel para gerar material, questões e flashcards.

## Observação importante

O Google pode restringir login ou Modo IA dentro de WebViews em algumas contas
ou versões do Android. Nesse caso, o aplicativo exibirá a falha e não publicará
o conteúdo. Será necessária uma implementação Android por acessibilidade no
Chrome real; a página web isolada não consegue ler outra aba do Chrome.
