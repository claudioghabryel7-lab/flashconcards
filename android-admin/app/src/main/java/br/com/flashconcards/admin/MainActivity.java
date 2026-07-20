package br.com.flashconcards.admin;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String SITE_URL = "https://www.flashconcards.com.br/admin";
    private static final String GOOGLE_AI_URL = "https://www.google.com/search?udm=50&hl=pt-BR";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView siteWebView;
    private WebView googleWebView;
    private TextView statusView;
    private String pendingRequestId;
    private String pendingPrompt;
    private boolean queryInjected;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        CookieManager.getInstance().setAcceptCookie(true);
        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
        );

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(17, 24, 39));

        statusView = new TextView(this);
        statusView.setText("FlashConCards Admin · ponte local pronta");
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(12);
        statusView.setPadding(16, 10, 16, 10);
        root.addView(
                statusView,
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                )
        );

        FrameLayout webContainer = new FrameLayout(this);
        root.addView(
                webContainer,
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                )
        );

        siteWebView = new WebView(this);
        googleWebView = new WebView(this);
        webContainer.addView(
                siteWebView,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );
        webContainer.addView(
                googleWebView,
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );
        googleWebView.setVisibility(View.GONE);

        LinearLayout navigation = new LinearLayout(this);
        navigation.setOrientation(LinearLayout.HORIZONTAL);
        navigation.setPadding(8, 6, 8, 6);

        Button siteButton = new Button(this);
        siteButton.setText("FlashConCards");
        siteButton.setOnClickListener(view -> showSite());
        navigation.addView(siteButton, new LinearLayout.LayoutParams(0, 52, 1f));

        Button googleButton = new Button(this);
        googleButton.setText("Google / Login");
        googleButton.setOnClickListener(view -> showGoogle());
        navigation.addView(googleButton, new LinearLayout.LayoutParams(0, 52, 1f));
        root.addView(navigation);

        setContentView(root);
        configureSiteWebView();
        configureGoogleWebView();

        siteWebView.loadUrl(resolveLaunchUrl(getIntent()));
        googleWebView.loadUrl(GOOGLE_AI_URL);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = resolveLaunchUrl(intent);
        if (siteWebView != null && url != null) {
            showSite();
            siteWebView.loadUrl(url);
        }
    }

    private String resolveLaunchUrl(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Uri data = intent.getData();
            if ("fccadmin".equals(data.getScheme())) {
                return SITE_URL + "?tab=guia-mentorado";
            }
            String host = data.getHost();
            if ("www.flashconcards.com.br".equals(host) || "flashconcards.com.br".equals(host)) {
                return data.toString();
            }
        }
        return SITE_URL + "?tab=guia-mentorado";
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureBaseWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(
                settings.getUserAgentString().replace("; wv", "") + " FlashConCardsAdmin/0.1"
        );
        webView.setWebChromeClient(new WebChromeClient());
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
    }

    private void configureSiteWebView() {
        configureBaseWebView(siteWebView);
        siteWebView.addJavascriptInterface(new SiteBridge(), "FlashConCardsAndroid");
        siteWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if ("www.flashconcards.com.br".equals(host) || "flashconcards.com.br".equals(host)) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
    }

    private void configureGoogleWebView() {
        configureBaseWebView(googleWebView);
        googleWebView.addJavascriptInterface(new GoogleResultBridge(), "GoogleResultBridge");
        googleWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (pendingRequestId != null && !queryInjected && url.contains("google.com")) {
                    handler.postDelayed(MainActivity.this::injectGoogleAgent, 1200);
                }
            }
        });
    }

    private void showSite() {
        googleWebView.setVisibility(View.GONE);
        siteWebView.setVisibility(View.VISIBLE);
    }

    private void showGoogle() {
        siteWebView.setVisibility(View.GONE);
        googleWebView.setVisibility(View.VISIBLE);
    }

    private void startGoogleQuery(String requestId, String prompt) {
        if (pendingRequestId != null) {
            deliverToSite(requestId, false, "", "Já existe uma consulta ao Google em andamento.");
            return;
        }

        pendingRequestId = requestId;
        pendingPrompt = prompt;
        queryInjected = false;
        statusView.setText("Consultando o Modo IA do Google…");
        showGoogle();

        String currentUrl = googleWebView.getUrl();
        if (currentUrl == null || !currentUrl.contains("google.com/search")) {
            googleWebView.loadUrl(GOOGLE_AI_URL);
        } else {
            handler.postDelayed(this::injectGoogleAgent, 700);
        }
    }

    private void injectGoogleAgent() {
        if (pendingRequestId == null || pendingPrompt == null || queryInjected) return;
        queryInjected = true;

        String requestIdJson = JSONObject.quote(pendingRequestId);
        String promptJson = JSONObject.quote(pendingPrompt);
        String script = "(async()=>{" +
                "const id=" + requestIdJson + ",prompt=" + promptJson + ";" +
                "const sleep=ms=>new Promise(r=>setTimeout(r,ms));" +
                "const text=()=>String((document.querySelector('main')||document.querySelector('[role=main]')||document.body).innerText||'').trim();" +
                "const input=async()=>{for(let i=0;i<40;i++){" +
                "const xs=[...document.querySelectorAll('textarea,[contenteditable=true][role=textbox],[contenteditable=true]')];" +
                "const x=xs.find(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.height>20});" +
                "if(x)return x;await sleep(500)}throw new Error('Campo do Modo IA não encontrado')};" +
                "try{" +
                "const x=await input();const before=text();x.focus();" +
                "if('value' in x){const p=x.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;" +
                "const s=Object.getOwnPropertyDescriptor(p,'value')?.set;s?s.call(x,prompt):x.value=prompt;" +
                "x.dispatchEvent(new Event('input',{bubbles:true}));}" +
                "else{x.textContent='';document.execCommand('insertText',false,prompt);x.dispatchEvent(new InputEvent('input',{bubbles:true,data:prompt,inputType:'insertText'}));}" +
                "await sleep(400);" +
                "const b=[...document.querySelectorAll('button')].find(e=>{const a=((e.getAttribute('aria-label')||'')+' '+(e.title||'')).toLowerCase();" +
                "return !e.disabled&&(a.includes('enviar')||a.includes('send')||a.includes('submit')||a.includes('pesquisar'))});" +
                "if(b)b.click();else x.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));" +
                "let last='',stable=Date.now(),started=Date.now(),answer='';" +
                "while(Date.now()-started<150000){await sleep(1000);const now=text();" +
                "if(now!==last){last=now;stable=Date.now()}" +
                "const generating=[...document.querySelectorAll('button')].some(e=>{const a=((e.getAttribute('aria-label')||'')+' '+(e.title||'')).toLowerCase();return a.includes('parar')||a.includes('stop generating')});" +
                "if(now.length>before.length+120&&!generating&&Date.now()-stable>7000){answer=now;break}}" +
                "if(!answer)answer=last;const a=answer.lastIndexOf('FCC_DOSSIER_START'),z=answer.lastIndexOf('FCC_DOSSIER_END');" +
                "const out=a>=0&&z>a?answer.slice(a+17,z).trim():answer.slice(-30000).trim();" +
                "if(out.length<120)throw new Error('Resposta do Modo IA vazia ou incompleta');" +
                "GoogleResultBridge.deliver(id,true,out,'');" +
                "}catch(e){GoogleResultBridge.deliver(id,false,'',String(e&&e.message||e))}" +
                "})()";

        googleWebView.evaluateJavascript(script, null);
    }

    private void finishGoogleQuery(String requestId, boolean ok, String result, String error) {
        if (pendingRequestId == null || !pendingRequestId.equals(requestId)) return;
        pendingRequestId = null;
        pendingPrompt = null;
        queryInjected = false;
        statusView.setText(ok ? "Dossiê recebido · gerando conteúdo…" : "Falha no Google: " + error);
        showSite();
        deliverToSite(requestId, ok, result, error);
        googleWebView.loadUrl(GOOGLE_AI_URL);
    }

    private void deliverToSite(String requestId, boolean ok, String result, String error) {
        String javascript = "window.__fccGoogleAiResolve&&window.__fccGoogleAiResolve(" +
                JSONObject.quote(requestId) + "," +
                (ok ? "true" : "false") + "," +
                JSONObject.quote(result == null ? "" : result) + "," +
                JSONObject.quote(error == null ? "" : error) +
                ")";
        siteWebView.evaluateJavascript(javascript, null);
    }

    @Override
    public void onBackPressed() {
        WebView visible = googleWebView.getVisibility() == View.VISIBLE ? googleWebView : siteWebView;
        if (visible.canGoBack()) {
            visible.goBack();
        } else if (visible == googleWebView) {
            showSite();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        siteWebView.destroy();
        googleWebView.destroy();
        super.onDestroy();
    }

    private final class SiteBridge {
        @JavascriptInterface
        public void requestGoogleAi(String requestId, String prompt) {
            runOnUiThread(() -> startGoogleQuery(requestId, prompt));
        }
    }

    private final class GoogleResultBridge {
        @JavascriptInterface
        public void deliver(String requestId, boolean ok, String result, String error) {
            runOnUiThread(() -> finishGoogleQuery(requestId, ok, result, error));
        }
    }
}
