package ca.qsoftware.dashboard;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Injects the native shell into the remote dashboard page.
 *
 * The dashboard is served from https://app.qsoftware.ca by a different repository,
 * so this project cannot add a &lt;script&gt; tag to it. The shell bundle is instead
 * read out of the APK's assets and evaluated in the page after every load.
 *
 * Capacitor's own native bridge is already injected into the remote origin
 * (server.url in capacitor.config.ts declares it), so by the time shell.js runs,
 * window.Capacitor exists and the plugin proxies work normally.
 *
 * The offline fallback is NOT handled here. WebViewListener.onReceivedError fires
 * for every failed subresource, not just the main frame, so using it would swap to
 * the offline page whenever an image 404s. server.errorPath in capacitor.config.ts
 * does the same job correctly — BridgeWebViewClient gates it on
 * request.isForMainFrame().
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "QShell";
    private static final String SHELL_ASSET = "public/shell.js";

    private String shellSource = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                injectShell(webView);
            }
        });
    }

    private void injectShell(WebView webView) {
        if (shellSource == null) {
            shellSource = readAsset(SHELL_ASSET);
        }
        if (shellSource == null) {
            Log.w(TAG, "shell.js missing from assets — run `npm run sync`");
            return;
        }
        // src/shell/index.ts is idempotent (window.__qShellInstalled), so a repeat
        // injection on a client-side route change costs nothing.
        webView.evaluateJavascript(shellSource, null);
    }

    private String readAsset(String path) {
        StringBuilder builder = new StringBuilder();
        try (InputStream stream = getAssets().open(path);
             BufferedReader reader = new BufferedReader(
                     new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line).append('\n');
            }
        } catch (Exception e) {
            Log.e(TAG, "could not read " + path, e);
            return null;
        }
        return builder.toString();
    }
}
