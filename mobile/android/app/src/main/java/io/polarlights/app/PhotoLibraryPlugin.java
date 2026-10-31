package io.polarlights.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Sky view photos from the web gallery (#99): saved into the phone's photo library in a "Polar Lights"
 * album (Pictures/Polar Lights), or handed to Android's share sheet. Called from the site as
 * Capacitor.Plugins.PhotoLibrary.save / .share with { photos: [{ name, data }] }, data being base64 JPEG;
 * share also takes an optional text, the post to go with the photos.
 */
@CapacitorPlugin(
    name = "PhotoLibrary",
    permissions = {
        // Only Android 9 and older need this; from Android 10 apps add their own photos without it.
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class PhotoLibraryPlugin extends Plugin {

    private static final String ALBUM = "Polar Lights";

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageCallback");
            return;
        }
        saveAll(call);
    }

    @PermissionCallback
    private void storageCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) saveAll(call);
        else call.reject("Permission to save photos was denied", "denied");
    }

    private void saveAll(PluginCall call) {
        JSArray photos = call.getArray("photos");
        if (photos == null || photos.length() == 0) {
            call.reject("No photos", "empty");
            return;
        }
        try {
            for (int i = 0; i < photos.length(); i++) {
                JSONObject p = photos.getJSONObject(i);
                saveOne(p.getString("name"), Base64.decode(p.getString("data"), Base64.DEFAULT));
            }
            JSObject ret = new JSObject();
            ret.put("saved", photos.length());
            call.resolve(ret);
        } catch (JSONException | IOException | IllegalArgumentException e) {
            call.reject("Couldn't save the photo", "failed", e);
        }
    }

    /**
     * A plain file name from the page: letters, digits, dot, dash and underscore only, so a name such as
     * "../../shared_prefs/x" can never point outside the album or share folder.
     */
    private static String safeName(String raw) {
        String base = raw == null ? "" : raw.substring(raw.lastIndexOf('/') + 1).replaceAll("[^A-Za-z0-9._-]", "_");
        while (base.startsWith(".")) base = base.substring(1);
        if (base.isEmpty()) base = "polar-lights-" + System.currentTimeMillis();
        if (base.length() > 80) base = base.substring(base.length() - 80);
        return base.toLowerCase(java.util.Locale.ROOT).endsWith(".jpg") ? base : base + ".jpg";
    }

    /** `file` if it lies directly inside `dir`, else an IOException. */
    private static File inside(File dir, String name) throws IOException {
        File file = new File(dir, safeName(name));
        if (!file.getCanonicalFile().getParentFile().equals(dir.getCanonicalFile())) throw new IOException("Bad file name");
        return file;
    }

    private void saveOne(String name, byte[] jpeg) throws IOException {
        name = safeName(name);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + ALBUM);
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("MediaStore insert failed");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("No output stream");
                out.write(jpeg);
            } catch (IOException e) {
                resolver.delete(uri, null, null);
                throw e;
            }
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ALBUM);
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Couldn't create the album folder");
            File file = inside(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(jpeg);
            }
            MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { "image/jpeg" }, null);
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        JSArray photos = call.getArray("photos");
        if (photos == null || photos.length() == 0) {
            call.reject("No photos", "empty");
            return;
        }
        try {
            // Written to the app's cache (shared through the FileProvider in AndroidManifest.xml).
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Couldn't create the share folder");
            // Photos shared earlier have been handed over already; don't let them pile up in the cache.
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                f.delete();
            ArrayList<Uri> uris = new ArrayList<>();
            for (int i = 0; i < photos.length(); i++) {
                JSONObject p = photos.getJSONObject(i);
                File file = inside(dir, p.getString("name"));
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(Base64.decode(p.getString("data"), Base64.DEFAULT));
                }
                uris.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file));
            }
            Intent send = new Intent(uris.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
            send.setType("image/jpeg");
            // The post to go with it (a caption and link), for the apps that take text with an image.
            String text = call.getString("text");
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            if (uris.size() == 1) send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            else send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, null);
            getActivity().runOnUiThread(() -> getActivity().startActivity(chooser));
            call.resolve();
        } catch (JSONException | IOException | IllegalArgumentException e) {
            call.reject("Couldn't share the photo", "failed", e);
        }
    }
}
