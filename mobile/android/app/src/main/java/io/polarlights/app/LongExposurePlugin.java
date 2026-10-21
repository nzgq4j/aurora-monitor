package io.polarlights.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ExifInterface;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Base64;
import android.util.Range;
import android.util.Size;
import android.view.Surface;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Long exposures for Sky view's night photos. The web view only gets the camera's video (short frames),
 * so this takes one still with the rear camera through Camera2 with a manual exposure (up to the
 * phone's limit), a chosen ISO, focus at infinity and the flash off. Called as
 * Capacitor.Plugins.LongExposure:
 * - capabilities() → { available, maxExposureMs, minIso, maxIso };
 * - capture({ exposureMs, iso }) → { dataUrl, exposureMs, iso } (an upright JPEG, at most 4000 px on the long side).
 * The site stops its own camera stream before calling capture and starts it again afterwards.
 */
@CapacitorPlugin(name = "LongExposure")
public class LongExposurePlugin extends Plugin {

    private static final int MAX_EDGE = 4000;

    private String rearCamera(CameraManager m) throws CameraAccessException {
        for (String id : m.getCameraIdList()) {
            Integer facing = m.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
            if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) return id;
        }
        return null;
    }

    private static boolean manualSensor(CameraCharacteristics c) {
        int[] caps = c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
        if (caps == null) return false;
        for (int cap : caps) if (cap == CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR) return true;
        return false;
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", false);
        try {
            CameraManager m = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            String id = rearCamera(m);
            if (id != null) {
                CameraCharacteristics c = m.getCameraCharacteristics(id);
                Range<Long> exposure = c.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
                Range<Integer> iso = c.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
                if (manualSensor(c) && exposure != null && iso != null) {
                    ret.put("available", true);
                    ret.put("maxExposureMs", exposure.getUpper() / 1_000_000L);
                    ret.put("minIso", iso.getLower());
                    ret.put("maxIso", iso.getUpper());
                }
            }
        } catch (Exception e) {
            // Reported as not available.
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void capture(PluginCall call) {
        HandlerThread thread = new HandlerThread("long-exposure");
        thread.start();
        Handler handler = new Handler(thread.getLooper());
        AtomicBoolean finished = new AtomicBoolean(false);
        final CameraDevice[] device = new CameraDevice[1];
        final ImageReader[] reader = new ImageReader[1];

        Runnable cleanUp = () -> {
            try { if (device[0] != null) device[0].close(); } catch (Exception ignored) { }
            try { if (reader[0] != null) reader[0].close(); } catch (Exception ignored) { }
            thread.quitSafely();
        };
        java.util.function.Consumer<String> fail = message -> {
            if (finished.compareAndSet(false, true)) { call.reject(message, "failed"); cleanUp.run(); }
        };

        try {
            CameraManager m = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            String id = rearCamera(m);
            if (id == null) { call.reject("No rear camera", "unavailable"); thread.quitSafely(); return; }
            CameraCharacteristics c = m.getCameraCharacteristics(id);
            Range<Long> exposureRange = c.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
            Range<Integer> isoRange = c.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
            StreamConfigurationMap map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (!manualSensor(c) || exposureRange == null || isoRange == null || map == null) {
                call.reject("Manual exposure isn't available on this camera", "unavailable");
                thread.quitSafely();
                return;
            }
            long exposureNs = Math.max(exposureRange.getLower(), Math.min(exposureRange.getUpper(), (long) (call.getDouble("exposureMs", 4000.0) * 1_000_000L)));
            int iso = Math.max(isoRange.getLower(), Math.min(isoRange.getUpper(), call.getInt("iso", 1600)));
            Size largest = Collections.max(java.util.Arrays.asList(map.getOutputSizes(ImageFormat.JPEG)),
                (a, b) -> Long.compare((long) a.getWidth() * a.getHeight(), (long) b.getWidth() * b.getHeight()));
            Integer sensorOrientation = c.get(CameraCharacteristics.SENSOR_ORIENTATION);
            Float minFocus = c.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
            int jpegOrientation = jpegOrientation(sensorOrientation == null ? 90 : sensorOrientation);

            reader[0] = ImageReader.newInstance(largest.getWidth(), largest.getHeight(), ImageFormat.JPEG, 1);
            reader[0].setOnImageAvailableListener(r -> {
                if (finished.get()) return;
                try (Image image = r.acquireLatestImage()) {
                    if (image == null) { fail.accept("No image"); return; }
                    ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                    byte[] bytes = new byte[buffer.remaining()];
                    buffer.get(bytes);
                    String data = Base64.encodeToString(normalize(bytes), Base64.NO_WRAP);
                    if (finished.compareAndSet(false, true)) {
                        JSObject ret = new JSObject();
                        ret.put("dataUrl", "data:image/jpeg;base64," + data);
                        ret.put("exposureMs", exposureNs / 1_000_000L);
                        ret.put("iso", iso);
                        call.resolve(ret);
                        cleanUp.run();
                    }
                } catch (Exception e) {
                    fail.accept(e.getMessage() != null ? e.getMessage() : "Couldn't read the photo");
                }
            }, handler);

            // Give up if nothing arrives well after the exposure should have ended.
            handler.postDelayed(() -> fail.accept("The camera didn't return a photo"), exposureNs / 1_000_000L + 15_000L);

            m.openCamera(id, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(@NonNull CameraDevice camera) {
                    device[0] = camera;
                    try {
                        Surface surface = reader[0].getSurface();
                        camera.createCaptureSession(Collections.singletonList(surface), new CameraCaptureSession.StateCallback() {
                            @Override
                            public void onConfigured(@NonNull CameraCaptureSession session) {
                                try {
                                    CaptureRequest.Builder req = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                                    req.addTarget(surface);
                                    req.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
                                    req.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF);
                                    req.set(CaptureRequest.SENSOR_EXPOSURE_TIME, exposureNs);
                                    req.set(CaptureRequest.SENSOR_SENSITIVITY, iso);
                                    req.set(CaptureRequest.SENSOR_FRAME_DURATION, exposureNs);
                                    req.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_OFF);
                                    // Focus at infinity, for the sky, where the lens can be focused by hand.
                                    if (minFocus != null && minFocus > 0f) {
                                        req.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF);
                                        req.set(CaptureRequest.LENS_FOCUS_DISTANCE, 0f);
                                    }
                                    req.set(CaptureRequest.NOISE_REDUCTION_MODE, CameraMetadata.NOISE_REDUCTION_MODE_HIGH_QUALITY);
                                    req.set(CaptureRequest.JPEG_QUALITY, (byte) 92);
                                    req.set(CaptureRequest.JPEG_ORIENTATION, jpegOrientation);
                                    session.capture(req.build(), null, handler);
                                } catch (Exception e) {
                                    fail.accept(e.getMessage() != null ? e.getMessage() : "Couldn't start the exposure");
                                }
                            }

                            @Override
                            public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                                fail.accept("Couldn't set up the camera");
                            }
                        }, handler);
                    } catch (Exception e) {
                        fail.accept(e.getMessage() != null ? e.getMessage() : "Couldn't set up the camera");
                    }
                }

                @Override
                public void onDisconnected(@NonNull CameraDevice camera) {
                    device[0] = camera;
                    fail.accept("The camera was disconnected");
                }

                @Override
                public void onError(@NonNull CameraDevice camera, int error) {
                    device[0] = camera;
                    fail.accept("Camera error " + error);
                }
            }, handler);
        } catch (SecurityException e) {
            call.reject("Camera permission is needed", "denied");
            cleanUp.run();
        } catch (Exception e) {
            fail.accept(e.getMessage() != null ? e.getMessage() : "Camera error");
        }
    }

    /** The JPEG rotation that makes the photo upright for how the phone is held now. */
    private int jpegOrientation(int sensorOrientation) {
        int rotation = Surface.ROTATION_0;
        try { rotation = getActivity().getWindowManager().getDefaultDisplay().getRotation(); } catch (Exception ignored) { }
        int degrees = rotation == Surface.ROTATION_90 ? 90 : rotation == Surface.ROTATION_180 ? 180 : rotation == Surface.ROTATION_270 ? 270 : 0;
        return (sensorOrientation - degrees + 360) % 360;
    }

    /**
     * The photo upright (applying the EXIF rotation many cameras use instead of turning the pixels) and at
     * most MAX_EDGE on the long side, so it passes to the web view quickly and draws the right way up.
     */
    private static byte[] normalize(byte[] jpeg) {
        int rotate = 0;
        try {
            int o = new ExifInterface(new ByteArrayInputStream(jpeg)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            rotate = o == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : o == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : o == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
        } catch (Exception ignored) { }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length, bounds);
        int edge = Math.max(bounds.outWidth, bounds.outHeight);
        if (edge <= MAX_EDGE && rotate == 0) return jpeg;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = 1;
        while (edge / opts.inSampleSize > MAX_EDGE) opts.inSampleSize *= 2;
        Bitmap bmp = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length, opts);
        if (bmp == null) return jpeg;
        if (rotate != 0) {
            Matrix turn = new Matrix();
            turn.postRotate(rotate);
            Bitmap upright = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), turn, true);
            if (upright != bmp) bmp.recycle();
            bmp = upright;
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 92, out);
        bmp.recycle();
        return out.toByteArray();
    }
}
