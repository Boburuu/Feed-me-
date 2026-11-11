package app.feedme.duo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Copie le fichier de l'application installée, pour l'envoyer à quelqu'un (Quick Share, Bluetooth…). */
@CapacitorPlugin(name = "AppShare")
public class AppSharePlugin extends Plugin {
    @PluginMethod
    public void copyApk(PluginCall call) {
        try {
            File source = new File(getContext().getApplicationInfo().sourceDir);
            File target = new File(getContext().getCacheDir(), "feed-me.apk");
            try (InputStream in = new FileInputStream(source); OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            }
            JSObject result = new JSObject();
            result.put("uri", "file://" + target.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Copie de l'application impossible", error);
        }
    }
}
