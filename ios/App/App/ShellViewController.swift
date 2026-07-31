import UIKit
import WebKit
import Capacitor

/// Injects the native shell into the remote dashboard page.
///
/// The dashboard is served from https://app.qsoftware.ca by a different repository,
/// so this project cannot add a `<script>` tag to it. The shell bundle ships inside
/// the app and is installed as a `WKUserScript` instead.
///
/// Timing is why this happens in `capacitorDidLoad()` rather than anywhere else:
/// `CAPBridgeViewController.loadView()` calls it after the web view exists but
/// before `viewDidLoad()` triggers the first navigation, so the user script is in
/// place for the initial load as well as every one after it.
///
/// `webViewConfiguration(for:)` looks like the natural hook and is not — Capacitor's
/// `prepareWebView` reassigns `userContentController` to its own delegation handler
/// immediately afterwards, discarding anything added there.
class ShellViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        installShellUserScript()
    }

    private func installShellUserScript() {
        guard let source = loadShellSource() else {
            CAPLog.print("⚡️  [q-shell] shell.js not found in bundle — run `npm run sync`")
            return
        }

        // .atDocumentEnd: the shell queries the DOM (overlays, form fields, links),
        // so it needs a parsed document. WKWebView re-runs user scripts on every
        // navigation, which is what keeps this working across dashboard page loads.
        let script = WKUserScript(
            source: source,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        webView?.configuration.userContentController.addUserScript(script)
    }

    /// `npx cap copy` mirrors `www/` into the app bundle under `public/`.
    private func loadShellSource() -> String? {
        guard let url = Bundle.main.url(forResource: "shell", withExtension: "js", subdirectory: "public") else {
            return nil
        }
        return try? String(contentsOf: url, encoding: .utf8)
    }
}
