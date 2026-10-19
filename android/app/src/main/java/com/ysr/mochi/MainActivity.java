package com.ysr.mochi;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final int DEFAULT_BAR_COLOR = 0xFFF4F1EA;
    private static final int REQUEST_FILE_CHOOSER = 1001;
    private static final int REQUEST_MIC = 1002;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri pendingCaptureUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        applySystemBars(DEFAULT_BAR_COLOR, true);

        webView = new WebView(this);
        webView.setBackgroundColor(DEFAULT_BAR_COLOR);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSaveFormData(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.addJavascriptInterface(new Bridge(), "MochiAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if (scheme != null && !scheme.startsWith("http") && !scheme.equals("file")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                        /* nothing can open it */
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(
                        "window.MochiNativeReady && window.MochiNativeReady();",
                        null
                );
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent chooser = buildChooserIntent(params);
                if (chooser == null) {
                    filePathCallback = null;
                    return false;
                }
                try {
                    startActivityForResult(chooser, REQUEST_FILE_CHOOSER);
                } catch (Exception error) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                                && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED) {
                            request.grant(request.getResources());
                            return;
                        }
                    }
                    request.deny();
                });
            }
        });

        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    private Intent buildChooserIntent(WebChromeClient.FileChooserParams params) {
        String[] accept = params.getAcceptTypes();
        boolean wantsVideo = false;
        boolean wantsImage = false;
        boolean any = accept == null || accept.length == 0;
        if (accept != null) {
            for (String type : accept) {
                if (type == null) continue;
                String value = type.toLowerCase();
                if (value.startsWith("video/")) wantsVideo = true;
                else if (value.startsWith("image/")) wantsImage = true;
                else if (value.contains("*")) any = true;
            }
        }
        if (any) {
            wantsImage = true;
            wantsVideo = true;
        }

        if (params.isCaptureEnabled()) {
            if (wantsVideo && !wantsImage) {
                Intent video = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
                if (video.resolveActivity(getPackageManager()) != null) {
                    return video;
                }
            }
            if (wantsImage) {
                Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                if (camera.resolveActivity(getPackageManager()) != null) {
                    Uri output = createCaptureUri("jpg");
                    if (output != null) {
                        camera.putExtra(MediaStore.EXTRA_OUTPUT, output);
                        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                                | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        pendingCaptureUri = output;
                        return camera;
                    }
                }
            }
            if (wantsVideo) {
                Intent video = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
                if (video.resolveActivity(getPackageManager()) != null) {
                    return video;
                }
            }
        }

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        if (wantsImage && wantsVideo) pick.setType("*/*");
        else if (wantsVideo) pick.setType("video/*");
        else if (wantsImage) pick.setType("image/*");
        else pick.setType(accept != null && accept.length > 0 ? accept[0] : "*/*");
        if (accept != null && accept.length > 0 && (wantsImage && wantsVideo)) {
            pick.putExtra(Intent.EXTRA_MIME_TYPES, accept);
        }
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        return Intent.createChooser(pick, "choose something to share");
    }

    private Uri createCaptureUri(String extension) {
        try {
            File dir = new File(getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File file = new File(dir, "capture-" + System.currentTimeMillis() + "." + extension);
            return MochiFileProvider.uriFor(file);
        } catch (Exception error) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_FILE_CHOOSER) {
            if (filePathCallback == null) {
                return;
            }
            Uri[] results = null;
            if (resultCode == RESULT_OK) {
                List<Uri> uris = new ArrayList<>();
                if (data != null) {
                    ClipData clip = data.getClipData();
                    if (clip != null) {
                        for (int index = 0; index < clip.getItemCount(); index++) {
                            uris.add(clip.getItemAt(index).getUri());
                        }
                    } else if (data.getData() != null) {
                        uris.add(data.getData());
                    }
                }
                if (uris.isEmpty() && pendingCaptureUri != null) {
                    uris.add(pendingCaptureUri);
                }
                if (!uris.isEmpty()) {
                    results = uris.toArray(new Uri[0]);
                }
            }
            pendingCaptureUri = null;
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_MIC) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            notifyJs("MochiMicPermission", granted ? "granted" : "denied");
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){return window.mochiHandleBack ? window.mochiHandleBack() : false;})()",
                value -> {
                    if (!"true".equals(value)) {
                        exitApp();
                    }
                }
        );
    }

    private void exitApp() {
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("MochiAndroid");
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void notifyJs(String function, String arg) {
        if (webView == null) return;
        String script = "window." + function + " && window." + function + "("
                + org.json.JSONObject.quote(arg) + ");";
        webView.evaluateJavascript(script, null);
    }

    private void applySystemBars(int color, boolean darkIcons) {
        Window window = getWindow();
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);
        window.setBackgroundDrawable(new ColorDrawable(color));

        int flags = window.getDecorView().getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (darkIcons) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (darkIcons) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        window.getDecorView().setSystemUiVisibility(flags);

        if (webView != null) {
            webView.setBackgroundColor(color);
        }
    }

    private void shareText(String text) {
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(intent, "share"));
    }

    private class Bridge {

        @JavascriptInterface
        public void setSystemBars(String colorHex, boolean darkIcons) {
            int color;
            try {
                color = Color.parseColor(colorHex);
            } catch (IllegalArgumentException ignored) {
                return;
            }
            runOnUiThread(() -> applySystemBars(color, darkIcons));
        }

        @JavascriptInterface
        public void share(String text) {
            if (text == null || text.length() > 1200) return;
            runOnUiThread(() -> shareText(text));
        }

        @JavascriptInterface
        public void copy(String text) {
            if (text == null || text.length() > 8000) return;
            runOnUiThread(() -> {
                ClipboardManager clipboard =
                        (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard != null) {
                    clipboard.setPrimaryClip(ClipData.newPlainText("Mochi", text));
                }
            });
        }

        @JavascriptInterface
        public void toast(String text) {
            if (text == null || text.length() > 180) return;
            runOnUiThread(() ->
                    Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show());
        }

        @SuppressLint("MissingPermission")
        @JavascriptInterface
        public void vibrate(int millis) {
            int duration = Math.max(4, Math.min(millis, 60));
            Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(
                        duration, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(duration);
            }
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null || url.length() > 2000) return;
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    /* nothing can open it */
                }
            });
        }

        @JavascriptInterface
        public void requestMic() {
            runOnUiThread(() -> {
                if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                    notifyJs("MochiMicPermission", "granted");
                    return;
                }
                requestPermissions(
                        new String[]{android.Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
            });
        }

        @JavascriptInterface
        public String appVersion() {
            return "2.0";
        }
    }
}
